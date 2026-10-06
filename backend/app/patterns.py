"""Exact Completeness Pattern summary over user-selected columns.

One entry is reported per distinct Completeness Pattern with the exact number
of Input Rows that share it. The optional Identifier Column is display-only: it
never joins the pattern analysis and never changes row counts, so Input Rows
with repeating identifier values still count separately.
"""

import json
from dataclasses import dataclass
from pathlib import Path

import duckdb

from app.completeness import (
    CSV_READ_OPTIONS,
    NoInputRowsError,
    build_present_expression,
    build_working_columns_option,
    collect_marker_parameters,
    read_column_names,
    reject_markers_for_unknown_columns,
    working_column_name,
)

PRESENT_STATUS = "present"
MISSING_STATUS = "missing"

ANALYSIS_COLUMNS_RULES_MESSAGE = (
    "The columns to analyze must be a JSON list of column names from the file."
)
NO_ANALYSIS_COLUMNS_MESSAGE = "Select at least one column to analyze."


class ColumnSelectionError(ValueError):
    """Raised when the requested Identifier Column or analysis columns cannot be used."""


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
    raw_file_path: Path,
    duckdb_directory: Path,
    missing_markers_by_column: dict[str, list[str]],
    requested_analysis_columns: list[str],
    identifier_column: str | None,
) -> PatternSummary:
    """Group Input Rows by their Completeness Pattern across the analyzed columns."""
    column_names = read_column_names(raw_file_path, duckdb_directory)
    reject_markers_for_unknown_columns(column_names, missing_markers_by_column)
    identifier_column_name = normalize_identifier_column(identifier_column)
    analysis_columns = resolve_analysis_columns(
        column_names,
        requested_analysis_columns,
        identifier_column_name,
    )

    connection = duckdb.connect(config={"temp_directory": str(duckdb_directory)})
    try:
        query = build_pattern_query(column_names, analysis_columns, missing_markers_by_column)
        # Marker values bind first: their placeholders come before the file path
        # placeholder in the query text.
        query_parameters = collect_marker_parameters(analysis_columns, missing_markers_by_column)
        query_parameters.append(str(raw_file_path))
        cursor = connection.execute(query, query_parameters)
        result_rows = cursor.fetchall()
    finally:
        connection.close()

    input_rows = sum(int(result_row[-1]) for result_row in result_rows)
    if input_rows == 0:
        raise NoInputRowsError("The uploaded file contains a header row but no Input Rows.")

    patterns = []
    for result_row in result_rows:
        count = int(result_row[-1])
        statuses = []
        for status_index in range(len(analysis_columns)):
            if int(result_row[status_index]) == 1:
                statuses.append(PRESENT_STATUS)
            else:
                statuses.append(MISSING_STATUS)
        patterns.append(
            CompletenessPattern(
                statuses=tuple(statuses),
                count=count,
                share=count / input_rows,
            )
        )

    return PatternSummary(
        input_rows=input_rows,
        identifier_column=identifier_column_name,
        analysis_columns=tuple(analysis_columns),
        patterns=patterns,
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


def build_pattern_query(
    column_names: list[str],
    analysis_columns: list[str],
    missing_markers_by_column: dict[str, list[str]],
) -> str:
    """Build the grouping query over one status expression per analyzed column.

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

    status_names = [f"status_{status_index}" for status_index in range(len(analysis_columns))]
    return (
        "SELECT "
        + ", ".join(status_expressions)
        + ", count(*) AS pattern_count"
        + f" FROM read_csv(?, {CSV_READ_OPTIONS}, columns = "
        + build_working_columns_option(column_names)
        + ")"
        + " GROUP BY "
        + ", ".join(status_names)
        + " ORDER BY pattern_count DESC"
        + (", " + ", ".join(status_names) if status_names else "")
    )
