"""CSV ingestion and the Column Completeness Summary.

Every CSV is parsed as raw text with a fixed comma delimiter so that the header
listing and the completeness summary always agree on how a line is split, and so
that rows with the wrong number of fields fail loudly instead of being absorbed
into a wrong column layout.
"""

import json
from dataclasses import dataclass
from pathlib import Path

import duckdb

CSV_READ_OPTIONS = "header = true, all_varchar = true, delim = ','"

# Values and markers are trimmed with the same expression so that matching rules
# ("trim surrounding whitespace, ignore letter case") cannot drift apart.
SQL_TRIM_EXPRESSION = "regexp_replace({}, '^\\s+|\\s+$', '', 'g')"

MISSING_MARKERS_RULES_MESSAGE = (
    "The missing value markers must be a JSON object that maps column names "
    "to lists of marker strings."
)


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


def read_column_names(raw_file_path: Path, duckdb_directory: Path) -> list[str]:
    connection = duckdb.connect(config={"temp_directory": str(duckdb_directory)})
    try:
        cursor = connection.execute(
            f"SELECT * FROM read_csv(?, {CSV_READ_OPTIONS}) LIMIT 0",
            [str(raw_file_path)],
        )
        column_names = [column_description[0] for column_description in cursor.description]
    finally:
        connection.close()
    return column_names


def compute_column_completeness(
    raw_file_path: Path,
    duckdb_directory: Path,
    missing_markers_by_column: dict[str, list[str]],
) -> ColumnCompletenessSummary:
    """Count Input Rows with a present value for every column of the file."""
    column_names = read_column_names(raw_file_path, duckdb_directory)
    reject_markers_for_unknown_columns(column_names, missing_markers_by_column)

    connection = duckdb.connect(config={"temp_directory": str(duckdb_directory)})
    try:
        query = build_completeness_query(column_names, missing_markers_by_column)
        # Marker values bind first: their placeholders come before the file path
        # placeholder in the query text.
        query_parameters = collect_marker_parameters(column_names, missing_markers_by_column)
        query_parameters.append(str(raw_file_path))
        cursor = connection.execute(query, query_parameters)
        result_row = cursor.fetchone()
    finally:
        connection.close()

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


def collect_marker_parameters(
    column_names: list[str],
    missing_markers_by_column: dict[str, list[str]],
) -> list[str]:
    marker_parameters = []
    for column_name in column_names:
        marker_parameters.extend(missing_markers_by_column.get(column_name, []))
    return marker_parameters


def build_completeness_query(
    column_names: list[str],
    missing_markers_by_column: dict[str, list[str]],
) -> str:
    """Build the aggregate query over one working column per file column.

    The query reads the file under generated working column names so that
    hostile header values never take part in building SQL text.
    """
    select_expressions = ["count(*) AS input_rows"]
    for column_index, column_name in enumerate(column_names):
        working_name = working_column_name(column_index)
        markers = missing_markers_by_column.get(column_name, [])
        select_expressions.append(
            "sum(CASE WHEN "
            + build_present_expression(working_name, len(markers))
            + f" THEN 1 ELSE 0 END) AS present_{column_index}"
        )

    return (
        "SELECT "
        + ", ".join(select_expressions)
        + f" FROM read_csv(?, {CSV_READ_OPTIONS}, columns = "
        + build_working_columns_option(column_names)
        + ")"
    )


def build_present_expression(working_name: str, marker_count: int) -> str:
    trimmed_value = SQL_TRIM_EXPRESSION.format(working_name)
    conditions = [
        f"{working_name} IS NOT NULL",
        f"{trimmed_value} <> ''",
    ]
    if marker_count > 0:
        trimmed_markers = SQL_TRIM_EXPRESSION.format("?")
        marker_placeholders = ", ".join([f"lower({trimmed_markers})"] * marker_count)
        conditions.append(f"lower({trimmed_value}) NOT IN ({marker_placeholders})")

    return " AND ".join(conditions)


def build_working_columns_option(column_names: list[str]) -> str:
    column_type_pairs = []
    for column_index, _ in enumerate(column_names):
        column_type_pairs.append(f"'{working_column_name(column_index)}': 'VARCHAR'")

    return "{" + ", ".join(column_type_pairs) + "}"


def working_column_name(column_index: int) -> str:
    return f"working_column_{column_index}"