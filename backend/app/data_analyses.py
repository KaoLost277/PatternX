"""Exact term and value-group summaries over selected input columns."""

import re
import sqlite3
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from app.completeness import NoInputRowsError, reject_markers_for_unknown_columns, sqlite_column_name
from app.patterns import AnalysisCancelledError, raise_if_cancelled
from app.sqlite_storage import ANALYSIS_TABLE_NAME

VALUE_FUNCTION_PREFIX = "patternx_group_value_"
FORMAT_FUNCTION_PREFIX = "patternx_format_pattern_"
DEFAULT_GROUPING_BATCH_ROWS = 1_000
DEFAULT_TERMS_BATCH_ROWS = 1_000

_DIGIT_RUN = re.compile(r"[0-9]+")


class DataAnalysisSelectionError(ValueError):
    """Raised when selected columns cannot be used for a value analysis."""


@dataclass(frozen=True)
class DataAnalysisInputs:
    analysis_csv_path: Path
    database_path: Path
    column_names: list[str]
    selected_columns: list[str]
    missing_markers_by_column: dict[str, list[str]]


@dataclass(frozen=True)
class DataTerm:
    value: str | None
    count: int
    share: float


@dataclass(frozen=True)
class DataFormatPattern:
    pattern: str
    occurrence_count: int
    distinct_term_count: int
    share: float


@dataclass(frozen=True)
class FormalColumnTerms:
    name: str
    terms: list[DataTerm]
    format_patterns: list[DataFormatPattern]


@dataclass(frozen=True)
class FormalTermsSummary:
    input_rows: int
    selected_columns: tuple[str, ...]
    columns: list[FormalColumnTerms]


@dataclass(frozen=True)
class DataGroup:
    values: tuple[str | None, ...]
    count: int
    share: float


@dataclass(frozen=True)
class GroupDataKeyUniqueness:
    distinct_key_count: int
    singleton_key_count: int
    repeated_key_count: int
    input_rows_in_repeated_key_groups: int
    singleton_key_share: float


@dataclass(frozen=True)
class GroupDataSummary:
    input_rows: int
    selected_columns: tuple[str, ...]
    groups: list[DataGroup]
    key_uniqueness: GroupDataKeyUniqueness


DataAnalysisSummary = FormalTermsSummary | GroupDataSummary


def resolve_data_analysis_columns(
    column_names: list[str],
    requested_columns: list[str],
) -> list[str]:
    """Validate a non-empty, unique, ordered selection of source columns."""
    if not requested_columns:
        raise DataAnalysisSelectionError("Select at least one column to analyze.")

    selected_columns: list[str] = []
    seen_columns: set[str] = set()
    for column_name in requested_columns:
        if column_name in seen_columns:
            raise DataAnalysisSelectionError(
                f"The column {column_name!r} was selected more than once."
            )
        if column_name not in column_names:
            raise DataAnalysisSelectionError(
                f"The column {column_name!r} is not a column of the file."
            )
        seen_columns.add(column_name)
        selected_columns.append(column_name)

    return selected_columns


def count_data_input_rows(connection: sqlite3.Connection) -> int:
    result = connection.execute(f'SELECT count(*) FROM "{ANALYSIS_TABLE_NAME}"').fetchone()
    input_rows = int(result[0])
    if input_rows == 0:
        raise NoInputRowsError("The uploaded file contains a header row but no Input Rows.")

    return input_rows


def normalize_data_value(
    value: str | None,
    normalized_markers: set[str],
) -> str | None:
    """Map Missing Values to one key while preserving every other raw string."""
    if value is None:
        return None

    marker_comparison_value = value.strip().casefold()
    if marker_comparison_value == "" or marker_comparison_value in normalized_markers:
        return None

    return value


def structural_format_pattern(value: str | None) -> str | None:
    """Replace each ASCII digit run by its width, retaining all literal text."""
    if value is None or _DIGIT_RUN.search(value) is None:
        return None

    pattern_parts: list[str] = []
    previous_end = 0
    for digit_run in _DIGIT_RUN.finditer(value):
        pattern_parts.append(value[previous_end : digit_run.start()])
        pattern_parts.append(f"<{len(digit_run.group())} digits>")
        previous_end = digit_run.end()
    pattern_parts.append(value[previous_end:])
    return "".join(pattern_parts)


def value_function_name(column_index: int) -> str:
    return f"{VALUE_FUNCTION_PREFIX}{column_index}"


def format_function_name(column_index: int) -> str:
    return f"{FORMAT_FUNCTION_PREFIX}{column_index}"


def register_data_value_functions(
    connection: sqlite3.Connection,
    column_names: list[str],
    missing_markers_by_column: dict[str, list[str]],
) -> None:
    """Register exact-value keys and structural formats for selected columns."""
    reject_markers_for_unknown_columns(column_names, missing_markers_by_column)
    for column_index, column_name in enumerate(column_names):
        normalized_markers = {
            marker.strip().casefold()
            for marker in missing_markers_by_column.get(column_name, [])
        }

        def value_key(
            value: str | None,
            markers: set[str] = normalized_markers,
        ) -> str | None:
            return normalize_data_value(value, markers)

        def format_key(
            value: str | None,
            markers: set[str] = normalized_markers,
        ) -> str | None:
            normalized_value = normalize_data_value(value, markers)
            return structural_format_pattern(normalized_value)

        connection.create_function(
            value_function_name(column_index),
            1,
            value_key,
            deterministic=True,
        )
        connection.create_function(
            format_function_name(column_index),
            1,
            format_key,
            deterministic=True,
        )


