"""CSV ingestion and the Column Completeness Summary.

Every CSV is parsed as raw text with a fixed comma delimiter so that the header
listing and the completeness summary always agree on how a line is split, and so
that rows with the wrong number of fields fail loudly instead of being absorbed
into a wrong column layout.
"""

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from app.sqlite_storage import (
    ANALYSIS_COLUMN_PREFIX,
    ANALYSIS_TABLE_NAME,
    load_csv_into_database,
    open_analysis_database,
    read_column_names as read_csv_column_names,
)

MISSING_MARKERS_RULES_MESSAGE = (
    "The missing value markers must be a JSON object that maps column names "
    "to lists of marker strings."
)

UNREADABLE_CSV_MESSAGE = "The uploaded file could not be read as a CSV file."


class MissingValueMarkersError(ValueError):
    """Raised when the configured Missing Value markers cannot be applied."""


class NoInputRowsError(ValueError):
    """Raised when a file has a header row but no Input Rows to summarize."""


@dataclass(frozen=True)
class ColumnCompleteness:
    name: str
    present_count: int
    present_share: float
    missing_count: int
    missing_share: float


@dataclass(frozen=True)
class ColumnCompletenessSummary:
    input_rows: int
    columns: list[ColumnCompleteness]


def parse_missing_markers(raw_missing_markers: str | None) -> dict[str, list[str]]:
    """Parse the per-column Missing Value markers sent by the client."""
    if raw_missing_markers is None:
        return {}

    try:
        decoded_markers = json.loads(raw_missing_markers)
    except json.JSONDecodeError as error:
        raise MissingValueMarkersError(MISSING_MARKERS_RULES_MESSAGE) from error

    if not isinstance(decoded_markers, dict):
        raise MissingValueMarkersError(MISSING_MARKERS_RULES_MESSAGE)

    markers_by_column: dict[str, list[str]] = {}
    for column_name, markers in decoded_markers.items():
        if not isinstance(column_name, str):
            raise MissingValueMarkersError(MISSING_MARKERS_RULES_MESSAGE)
        if not isinstance(markers, list):
            raise MissingValueMarkersError(MISSING_MARKERS_RULES_MESSAGE)
        if not all(isinstance(marker, str) for marker in markers):
            raise MissingValueMarkersError(MISSING_MARKERS_RULES_MESSAGE)
        markers_by_column[column_name] = markers

    return markers_by_column


def read_column_names(raw_file_path: Path) -> list[str]:
    return read_csv_column_names(raw_file_path)


def compute_column_completeness(
    raw_file_path: Path,
    database_path: Path,
    missing_markers_by_column: dict[str, list[str]],
) -> ColumnCompletenessSummary:
    """Count Input Rows with a present value for every column of the file."""
    connection = open_analysis_database(database_path)
    try:
        column_names = load_csv_into_database(connection, raw_file_path)
        return summarize_column_completeness(
            connection,
            column_names,
            missing_markers_by_column,
        )
    finally:
        connection.close()


def summarize_column_completeness(
    connection: sqlite3.Connection,
    column_names: list[str],
    missing_markers_by_column: dict[str, list[str]],
) -> ColumnCompletenessSummary:
    """Count Input Rows with a present value per column over one open connection."""
    reject_markers_for_unknown_columns(column_names, missing_markers_by_column)
    register_presence_functions(connection, column_names, missing_markers_by_column)
    query = build_completeness_query(column_names)
    cursor = connection.execute(query)
    result_row = cursor.fetchone()

    input_rows = int(result_row[0])
    if input_rows == 0:
        raise NoInputRowsError("The uploaded file contains a header row but no Input Rows.")

    columns = []
    for column_index, column_name in enumerate(column_names):
        present_count = int(result_row[column_index + 1])
        missing_count = input_rows - present_count
        columns.append(
            ColumnCompleteness(
                name=column_name,
                present_count=present_count,
                present_share=present_count / input_rows,
                missing_count=missing_count,
                missing_share=missing_count / input_rows,
            )
        )

    return ColumnCompletenessSummary(input_rows=input_rows, columns=columns)


def reject_markers_for_unknown_columns(
    column_names: list[str],
    missing_markers_by_column: dict[str, list[str]],
) -> None:
    for column_name in missing_markers_by_column:
        if column_name not in column_names:
            raise MissingValueMarkersError(
                "Missing value markers were configured for a column that is not "
                f"in the file: {column_name!r}."
            )


def build_completeness_query(
    column_names: list[str],
) -> str:
    """Build an aggregate query over generated SQLite column names."""
    select_expressions = ["count(*) AS input_rows"]
    for column_index, _ in enumerate(column_names):
        column_name = sqlite_column_name(column_index)
        present_function = presence_function_name(column_index)
        select_expressions.append(
            f"sum({present_function}({column_name})) AS present_{column_index}"
        )

    return (
        "SELECT "
        + ", ".join(select_expressions)
        + f' FROM "{ANALYSIS_TABLE_NAME}"'
    )


def register_presence_functions(
    connection: sqlite3.Connection,
    column_names: list[str],
    missing_markers_by_column: dict[str, list[str]],
) -> None:
    for column_index, column_name in enumerate(column_names):
        normalized_markers = {
            marker.strip().casefold()
            for marker in missing_markers_by_column.get(column_name, [])
        }

        def is_present(value: str | None, markers: set[str] = normalized_markers) -> int:
            if value is None:
                return 0
            normalized_value = value.strip().casefold()
            return int(normalized_value != "" and normalized_value not in markers)

        connection.create_function(
            presence_function_name(column_index),
            1,
            is_present,
            deterministic=True,
        )


def presence_function_name(column_index: int) -> str:
    return f"patternx_is_present_{column_index}"


def sqlite_column_name(column_index: int) -> str:
    return f'"{ANALYSIS_COLUMN_PREFIX}{column_index}"'
