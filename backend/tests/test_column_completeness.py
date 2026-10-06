import csv
import io
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from support import assert_no_working_files_left, make_test_client

client = TestClient(app)

# Deterministic fixture: hand-checkable counts, quoted and unquoted whitespace,
# empty fields, zero values, and duplicate identifier values.
COMPLETENESS_FIXTURE = (
    b"id,email,phone,amount,notes\n"
    b"1,alice@example.com,555-0100,0,ok\n"
    b"2,,555-0101,0,N/A\n"
    b'3,bob@example.com,,5,"  -  "\n'
    b'4," n/a ",555-0103,7,\n'
    b"5,alice@example.com,555-0104,0,hello\n"
)

DEFAULT_RULES_FIXTURE = (
    b"name,amount\n"
    b",0\n"
    b'"   ",1\n'
    b'"",2\n'
    b"Ada,3\n"
)

CUSTOM_MARKER_FIXTURE = (
    b"value\n"
    b'" N/A "\n'
    b"n/a\n"
    b"N/A\n"
    b"kept\n"
)

ZERO_AS_MARKER_FIXTURE = (
    b"amount\n"
    b"0\n"
    b"1\n"
    b"0\n"
)

DUPLICATE_IDENTIFIER_FIXTURE = (
    b"record_id,name\n"
    b"A,x\n"
    b"A,\n"
    b"B,y\n"
    b"A,z\n"
)


def reference_column_completeness(csv_bytes, missing_markers_by_column):
    """Reference result computed with plain Python, independently of the service.

    The rules are spelled out from the product definition: null, empty, and
    whitespace-only values are missing, extra markers match after trimming and
    without case sensitivity, and every parsed row is one Input Row. Files with
    rows of the wrong length are rejected as malformed before any summary
    exists, so only well-formed rows reach this reference.
    """
    parsed_rows = list(csv.reader(io.StringIO(csv_bytes.decode("utf-8"))))
    header_names = parsed_rows[0]
    input_rows = []
    for parsed_row in parsed_rows[1:]:
        # A line without any field is not a record and thus not an Input Row.
        # In a one-column file an empty line is a record with one empty value,
        # which cannot be told apart from a line holding a single empty field.
        if not parsed_row and len(header_names) > 1:
            continue
        input_rows.append(parsed_row)

    columns = []
    for column_index, column_name in enumerate(header_names):
        markers = {
            marker.strip().lower()
            for marker in missing_markers_by_column.get(column_name, [])
        }
        present_count = 0
        for input_row in input_rows:
            if column_index < len(input_row):
                value = input_row[column_index]
            else:
                value = ""
            trimmed_value = value.strip()
            if trimmed_value == "":
                continue
            if trimmed_value.lower() in markers:
                continue
            present_count = present_count + 1

        missing_count = len(input_rows) - present_count
        columns.append(
            {
                "name": column_name,
                "present_count": present_count,
                "present_share": present_count / len(input_rows),
                "missing_count": missing_count,
                "missing_share": missing_count / len(input_rows),
            }
        )

    return {"input_rows": len(input_rows), "columns": columns}


def request_summary(test_client, csv_bytes, missing_markers_by_column=None, file_name="data.csv"):
    form_fields = {}
    if missing_markers_by_column is not None:
        form_fields["missing_markers"] = json.dumps(missing_markers_by_column)

    return test_client.post(
        "/api/column-completeness",
        files={"file": (file_name, csv_bytes, "text/csv")},
        data=form_fields,
    )


def assert_matches_reference(response_json, csv_bytes, missing_markers_by_column):
    expected = reference_column_completeness(csv_bytes, missing_markers_by_column)

    assert response_json["input_rows"] == expected["input_rows"]
    assert len(response_json["columns"]) == len(expected["columns"])

    for actual_column, expected_column in zip(response_json["columns"], expected["columns"]):
        assert actual_column["name"] == expected_column["name"]
        assert actual_column["present_count"] == expected_column["present_count"]
        assert actual_column["missing_count"] == expected_column["missing_count"]
        assert actual_column["present_share"] == pytest.approx(expected_column["present_share"])
        assert actual_column["missing_share"] == pytest.approx(expected_column["missing_share"])


def test_summary_matches_independent_reference_on_deterministic_fixture():
    missing_markers_by_column = {"email": ["n/a"], "notes": ["-", "N/A"]}

    response = request_summary(client, COMPLETENESS_FIXTURE, missing_markers_by_column)

    assert response.status_code == 200
    assert_matches_reference(response.json(), COMPLETENESS_FIXTURE, missing_markers_by_column)


def test_default_rules_treat_null_empty_and_whitespace_only_as_missing_and_zero_as_present():
    response = request_summary(client, DEFAULT_RULES_FIXTURE)

    assert response.status_code == 200
    assert response.json() == {
        "input_rows": 4,
        "columns": [
            {
                "name": "name",
                "present_count": 1,
                "present_share": 0.25,
                "missing_count": 3,
                "missing_share": 0.75,
            },
            {
                "name": "amount",
                "present_count": 4,
                "present_share": 1.0,
                "missing_count": 0,
                "missing_share": 0.0,
            },
        ],
    }


def test_custom_markers_match_after_trimming_and_without_case():
    response = request_summary(client, CUSTOM_MARKER_FIXTURE, {"value": ["  n/A  "]})

    assert response.status_code == 200
    assert response.json()["columns"][0] == {
        "name": "value",
        "present_count": 1,
        "present_share": 0.25,
        "missing_count": 3,
        "missing_share": 0.75,
    }


