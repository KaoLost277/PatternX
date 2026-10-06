"""Exact Completeness Pattern summary over user-selected columns.

One entry is reported per distinct Completeness Pattern with the exact number
of Input Rows that share it. The optional Identifier Column is display-only: it
never joins the pattern analysis and never changes row counts, so Input Rows
with repeating identifier values still count separately.

The file is read in batches so that a long analysis can report how far the
grouping has come and notice a cancellation request between batches. Counts
stay exact at every size: every Input Row is tallied exactly once. Alongside the
counts, a small sample of the Input Rows behind every pattern is kept so the UI
can show what one pattern looks like; the samples are capped, the counts never
are.
"""

import json
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import duckdb

from app.completeness import (
    CSV_READ_OPTIONS,
    NoInputRowsError,
    build_present_expression,
    build_working_columns_option,
    collect_marker_parameters,
    reject_markers_for_unknown_columns,
    working_column_name,
)

PRESENT_STATUS = "present"
MISSING_STATUS = "missing"

DEFAULT_ANALYSIS_BATCH_ROWS = 50_000

# A preview keeps a small sample of the Input Rows behind one pattern. These
# caps bound what one analysis holds in memory; the exact counts they accompany
# are never capped. Every pattern keeps its first sample row before any pattern
# keeps a second one.
PREVIEW_ROWS_PER_PATTERN = 5
PREVIEW_FIRST_ROWS_TOTAL_LIMIT = 20_000
PREVIEW_EXTRA_ROWS_TOTAL_LIMIT = 20_000
PREVIEW_VALUE_TEXT_LIMIT = 256

ANALYSIS_COLUMNS_RULES_MESSAGE = (
    "The columns to analyze must be a JSON list of column names from the file."
)
NO_ANALYSIS_COLUMNS_MESSAGE = "Select at least one column to analyze."
CANCELLED_ANALYSIS_MESSAGE = "The analysis was cancelled."


class ColumnSelectionError(ValueError):
    """Raised when the requested Identifier Column or analysis columns cannot be used."""


class AnalysisCancelledError(Exception):
    """Raised when the user cancelled an analysis before it finished."""


@dataclass(frozen=True)
class AnalysisInputs:
    """Everything one analysis needs to compute its summaries."""

    analysis_csv_path: Path
    duckdb_directory: Path
    column_names: list[str]
    missing_markers_by_column: dict[str, list[str]]
    analysis_columns: list[str]
    identifier_column: str | None


@dataclass(frozen=True)
class PreviewRow:
    """One sampled Input Row behind a pattern: identifier text and cell text."""

    identifier_value: str | None
    values: tuple[str | None, ...]


@dataclass(frozen=True)
class CompletenessPattern:
    statuses: tuple[str, ...]
    count: int
    share: float
    preview_rows: tuple[PreviewRow, ...]


@dataclass(frozen=True)
class PatternSummary:
    input_rows: int
    identifier_column: str | None
    analysis_columns: tuple[str, ...]
    patterns: list[CompletenessPattern]


class PatternTally:
    """Exact counts and preview rows collected for every observed pattern.

    Understands the streamed result row: one status per analyzed column first,
    then the cell text of those columns, then the Identifier Column text.
    """

    def __init__(self, analysis_column_count: int, identifier_column: str | None) -> None:
        self.analysis_column_count = analysis_column_count
        self.identifier_column = identifier_column
        self.counts: dict[tuple[str, ...], int] = {}
        self.preview_rows: dict[tuple[str, ...], list[PreviewRow]] = {}
        self.first_preview_rows_kept = 0
        self.extra_preview_rows_kept = 0

    def count_input_row(self, result_row: tuple[object, ...]) -> None:
        statuses = self.statuses_of_row(result_row)
        self.counts[statuses] = self.counts.get(statuses, 0) + 1
        self.keep_preview_row(statuses, result_row)

    def statuses_of_row(self, result_row: tuple[object, ...]) -> tuple[str, ...]:
        statuses = []
        for status_index in range(self.analysis_column_count):
            if int(result_row[status_index]) == 1:
                statuses.append(PRESENT_STATUS)
            else:
                statuses.append(MISSING_STATUS)

        return tuple(statuses)

    def keep_preview_row(self, statuses: tuple[str, ...], result_row: tuple[object, ...]) -> None:
        rows_for_pattern = self.preview_rows.get(statuses, [])
        if len(rows_for_pattern) >= PREVIEW_ROWS_PER_PATTERN:
            return

        if not self.claim_sample_slot(len(rows_for_pattern)):
            return

        rows_for_pattern.append(self.preview_row_of(result_row))
        self.preview_rows[statuses] = rows_for_pattern

    def claim_sample_slot(self, rows_kept_for_pattern: int) -> bool:
        """Reserve one sample slot, so every pattern keeps a row before any keeps a second."""
        if rows_kept_for_pattern == 0:
            if self.first_preview_rows_kept >= PREVIEW_FIRST_ROWS_TOTAL_LIMIT:
                return False
            self.first_preview_rows_kept = self.first_preview_rows_kept + 1
            return True

        if self.extra_preview_rows_kept >= PREVIEW_EXTRA_ROWS_TOTAL_LIMIT:
            return False
        self.extra_preview_rows_kept = self.extra_preview_rows_kept + 1
        return True

    def preview_row_of(self, result_row: tuple[object, ...]) -> PreviewRow:
        cell_values_start = self.analysis_column_count
        cell_values_end = 2 * self.analysis_column_count
        cell_values = tuple(
            shortened_cell_text(cell_value)
            for cell_value in result_row[cell_values_start:cell_values_end]
        )

        if self.identifier_column is not None:
            identifier_value = shortened_cell_text(result_row[cell_values_end])
        else:
            identifier_value = None

        return PreviewRow(identifier_value=identifier_value, values=cell_values)


