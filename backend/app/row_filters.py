import json
import sqlite3
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import TypeAlias

from app.completeness import sqlite_column_name

ROW_FILTER_CONTAINS_FUNCTION = "patternx_row_value_contains"


@dataclass(frozen=True)
class ContainsColumnFilter:
    value: str


@dataclass(frozen=True)
class ExactColumnFilter:
    value: str


@dataclass(frozen=True)
class MissingColumnFilter:
    pass


ColumnFilter: TypeAlias = (
    ContainsColumnFilter | ExactColumnFilter | MissingColumnFilter
)
ColumnFilters: TypeAlias = Mapping[str, ColumnFilter]
MissingValuePredicate: TypeAlias = Callable[[int, str], str]


class RowFilterRequestError(ValueError):
    pass


class RowFilterColumnError(ValueError):
    pass


def parse_row_filters(filters_json: str | None) -> dict[str, ColumnFilter]:
    if filters_json is None:
        return {}

    try:
        unparsed_filters = json.loads(filters_json)
    except json.JSONDecodeError as error:
        raise RowFilterRequestError("The column filters could not be read.") from error

    if not isinstance(unparsed_filters, dict):
        raise RowFilterRequestError("Column filters must be an object keyed by column name.")

    filters: dict[str, ColumnFilter] = {}
    for column_name, filter_data in unparsed_filters.items():
        if not isinstance(column_name, str):
            raise RowFilterRequestError("Each column filter must have a column name.")
        if not isinstance(filter_data, dict):
            raise RowFilterRequestError(f"The filter for {column_name!r} is invalid.")

        filter_kind = filter_data.get("kind")
        if filter_kind in ("contains", "exact"):
            if set(filter_data) != {"kind", "value"}:
                raise RowFilterRequestError(f"The filter for {column_name!r} is invalid.")
            value = filter_data["value"]
            if not isinstance(value, str) or value == "":
                raise RowFilterRequestError(
                    f"The filter value for {column_name!r} must not be empty."
                )
            if filter_kind == "contains":
                filters[column_name] = ContainsColumnFilter(value)
            else:
                filters[column_name] = ExactColumnFilter(value)
        elif filter_kind == "missing" and set(filter_data) == {"kind"}:
            filters[column_name] = MissingColumnFilter()
        else:
            raise RowFilterRequestError(f"The filter for {column_name!r} is invalid.")

    return filters


def row_filter_conditions(
    filters: ColumnFilters,
    source_columns: Sequence[str],
    missing_value_predicate: MissingValuePredicate,
) -> tuple[list[str], list[object]]:
    source_column_indexes = {
        column_name: column_index
        for column_index, column_name in enumerate(source_columns)
    }
    conditions: list[str] = []
    parameters: list[object] = []

    for column_name, column_filter in filters.items():
        column_index = source_column_indexes.get(column_name)
        if column_index is None:
            raise RowFilterColumnError(
                f"The column {column_name!r} is not available in these Input Rows."
            )

        sqlite_column = sqlite_column_name(column_index)
        if isinstance(column_filter, ContainsColumnFilter):
            conditions.append(
                f"{ROW_FILTER_CONTAINS_FUNCTION}({sqlite_column}, ?) = 1"
            )
            parameters.append(column_filter.value)
        elif isinstance(column_filter, ExactColumnFilter):
            conditions.append(f"{sqlite_column} IS ?")
            parameters.append(column_filter.value)
        elif isinstance(column_filter, MissingColumnFilter):
            conditions.append(missing_value_predicate(column_index, sqlite_column))

    return conditions, parameters


def register_row_filter_functions(connection: sqlite3.Connection) -> None:
    connection.create_function(
        ROW_FILTER_CONTAINS_FUNCTION,
        2,
        contains_casefolded,
        deterministic=True,
    )


def contains_casefolded(value: str | None, search_value: str) -> int:
    if value is None:
        return 0
    return int(search_value.casefold() in value.casefold())