def compute_formal_terms(
    connection: sqlite3.Connection,
    column_names: list[str],
    selected_columns: list[str],
    missing_markers_by_column: dict[str, list[str]],
    progress_reporter: Callable[[int, int], None] | None = None,
    cancellation_check: Callable[[], bool] | None = None,
) -> FormalTermsSummary:
    """Count exact terms and repeated structural formats for each selected column."""
    reject_markers_for_unknown_columns(column_names, missing_markers_by_column)
    selected_columns = resolve_data_analysis_columns(column_names, selected_columns)
    register_data_value_functions(connection, column_names, missing_markers_by_column)
    input_rows = count_data_input_rows(connection)
    column_results: list[FormalColumnTerms] = []
    total_selected_values = input_rows * len(selected_columns)
    values_counted_across_columns = 0

    for selected_index, column_name in enumerate(selected_columns):
        raise_if_cancelled(cancellation_check)
        column_index = column_names.index(column_name)
        column_expression = f"{value_function_name(column_index)}({sqlite_column_name(column_index)})"
        query = (
            f"SELECT {column_expression}, count(*) FROM \"{ANALYSIS_TABLE_NAME}\" "
            f"GROUP BY {column_expression} "
            f"ORDER BY count(*) DESC, ({column_expression}) IS NOT NULL ASC, "
            f"{column_expression} COLLATE BINARY ASC"
        )
        cursor = connection.execute(query)
        terms: list[DataTerm] = []
        pattern_counts: dict[str, list[int]] = {}
        while True:
            raise_if_cancelled(cancellation_check)
            result_batch = cursor.fetchmany(DEFAULT_TERMS_BATCH_ROWS)
            if not result_batch:
                break

            for value, raw_count in result_batch:
                count = int(raw_count)
                term_value = None if value is None else str(value)
                terms.append(DataTerm(value=term_value, count=count, share=count / input_rows))
                values_counted_across_columns += count

                format_pattern = structural_format_pattern(term_value)
                if format_pattern is not None:
                    pattern_counts.setdefault(format_pattern, [0, 0])
                    pattern_counts[format_pattern][0] += count
                    pattern_counts[format_pattern][1] += 1

            if progress_reporter is not None:
                progress_reporter(values_counted_across_columns, total_selected_values)

        format_patterns = [
            DataFormatPattern(
                pattern=pattern,
                occurrence_count=counts[0],
                distinct_term_count=counts[1],
                share=counts[0] / input_rows,
            )
            for pattern, counts in pattern_counts.items()
            if counts[1] >= 2
        ]
        format_patterns.sort(key=lambda item: (-item.occurrence_count, item.pattern))
        column_results.append(
            FormalColumnTerms(
                name=column_name,
                terms=terms,
                format_patterns=format_patterns,
            )
        )

    return FormalTermsSummary(
        input_rows=input_rows,
        selected_columns=tuple(selected_columns),
        columns=column_results,
    )


def compute_group_data(
    connection: sqlite3.Connection,
    column_names: list[str],
    selected_columns: list[str],
    missing_markers_by_column: dict[str, list[str]],
    progress_reporter: Callable[[int, int], None] | None = None,
    cancellation_check: Callable[[], bool] | None = None,
) -> GroupDataSummary:
    """Group Input Rows by observed tuples of exact values in selected columns."""
    reject_markers_for_unknown_columns(column_names, missing_markers_by_column)
    selected_columns = resolve_data_analysis_columns(column_names, selected_columns)
    register_data_value_functions(connection, column_names, missing_markers_by_column)
    input_rows = count_data_input_rows(connection)

    selected_expressions = []
    for column_name in selected_columns:
        column_index = column_names.index(column_name)
        value_expression = (
            f"{value_function_name(column_index)}({sqlite_column_name(column_index)})"
        )
        selected_expressions.append(value_expression)

    selected_expression_sql = ", ".join(selected_expressions)
    ordering_expressions = ["count(*) DESC"]
    for value_expression in selected_expressions:
        ordering_expressions.extend(
            [
                f"({value_expression}) IS NOT NULL ASC",
                f"{value_expression} COLLATE BINARY ASC",
            ]
        )

    query = (
        f"SELECT {selected_expression_sql}, count(*) FROM \"{ANALYSIS_TABLE_NAME}\" "
        f"GROUP BY {selected_expression_sql} "
        f"ORDER BY {', '.join(ordering_expressions)}"
    )
    cursor = connection.execute(query)
    groups: list[DataGroup] = []
    rows_counted = 0
    distinct_key_count = 0
    singleton_key_count = 0
    repeated_key_count = 0
    input_rows_in_repeated_key_groups = 0

    while True:
        raise_if_cancelled(cancellation_check)
        result_batch = cursor.fetchmany(DEFAULT_GROUPING_BATCH_ROWS)
        if not result_batch:
            break

        for result_row in result_batch:
            values = tuple(None if value is None else str(value) for value in result_row[:-1])
            count = int(result_row[-1])
            groups.append(DataGroup(values=values, count=count, share=count / input_rows))
            rows_counted += count
            distinct_key_count += 1
            if count == 1:
                singleton_key_count += 1
            elif count > 1:
                repeated_key_count += 1
                input_rows_in_repeated_key_groups += count

        if progress_reporter is not None:
            progress_reporter(rows_counted, input_rows)

    key_uniqueness = GroupDataKeyUniqueness(
        distinct_key_count=distinct_key_count,
        singleton_key_count=singleton_key_count,
        repeated_key_count=repeated_key_count,
        input_rows_in_repeated_key_groups=input_rows_in_repeated_key_groups,
        singleton_key_share=singleton_key_count / distinct_key_count,
    )

    return GroupDataSummary(
        input_rows=input_rows,
        selected_columns=tuple(selected_columns),
        groups=groups,
        key_uniqueness=key_uniqueness,
    )