def parse_analysis_columns(raw_analysis_columns: str | None) -> list[str]:
    """Parse the columns to analyze sent by the client."""
    if raw_analysis_columns is None:
        raise ColumnSelectionError(ANALYSIS_COLUMNS_RULES_MESSAGE)

    try:
        decoded_columns = json.loads(raw_analysis_columns)
    except json.JSONDecodeError as error:
        raise ColumnSelectionError(ANALYSIS_COLUMNS_RULES_MESSAGE) from error

    if not isinstance(decoded_columns, list):
        raise ColumnSelectionError(ANALYSIS_COLUMNS_RULES_MESSAGE)
    if not all(isinstance(column_name, str) for column_name in decoded_columns):
        raise ColumnSelectionError(ANALYSIS_COLUMNS_RULES_MESSAGE)
    if len(decoded_columns) == 0:
        raise ColumnSelectionError(NO_ANALYSIS_COLUMNS_MESSAGE)

    seen_columns: set[str] = set()
    for column_name in decoded_columns:
        if column_name in seen_columns:
            raise ColumnSelectionError(
                f"The column {column_name!r} was selected more than once."
            )
        seen_columns.add(column_name)

    return decoded_columns


def compute_pattern_summary(
    connection: duckdb.DuckDBPyConnection,
    analysis_inputs: AnalysisInputs,
    progress_reporter: Callable[[int, int], None] | None = None,
    cancellation_check: Callable[[], bool] | None = None,
    rows_per_batch: int = DEFAULT_ANALYSIS_BATCH_ROWS,
) -> PatternSummary:
    """Group Input Rows by their Completeness Pattern across the analyzed columns.

    The caller owns the connection, so it can also interrupt the running queries
    when the user cancels the analysis.
    """
    raw_file_path = analysis_inputs.analysis_csv_path
    column_names = analysis_inputs.column_names
    reject_markers_for_unknown_columns(
        column_names,
        analysis_inputs.missing_markers_by_column,
    )
    identifier_column_name = normalize_identifier_column(analysis_inputs.identifier_column)
    analysis_columns = resolve_analysis_columns(
        column_names,
        analysis_inputs.analysis_columns,
        identifier_column_name,
    )

    raise_if_cancelled(cancellation_check)
    input_rows = count_input_rows(connection, raw_file_path, column_names)
    raise_if_cancelled(cancellation_check)
    pattern_tally = tally_pattern_counts(
        connection,
        analysis_inputs,
        column_names,
        analysis_columns,
        identifier_column_name,
        input_rows,
        progress_reporter,
        cancellation_check,
        rows_per_batch,
    )

    return PatternSummary(
        input_rows=input_rows,
        identifier_column=identifier_column_name,
        analysis_columns=tuple(analysis_columns),
        patterns=build_patterns(pattern_tally, input_rows),
    )


def normalize_identifier_column(identifier_column: str | None) -> str | None:
    """Treat an empty Identifier Column selection as designating no column."""
    if identifier_column is None:
        return None
    if identifier_column.strip() == "":
        return None
    return identifier_column


def resolve_analysis_columns(
    column_names: list[str],
    requested_analysis_columns: list[str],
    identifier_column: str | None,
) -> list[str]:
    """Validate the analysis columns and keep the Identifier Column out of them."""
    if identifier_column is not None and identifier_column not in column_names:
        raise ColumnSelectionError(
            "The Identifier Column is not a column of the file: "
            f"{identifier_column!r}."
        )

    analysis_columns = []
    for column_name in requested_analysis_columns:
        if column_name not in column_names:
            raise ColumnSelectionError(
                f"The column {column_name!r} is not a column of the file."
            )
        # The Identifier Column never joins the pattern analysis, so asking for
        # it as an analysis column cannot add it to the summary.
        if column_name == identifier_column:
            continue
        analysis_columns.append(column_name)

    if len(analysis_columns) == 0:
        raise ColumnSelectionError(NO_ANALYSIS_COLUMNS_MESSAGE)

    return analysis_columns


