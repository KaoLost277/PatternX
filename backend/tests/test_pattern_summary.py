import csv
import io
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from support import assert_no_working_files_left, make_test_client

client = TestClient(app)

# Deterministic fixture: hand-checkable pattern counts over three analyzed
# columns, duplicate identifier values, a whitespace-only value, empty values,
# and zero as a present value.
PATTERN_FIXTURE = (
    b"record_id,email,phone,amount\n"
    b"A1,alice@example.com,555-0100,0\n"
    b"A1,,555-0101,10\n"
    b"A2,bob@example.com,,5\n"
    b"A1,,555-0102,0\n"
    b'A3,"  ",555-0103,7\n'
    b"A2,carol@example.com,555-0104,\n"
)


def reference_pattern_summary(
    csv_bytes,
    missing_markers_by_column,
    identifier_column,
    analysis_columns,
):
    """Reference result computed with plain Python, independently of the service.

    The rules come straight from the product definition: each parsed row is one
    Input Row, the Identifier Column never joins the pattern analysis, and a
    Completeness Pattern is the combination of present and missing statuses
    across the analyzed columns. Rows sharing a pattern form one entry with the
    exact count of those rows.
    """
    parsed_rows = list(csv.reader(io.StringIO(csv_bytes.decode("utf-8"))))
    header_names = parsed_rows[0]
    input_rows = []
    for parsed_row in parsed_rows[1:]:
        # A line without any field is not a record and thus not an Input Row.
        if not parsed_row and len(header_names) > 1:
            continue
        input_rows.append(parsed_row)

    analyzed_columns = [name for name in analysis_columns if name != identifier_column]

    pattern_counts = {}
    for input_row in input_rows:
        statuses = []
        for column_name in analyzed_columns:
            column_index = header_names.index(column_name)
            if column_index < len(input_row):
                value = input_row[column_index]
            else:
                value = ""
            statuses.append(status_of(value, missing_markers_by_column.get(column_name, [])))
        statuses_key = tuple(statuses)
        pattern_counts[statuses_key] = pattern_counts.get(statuses_key, 0) + 1

    patterns = []
    for statuses_key, count in sorted(pattern_counts.items(), key=lambda item: (-item[1], item[0])):
        patterns.append(
            {
                "statuses": list(statuses_key),
                "count": count,
                "share": count / len(input_rows),
            }
        )

    return {
        "input_rows": len(input_rows),
        "identifier_column": identifier_column,
        "analysis_columns": analyzed_columns,
        "patterns": patterns,
    }


def status_of(value, markers):
    trimmed_value = value.strip()
    trimmed_markers = {marker.strip().lower() for marker in markers}
    if trimmed_value == "":
        return "missing"
    if trimmed_value.lower() in trimmed_markers:
        return "missing"
    return "present"


def request_pattern_summary(
    test_client,
    csv_bytes,
    analysis_columns,
    missing_markers_by_column=None,
    identifier_column=None,
    file_name="data.csv",
):
    form_fields = {"analysis_columns": json.dumps(analysis_columns)}
    if missing_markers_by_column is not None:
        form_fields["missing_markers"] = json.dumps(missing_markers_by_column)
    if identifier_column is not None:
        form_fields["identifier_column"] = identifier_column

    return test_client.post(
        "/api/pattern-summary",
        files={"file": (file_name, csv_bytes, "text/csv")},
        data=form_fields,
    )


def assert_matches_reference(
    response_json,
    csv_bytes,
    missing_markers_by_column,
    identifier_column,
    analysis_columns,
):
    expected = reference_pattern_summary(
        csv_bytes,
        missing_markers_by_column,
        identifier_column,
        analysis_columns,
    )

    assert response_json["input_rows"] == expected["input_rows"]
    assert response_json["identifier_column"] == expected["identifier_column"]
    assert response_json["analysis_columns"] == expected["analysis_columns"]
    assert response_json["patterns"] == expected["patterns"]


