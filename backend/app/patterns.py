"""Exact Completeness Pattern summary over user-selected columns.

One entry is reported per distinct Completeness Pattern with the exact number
of Input Rows that share it. The optional Identifier Column is display-only: it
never joins the pattern analysis and never changes row counts, so Input Rows
with repeating identifier values still count separately.

The file is read in batches so that a long analysis can report how far the
grouping has come and notice a cancellation request between batches. Counts
stay exact at every size: every Input Row is tallied exactly once.
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
class CompletenessPattern:
    statuses: tuple[str, ...]
    count: int
    share: float


@dataclass(frozen=True)
class PatternSummary:
    input_rows: int
    identifier_column: str | None
    analysis_columns: tuple[str, ...]
    patterns: list[CompletenessPattern]


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
    pattern_counts = tally_pattern_counts(
        connection,
        analysis_inputs,
        column_names,
        analysis_columns,
        input_rows,
        progress_reporter,
        cancellation_check,
        rows_per_batch,
    )

    return PatternSummary(
        input_rows=input_rows,
        identifier_column=identifier_column_name,
        analysis_columns=tuple(analysis_columns),
        patterns=build_patterns(pattern_counts, input_rows),
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
    input_rows: int,
    progress_reporter: Callable[[int, int], None] | None,
    cancellation_check: Callable[[], bool] | None,
    rows_per_batch: int,
) -> dict[tuple[str, ...], int]:
    """Tally every Input Row into its Completeness Pattern, one batch at a time."""
    query = build_pattern_streaming_query(
        column_names,
        analysis_columns,
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

    pattern_counts: dict[tuple[str, ...], int] = {}
    rows_done = 0
    while True:
        raise_if_cancelled(cancellation_check)
        batch_rows = cursor.fetchmany(rows_per_batch)
        if not batch_rows:
            break

        for result_row in batch_rows:
            statuses = statuses_of_row(result_row, len(analysis_columns))
            pattern_counts[statuses] = pattern_counts.get(statuses, 0) + 1

        rows_done = rows_done + len(batch_rows)
        report_progress(progress_reporter, rows_done, input_rows)

    return pattern_counts


def statuses_of_row(result_row: tuple[object, ...], analysis_column_count: int) -> tuple[str, ...]:
    statuses = []
    for status_index in range(analysis_column_count):
        if int(result_row[status_index]) == 1:
            statuses.append(PRESENT_STATUS)
        else:
            statuses.append(MISSING_STATUS)

    return tuple(statuses)


def build_patterns(
    pattern_counts: dict[tuple[str, ...], int],
    input_rows: int,
) -> list[CompletenessPattern]:
    """Order patterns by exact count, with a deterministic tie-break on statuses."""
    patterns = []
    for statuses, count in sorted(pattern_counts.items(), key=lambda item: (-item[1], item[0])):
        patterns.append(
            CompletenessPattern(
                statuses=statuses,
                count=count,
                share=count / input_rows,
            )
        )

    return patterns


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
    missing_markers_by_column: dict[str, list[str]],
) -> str:
    """Build the per-row status query over one status expression per analyzed column.

    The query reads the file under generated working column names so that
    hostile header values never take part in building SQL text.
    """
    status_expressions = []
    for status_index, column_name in enumerate(analysis_columns):
        working_name = working_column_name(column_names.index(column_name))
        markers = missing_markers_by_column.get(column_name, [])
        status_expressions.append(
            "CASE WHEN "
            + build_present_expression(working_name, len(markers))
            + f" THEN 1 ELSE 0 END AS status_{status_index}"
        )

    return (
        "SELECT "
        + ", ".join(status_expressions)
        + f" FROM read_csv(?, {CSV_READ_OPTIONS}, columns = "
        + build_working_columns_option(column_names)
        + ")"
    )