def count_input_rows(
    connection: duckdb.DuckDBPyConnection,
    raw_file_path: Path,
    column_names: list[str],
) -> int:
    """Count the Input Rows of the file before grouping them."""
    query = (
        "SELECT count(*) AS input_rows"
        + f" FROM read_csv(?, {CSV_READ_OPTIONS}, columns = "
        + build_working_columns_option(column_names)
        + ")"
    )
    cursor = connection.execute(query, [str(raw_file_path)])
    input_rows = int(cursor.fetchone()[0])
    if input_rows == 0:
        raise NoInputRowsError("The uploaded file contains a header row but no Input Rows.")

    return input_rows


def tally_pattern_counts(
    connection: duckdb.DuckDBPyConnection,
    analysis_inputs: AnalysisInputs,
    column_names: list[str],
    analysis_columns: list[str],
    identifier_column: str | None,
    input_rows: int,
    progress_reporter: Callable[[int, int], None] | None,
    cancellation_check: Callable[[], bool] | None,
    rows_per_batch: int,
) -> PatternTally:
    """Tally every Input Row into its Completeness Pattern, one batch at a time."""
    query = build_pattern_streaming_query(
        column_names,
        analysis_columns,
        identifier_column,
        analysis_inputs.missing_markers_by_column,
    )
    # Marker values bind first: their placeholders come before the file path
    # placeholder in the query text.
    query_parameters = collect_marker_parameters(
        analysis_columns,
        analysis_inputs.missing_markers_by_column,
    )
    query_parameters.append(str(analysis_inputs.analysis_csv_path))
    cursor = connection.execute(query, query_parameters)

    pattern_tally = PatternTally(
        analysis_column_count=len(analysis_columns),
        identifier_column=identifier_column,
    )
    rows_done = 0
    while True:
        raise_if_cancelled(cancellation_check)
        batch_rows = cursor.fetchmany(rows_per_batch)
        if not batch_rows:
            break

        for result_row in batch_rows:
            pattern_tally.count_input_row(result_row)

        rows_done = rows_done + len(batch_rows)
        report_progress(progress_reporter, rows_done, input_rows)

    return pattern_tally


def build_patterns(pattern_tally: PatternTally, input_rows: int) -> list[CompletenessPattern]:
    """Order patterns by exact count, with a deterministic tie-break on statuses."""
    patterns = []
    for statuses, count in sorted(
        pattern_tally.counts.items(),
        key=lambda item: (-item[1], item[0]),
    ):
        patterns.append(
            CompletenessPattern(
                statuses=statuses,
                count=count,
                share=count / input_rows,
                preview_rows=tuple(pattern_tally.preview_rows.get(statuses, [])),
            )
        )

    return patterns


def shortened_cell_text(cell_value: str | None) -> str | None:
    """Shorten one preview value so a hostile or huge cell stays small."""
    if cell_value is None:
        return None
    if len(cell_value) <= PREVIEW_VALUE_TEXT_LIMIT:
        return cell_value

    return cell_value[:PREVIEW_VALUE_TEXT_LIMIT] + "..."


def report_progress(
    progress_reporter: Callable[[int, int], None] | None,
    rows_done: int,
    rows_total: int,
) -> None:
    if progress_reporter is not None:
        progress_reporter(rows_done, rows_total)


def raise_if_cancelled(cancellation_check: Callable[[], bool] | None) -> None:
    if cancellation_check is not None and cancellation_check():
        raise AnalysisCancelledError(CANCELLED_ANALYSIS_MESSAGE)


def build_pattern_streaming_query(
    column_names: list[str],
    analysis_columns: list[str],
    identifier_column: str | None,
    missing_markers_by_column: dict[str, list[str]],
) -> str:
    """Build the per-row query behind the tally and the previews.

    One status expression per analyzed column comes first, then the cell text of
    those columns for the previews, then the Identifier Column text. The query
    reads the file under generated working column names so that hostile header
    values never take part in building SQL text.
    """
    select_expressions = []
    for status_index, column_name in enumerate(analysis_columns):
        working_name = working_column_name(column_names.index(column_name))
        markers = missing_markers_by_column.get(column_name, [])
        select_expressions.append(
            "CASE WHEN "
            + build_present_expression(working_name, len(markers))
            + f" THEN 1 ELSE 0 END AS status_{status_index}"
        )

    for column_name in analysis_columns:
        select_expressions.append(working_column_name(column_names.index(column_name)))

    if identifier_column is not None:
        select_expressions.append(working_column_name(column_names.index(identifier_column)))

    return (
        "SELECT "
        + ", ".join(select_expressions)
        + f" FROM read_csv(?, {CSV_READ_OPTIONS}, columns = "
        + build_working_columns_option(column_names)
        + ")"
    )