def test_pattern_summary_matches_independent_reference_on_deterministic_fixture():
    missing_markers_by_column = {"email": ["unknown"], "amount": ["-"]}

    response = request_pattern_summary(
        client,
        PATTERN_FIXTURE,
        ["email", "phone", "amount"],
        missing_markers_by_column,
        identifier_column="record_id",
    )

    assert response.status_code == 200
    assert_matches_reference(
        response.json(),
        PATTERN_FIXTURE,
        missing_markers_by_column,
        "record_id",
        ["email", "phone", "amount"],
    )


def test_input_rows_sharing_a_pattern_are_grouped_into_a_single_entry():
    response = request_pattern_summary(
        client,
        PATTERN_FIXTURE,
        ["email", "phone", "amount"],
        identifier_column="record_id",
    )

    assert response.status_code == 200
    patterns = response.json()["patterns"]
    statuses_entries = [tuple(pattern["statuses"]) for pattern in patterns]

    # Three rows miss only the email value; they share one pattern entry.
    assert statuses_entries.count(("missing", "present", "present")) == 1
    shared_entry = patterns[statuses_entries.index(("missing", "present", "present"))]
    assert shared_entry["count"] == 3
    assert shared_entry["share"] == pytest.approx(0.5)

    # Every distinct pattern appears exactly once, and the counts cover all rows.
    assert len(statuses_entries) == len(set(statuses_entries))
    assert len(patterns) == 4
    assert sum(pattern["count"] for pattern in patterns) == response.json()["input_rows"]
    for pattern in patterns:
        assert pattern["share"] == pytest.approx(pattern["count"] / response.json()["input_rows"])


def test_identifier_column_never_joins_the_analysis_and_never_changes_row_counts():
    analysis_columns = ["email", "phone"]

    response = request_pattern_summary(
        client,
        PATTERN_FIXTURE,
        analysis_columns,
        identifier_column="record_id",
    )

    assert response.status_code == 200
    response_json = response.json()

    # The Identifier Column is display-only and stays out of the analysis.
    assert response_json["identifier_column"] == "record_id"
    assert response_json["analysis_columns"] == analysis_columns

    # Repeating identifier values do not merge Input Rows: the six rows of the
    # file, including the three A1 rows and the two A2 rows, are all counted.
    assert response_json["input_rows"] == 6
    assert sum(pattern["count"] for pattern in response_json["patterns"]) == 6

    assert_matches_reference(
        response_json,
        PATTERN_FIXTURE,
        {},
        "record_id",
        analysis_columns,
    )


def test_identifier_column_requested_as_an_analysis_column_stays_out_of_the_analysis():
    response = request_pattern_summary(
        client,
        PATTERN_FIXTURE,
        ["record_id", "email"],
        identifier_column="record_id",
    )

    assert response.status_code == 200
    assert response.json()["analysis_columns"] == ["email"]
    assert all(len(pattern["statuses"]) == 1 for pattern in response.json()["patterns"])
    assert_matches_reference(
        response.json(),
        PATTERN_FIXTURE,
        {},
        "record_id",
        ["record_id", "email"],
    )


def test_no_identifier_column_is_reported_when_none_is_designated():
    response = request_pattern_summary(client, PATTERN_FIXTURE, ["email"])

    assert response.status_code == 200
    assert response.json()["identifier_column"] is None
    assert response.json()["analysis_columns"] == ["email"]


def test_default_missing_rules_apply_to_pattern_statuses():
    # Null, empty, and whitespace-only values are missing; zero is present.
    csv_bytes = (
        b"name,amount\n"
        b",0\n"
        b'"   ",1\n'
        b'"",2\n'
        b"Ada,3\n"
    )

    response = request_pattern_summary(client, csv_bytes, ["name", "amount"])

    assert response.status_code == 200
    assert response.json()["patterns"] == [
        {"statuses": ["missing", "present"], "count": 3, "share": 0.75},
        {"statuses": ["present", "present"], "count": 1, "share": 0.25},
    ]


