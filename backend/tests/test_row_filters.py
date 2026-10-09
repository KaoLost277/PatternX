import json
import sqlite3

import pytest

from app.row_filters import (
    RowFilterColumnError,
    RowFilterRequestError,
    contains_casefolded,
    parse_row_filters,
    register_row_filter_functions,
    row_filter_conditions,
)


def test_contains_filter_ignores_unicode_case_differences():
    assert contains_casefolded("Straße", "STRASSE") == 1


def test_column_filters_match_text_and_missing_values_in_one_sql_query():
    connection = sqlite3.connect(":memory:")
    connection.execute(
        'CREATE TABLE "input_rows" '
        '("input_column_0" TEXT, "input_column_1" TEXT, "input_column_2" TEXT)'
    )
    connection.executemany(
        'INSERT INTO "input_rows" VALUES (?, ?, ?)',
        [
            ("A-1", "North", None),
            ("A-2", "NORTH", "not missing"),
            ("A-3", "South", "not missing"),
        ],
    )
    register_row_filter_functions(connection)

    filters = parse_row_filters(
        json.dumps(
            {
                "Region": {"kind": "contains", "value": "north"},
                "Notes": {"kind": "missing"},
            }
        )
    )
    conditions, parameters = row_filter_conditions(
        filters,
        ["Account ID", "Region", "Notes"],
        lambda _index, column: f"{column} IS NULL",
    )
    result = connection.execute(
        f'SELECT "input_column_0" FROM "input_rows" WHERE {" AND ".join(conditions)}',
        parameters,
    ).fetchall()

    assert result == [("A-1",)]


def test_exact_column_filter_preserves_case_and_surrounding_spaces():
    connection = sqlite3.connect(":memory:")
    connection.execute('CREATE TABLE "input_rows" ("input_column_0" TEXT)')
    connection.executemany(
        'INSERT INTO "input_rows" VALUES (?)',
        [("A",), (" A ",), ("a",)],
    )

    filters = parse_row_filters('{"value":{"kind":"exact","value":" A "}}')
    conditions, parameters = row_filter_conditions(
        filters,
        ["value"],
        lambda _index, column: f"{column} IS NULL",
    )
    result = connection.execute(
        f'SELECT "input_column_0" FROM "input_rows" WHERE {" AND ".join(conditions)}',
        parameters,
    ).fetchall()

    assert result == [(" A ",)]


@pytest.mark.parametrize(
    "filters_json",
    [
        "not json",
        "[]",
        '{"value":{"kind":"contains","value":""}}',
        '{"value":{"kind":"missing","value":"ignored"}}',
        '{"value":{"kind":"unknown","value":"x"}}',
    ],
)
def test_row_filter_parser_rejects_invalid_shapes(filters_json):
    with pytest.raises(RowFilterRequestError):
        parse_row_filters(filters_json)


def test_row_filter_conditions_reject_unknown_source_columns():
    filters = parse_row_filters('{"unavailable":{"kind":"missing"}}')

    with pytest.raises(RowFilterColumnError):
        row_filter_conditions(filters, ["value"], lambda _index, column: f"{column} IS NULL")