def test_zero_becomes_missing_only_when_configured_as_a_marker():
    default_response = request_summary(client, ZERO_AS_MARKER_FIXTURE)
    marker_response = request_summary(client, ZERO_AS_MARKER_FIXTURE, {"amount": ["0"]})

    assert default_response.status_code == 200
    assert default_response.json()["columns"][0]["present_count"] == 3

    assert marker_response.status_code == 200
    assert marker_response.json()["columns"][0]["present_count"] == 1


def test_rows_with_duplicate_identifier_values_are_counted_as_separate_input_rows():
    response = request_summary(client, DUPLICATE_IDENTIFIER_FIXTURE)

    assert response.status_code == 200
    assert response.json() == {
        "input_rows": 4,
        "columns": [
            {
                "name": "record_id",
                "present_count": 4,
                "present_share": 1.0,
                "missing_count": 0,
                "missing_share": 0.0,
            },
            {
                "name": "name",
                "present_count": 3,
                "present_share": 0.75,
                "missing_count": 1,
                "missing_share": 0.25,
            },
        ],
    }


def test_each_request_reports_the_summary_of_the_uploaded_file_only():
    other_fixture = b"record_id,name\nA,x\nA,\n"

    first_response = request_summary(client, DUPLICATE_IDENTIFIER_FIXTURE)
    second_response = request_summary(client, other_fixture)

    assert first_response.status_code == 200
    assert first_response.json()["input_rows"] == 4
    assert second_response.status_code == 200
    assert second_response.json()["input_rows"] == 2
    assert_matches_reference(second_response.json(), other_fixture, {})


def test_blank_lines_between_records_are_not_input_rows():
    csv_bytes = b"name,amount\nAda,1\n\nBob,2\n"

    response = request_summary(client, csv_bytes)

    assert response.status_code == 200
    assert response.json()["input_rows"] == 2


def test_empty_line_in_a_single_column_file_is_an_input_row_with_a_missing_value():
    # In a one-column file an empty line is a record with one empty value: the
    # parser cannot tell it apart from a line holding a single empty field.
    csv_bytes = b"name\nAda\n\nBob\n"

    response = request_summary(client, csv_bytes)

    assert response.status_code == 200
    assert response.json()["input_rows"] == 3
    assert response.json()["columns"][0]["present_count"] == 2


def test_column_completeness_reports_columns_in_file_order():
    response = request_summary(client, COMPLETENESS_FIXTURE)

    assert response.status_code == 200
    assert [column["name"] for column in response.json()["columns"]] == [
        "id",
        "email",
        "phone",
        "amount",
        "notes",
    ]


def test_hostile_column_names_are_returned_verbatim_as_json_text():
    csv_bytes = b"<script>alert('x')</script>,notes\n1,hello\n"

    response = request_summary(client, csv_bytes, file_name="hostile.csv")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert [column["name"] for column in response.json()["columns"]] == [
        "<script>alert('x')</script>",
        "notes",
    ]


def test_summary_rejects_empty_file_with_clear_error():
    response = request_summary(client, b"", file_name="empty.csv")

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_summary_rejects_file_without_input_rows_with_clear_error():
    response = request_summary(client, b"name,amount\n", file_name="header-only.csv")

    assert response.status_code == 400
    assert "input rows" in response.json()["detail"].lower()


def test_summary_rejects_malformed_file_with_clear_error():
    ragged_csv_bytes = b"name,amount\nAda,1\nBob\n"

    response = request_summary(client, ragged_csv_bytes, file_name="broken.csv")

    assert response.status_code == 400
    assert "csv" in response.json()["detail"].lower()


def test_summary_rejects_unsupported_file_format_with_clear_error():
    response = request_summary(client, b"not-a-workbook", file_name="workbook.xls")

    assert response.status_code == 415
    assert "csv" in response.json()["detail"].lower()
    assert "xlsx" in response.json()["detail"].lower()


def test_summary_rejects_invalid_missing_markers_with_clear_error():
    response = client.post(
        "/api/column-completeness",
        files={"file": ("data.csv", COMPLETENESS_FIXTURE, "text/csv")},
        data={"missing_markers": "not-json"},
    )

    assert response.status_code == 400
    assert "missing" in response.json()["detail"].lower()


def test_summary_rejects_markers_for_unknown_columns_with_clear_error():
    response = request_summary(client, COMPLETENESS_FIXTURE, {"nickname": ["n/a"]})

    assert response.status_code == 400
    assert "nickname" in response.json()["detail"]


def test_summary_rejects_missing_markers_that_are_not_lists_of_strings():
    not_an_object_response = client.post(
        "/api/column-completeness",
        files={"file": ("data.csv", COMPLETENESS_FIXTURE, "text/csv")},
        data={"missing_markers": '["n/a"]'},
    )
    not_a_list_response = request_summary(client, COMPLETENESS_FIXTURE, {"email": "n/a"})

    assert not_an_object_response.status_code == 400
    assert "missing" in not_an_object_response.json()["detail"].lower()
    assert not_a_list_response.status_code == 400
    assert "missing" in not_a_list_response.json()["detail"].lower()


def test_successful_summary_leaves_no_working_files_behind(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)

    response = request_summary(test_client, COMPLETENESS_FIXTURE)

    assert response.status_code == 200
    assert_no_working_files_left(work_directory)


def test_failed_summary_leaves_no_working_files_behind(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)

    response = request_summary(test_client, b"name,amount\nAda,1\nBob\n", file_name="broken.csv")

    assert response.status_code == 400
    assert_no_working_files_left(work_directory)