def test_custom_markers_match_after_trimming_and_without_case():
    csv_bytes = (
        b"value,other\n"
        b'" N/A ",x\n'
        b"n/a,\n"
        b"N/A,x\n"
        b"kept,x\n"
    )

    response = request_pattern_summary(client, csv_bytes, ["value", "other"], {"value": ["  n/A  "]})

    assert response.status_code == 200
    assert response.json()["patterns"] == [
        {"statuses": ["missing", "present"], "count": 2, "share": 0.5},
        {"statuses": ["missing", "missing"], "count": 1, "share": 0.25},
        {"statuses": ["present", "present"], "count": 1, "share": 0.25},
    ]


def test_zero_is_present_unless_configured_as_a_marker():
    csv_bytes = b"amount,tally\n0,1\n1,2\n0,3\n"

    default_response = request_pattern_summary(client, csv_bytes, ["amount", "tally"])
    marker_response = request_pattern_summary(
        client, csv_bytes, ["amount", "tally"], {"amount": ["0"]}
    )

    assert default_response.status_code == 200
    assert default_response.json()["patterns"] == [
        {"statuses": ["present", "present"], "count": 3, "share": 1.0},
    ]

    assert marker_response.status_code == 200
    assert marker_response.json()["patterns"] == [
        {"statuses": ["missing", "present"], "count": 2, "share": 2 / 3},
        {"statuses": ["present", "present"], "count": 1, "share": 1 / 3},
    ]


def test_patterns_with_equal_counts_are_ordered_deterministically():
    csv_bytes = (
        b"a,b\n"
        b",1\n"
        b"1,\n"
        b"x,y\n"
    )

    response = request_pattern_summary(client, csv_bytes, ["a", "b"])

    assert response.status_code == 200
    assert response.json()["patterns"] == [
        {"statuses": ["missing", "present"], "count": 1, "share": 1 / 3},
        {"statuses": ["present", "missing"], "count": 1, "share": 1 / 3},
        {"statuses": ["present", "present"], "count": 1, "share": 1 / 3},
    ]


def test_pattern_summary_reports_columns_in_the_requested_order():
    response = request_pattern_summary(
        client,
        PATTERN_FIXTURE,
        ["amount", "email"],
        identifier_column="record_id",
    )

    assert response.status_code == 200
    assert response.json()["analysis_columns"] == ["amount", "email"]
    assert_matches_reference(
        response.json(),
        PATTERN_FIXTURE,
        {},
        "record_id",
        ["amount", "email"],
    )


def test_hostile_column_names_are_returned_verbatim_as_json_text():
    csv_bytes = b"<script>alert('x')</script>,notes\n1,hello\n"

    response = request_pattern_summary(
        client,
        csv_bytes,
        ["<script>alert('x')</script>", "notes"],
        file_name="hostile.csv",
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["analysis_columns"] == ["<script>alert('x')</script>", "notes"]


def test_summary_rejects_a_missing_analysis_columns_field():
    response = client.post(
        "/api/pattern-summary",
        files={"file": ("data.csv", PATTERN_FIXTURE, "text/csv")},
    )

    assert response.status_code == 400
    assert "columns to analyze" in response.json()["detail"].lower()


def test_summary_rejects_analysis_columns_that_are_not_a_list_of_strings():
    not_a_list_response = client.post(
        "/api/pattern-summary",
        files={"file": ("data.csv", PATTERN_FIXTURE, "text/csv")},
        data={"analysis_columns": '{"email": true}'},
    )
    not_strings_response = client.post(
        "/api/pattern-summary",
        files={"file": ("data.csv", PATTERN_FIXTURE, "text/csv")},
        data={"analysis_columns": '["email", 3]'},
    )

    assert not_a_list_response.status_code == 400
    assert "columns to analyze" in not_a_list_response.json()["detail"].lower()
    assert not_strings_response.status_code == 400
    assert "columns to analyze" in not_strings_response.json()["detail"].lower()


def test_summary_rejects_an_empty_list_of_analysis_columns():
    response = request_pattern_summary(client, PATTERN_FIXTURE, [])

    assert response.status_code == 400
    assert "at least one column" in response.json()["detail"].lower()


def test_summary_rejects_analysis_columns_that_are_not_in_the_file():
    response = request_pattern_summary(client, PATTERN_FIXTURE, ["email", "nickname"])

    assert response.status_code == 400
    assert "nickname" in response.json()["detail"]


def test_summary_rejects_an_analysis_column_selected_more_than_once():
    response = request_pattern_summary(client, PATTERN_FIXTURE, ["email", "email"])

    assert response.status_code == 400
    assert "email" in response.json()["detail"]
    assert "more than once" in response.json()["detail"].lower()


def test_summary_rejects_an_identifier_column_that_is_not_in_the_file():
    response = request_pattern_summary(
        client,
        PATTERN_FIXTURE,
        ["email"],
        identifier_column="nickname",
    )

    assert response.status_code == 400
    assert "nickname" in response.json()["detail"]


def test_summary_rejects_a_selection_that_leaves_no_column_to_analyze():
    response = request_pattern_summary(
        client,
        PATTERN_FIXTURE,
        ["record_id"],
        identifier_column="record_id",
    )

    assert response.status_code == 400
    assert "at least one column" in response.json()["detail"].lower()


def test_summary_rejects_missing_markers_for_unknown_columns_with_clear_error():
    response = request_pattern_summary(
        client,
        PATTERN_FIXTURE,
        ["email"],
        {"nickname": ["n/a"]},
    )

    assert response.status_code == 400
    assert "nickname" in response.json()["detail"]


def test_summary_rejects_empty_header_only_malformed_and_unsupported_files():
    empty_response = request_pattern_summary(client, b"", [], file_name="empty.csv")
    header_only_response = request_pattern_summary(
        client, b"name,amount\n", ["name"], file_name="header-only.csv"
    )
    malformed_response = request_pattern_summary(
        client, b"name,amount\nAda,1\nBob\n", ["name"], file_name="broken.csv"
    )
    unsupported_response = request_pattern_summary(
        client, b"PK\x03\x04not-a-csv", ["name"], file_name="workbook.xlsx"
    )

    assert empty_response.status_code == 400
    assert "empty" in empty_response.json()["detail"].lower()
    assert header_only_response.status_code == 400
    assert "input rows" in header_only_response.json()["detail"].lower()
    assert malformed_response.status_code == 400
    assert "csv" in malformed_response.json()["detail"].lower()
    assert unsupported_response.status_code == 415
    assert "csv" in unsupported_response.json()["detail"].lower()


def test_each_request_reports_the_summary_of_the_uploaded_file_only():
    other_fixture = b"record_id,name\nA,x\nA,\n"

    first_response = request_pattern_summary(
        client,
        PATTERN_FIXTURE,
        ["email"],
        identifier_column="record_id",
    )
    second_response = request_pattern_summary(
        client,
        other_fixture,
        ["name"],
        identifier_column="record_id",
    )

    assert first_response.status_code == 200
    assert first_response.json()["input_rows"] == 6
    assert second_response.status_code == 200
    assert second_response.json()["input_rows"] == 2
    assert_matches_reference(second_response.json(), other_fixture, {}, "record_id", ["name"])


def test_successful_summary_leaves_no_working_files_behind(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)

    response = request_pattern_summary(
        test_client,
        PATTERN_FIXTURE,
        ["email", "phone"],
        identifier_column="record_id",
    )

    assert response.status_code == 200
    assert_no_working_files_left(work_directory)


def test_failed_summary_leaves_no_working_files_behind(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)

    response = request_pattern_summary(test_client, PATTERN_FIXTURE, ["nickname"])

    assert response.status_code == 400
    assert_no_working_files_left(work_directory)
