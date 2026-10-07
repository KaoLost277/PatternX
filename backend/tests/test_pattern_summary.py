import csv
import io
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from support import (
    assert_no_working_files_left,
    await_analysis_job,
    make_test_client,
    pattern_analysis_fields,
    run_pattern_analysis_job,
    start_analysis_job,
)

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


def request_pattern_analysis(
    test_client,
    csv_bytes,
    analysis_columns,
    identifier_column=None,
    missing_markers_by_column=None,
    file_name="data.csv",
):
    """Start one analysis job for the fixture and return the creation response."""
    return start_analysis_job(
        test_client,
        file_name,
        csv_bytes,
        pattern_analysis_fields(
            analysis_columns,
            identifier_column=identifier_column,
            missing_markers_by_column=missing_markers_by_column,
        ),
    )


def run_pattern_analysis(
    test_client,
    csv_bytes,
    analysis_columns,
    identifier_column=None,
    missing_markers_by_column=None,
    file_name="data.csv",
):
    """Run one full analysis job for the fixture and return its finished status."""
    return run_pattern_analysis_job(
        test_client,
        csv_bytes,
        analysis_columns,
        identifier_column=identifier_column,
        missing_markers_by_column=missing_markers_by_column,
        file_name=file_name,
    )


def assert_matches_reference(
    analysis_result,
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

    assert analysis_result["input_rows"] == expected["input_rows"]
    assert analysis_result["identifier_column"] == expected["identifier_column"]
    assert analysis_result["analysis_columns"] == expected["analysis_columns"]
    assert pattern_summary_fields(analysis_result["patterns"]) == expected["patterns"]


def pattern_summary_fields(patterns):
    """Compare the summary rules without the preview rows.

    Preview behavior has its own tests in test_pattern_preview.py.
    """
    return [
        {"statuses": pattern["statuses"], "count": pattern["count"], "share": pattern["share"]}
        for pattern in patterns
    ]


def test_pattern_summary_matches_independent_reference_on_deterministic_fixture():
    missing_markers_by_column = {"email": ["unknown"], "amount": ["-"]}

    status = run_pattern_analysis(
        client,
        PATTERN_FIXTURE,
        ["email", "phone", "amount"],
        missing_markers_by_column=missing_markers_by_column,
        identifier_column="record_id",
    )

    assert status["state"] == "succeeded"
    assert_matches_reference(
        status["result"],
        PATTERN_FIXTURE,
        missing_markers_by_column,
        "record_id",
        ["email", "phone", "amount"],
    )


def test_input_rows_sharing_a_pattern_are_grouped_into_a_single_entry():
    status = run_pattern_analysis(
        client,
        PATTERN_FIXTURE,
        ["email", "phone", "amount"],
        identifier_column="record_id",
    )

    assert status["state"] == "succeeded"
    analysis_result = status["result"]
    patterns = analysis_result["patterns"]
    statuses_entries = [tuple(pattern["statuses"]) for pattern in patterns]

    # Three rows miss only the email value; they share one pattern entry.
    assert statuses_entries.count(("missing", "present", "present")) == 1
    shared_entry = patterns[statuses_entries.index(("missing", "present", "present"))]
    assert shared_entry["count"] == 3
    assert shared_entry["share"] == pytest.approx(0.5)

    # Every distinct pattern appears exactly once, and the counts cover all rows.
    assert len(statuses_entries) == len(set(statuses_entries))
    assert len(patterns) == 4
    assert sum(pattern["count"] for pattern in patterns) == analysis_result["input_rows"]
    for pattern in patterns:
        assert pattern["share"] == pytest.approx(
            pattern["count"] / analysis_result["input_rows"]
        )


def test_identifier_column_never_joins_the_analysis_and_never_changes_row_counts():
    analysis_columns = ["email", "phone"]

    status = run_pattern_analysis(
        client,
        PATTERN_FIXTURE,
        analysis_columns,
        identifier_column="record_id",
    )

    assert status["state"] == "succeeded"
    analysis_result = status["result"]

    # The Identifier Column is display-only and stays out of the analysis.
    assert analysis_result["identifier_column"] == "record_id"
    assert analysis_result["analysis_columns"] == analysis_columns

    # Repeating identifier values do not merge Input Rows: the six rows of the
    # file, including the three A1 rows and the two A2 rows, are all counted.
    assert analysis_result["input_rows"] == 6
    assert sum(pattern["count"] for pattern in analysis_result["patterns"]) == 6

    assert_matches_reference(
        analysis_result,
        PATTERN_FIXTURE,
        {},
        "record_id",
        analysis_columns,
    )


def test_identifier_column_requested_as_an_analysis_column_stays_out_of_the_analysis():
    status = run_pattern_analysis(
        client,
        PATTERN_FIXTURE,
        ["record_id", "email"],
        identifier_column="record_id",
    )

    assert status["state"] == "succeeded"
    analysis_result = status["result"]
    assert analysis_result["analysis_columns"] == ["email"]
    assert all(len(pattern["statuses"]) == 1 for pattern in analysis_result["patterns"])
    assert_matches_reference(
        analysis_result,
        PATTERN_FIXTURE,
        {},
        "record_id",
        ["record_id", "email"],
    )


def test_no_identifier_column_is_reported_when_none_is_designated():
    status = run_pattern_analysis(client, PATTERN_FIXTURE, ["email"])

    assert status["state"] == "succeeded"
    assert status["result"]["identifier_column"] is None
    assert status["result"]["analysis_columns"] == ["email"]


def test_default_missing_rules_apply_to_pattern_statuses():
    # Null, empty, and whitespace-only values are missing; zero is present.
    csv_bytes = (
        b"name,amount\n"
        b",0\n"
        b'"   ",1\n'
        b'"",2\n'
        b"Ada,3\n"
    )

    status = run_pattern_analysis(client, csv_bytes, ["name", "amount"])

    assert status["state"] == "succeeded"
    assert pattern_summary_fields(status["result"]["patterns"]) == [
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

    status = run_pattern_analysis(
        client,
        csv_bytes,
        ["value", "other"],
        missing_markers_by_column={"value": ["  n/A  "]},
    )

    assert status["state"] == "succeeded"
    assert pattern_summary_fields(status["result"]["patterns"]) == [
        {"statuses": ["missing", "present"], "count": 2, "share": 0.5},
        {"statuses": ["missing", "missing"], "count": 1, "share": 0.25},
        {"statuses": ["present", "present"], "count": 1, "share": 0.25},
    ]


def test_zero_is_present_unless_configured_as_a_marker():
    csv_bytes = b"amount,tally\n0,1\n1,2\n0,3\n"

    default_status = run_pattern_analysis(client, csv_bytes, ["amount", "tally"])
    marker_status = run_pattern_analysis(
        client,
        csv_bytes,
        ["amount", "tally"],
        missing_markers_by_column={"amount": ["0"]},
    )

    assert default_status["state"] == "succeeded"
    assert pattern_summary_fields(default_status["result"]["patterns"]) == [
        {"statuses": ["present", "present"], "count": 3, "share": 1.0},
    ]

    assert marker_status["state"] == "succeeded"
    assert pattern_summary_fields(marker_status["result"]["patterns"]) == [
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

    status = run_pattern_analysis(client, csv_bytes, ["a", "b"])

    assert status["state"] == "succeeded"
    assert pattern_summary_fields(status["result"]["patterns"]) == [
        {"statuses": ["missing", "present"], "count": 1, "share": 1 / 3},
        {"statuses": ["present", "missing"], "count": 1, "share": 1 / 3},
        {"statuses": ["present", "present"], "count": 1, "share": 1 / 3},
    ]


def test_pattern_summary_reports_columns_in_the_requested_order():
    status = run_pattern_analysis(
        client,
        PATTERN_FIXTURE,
        ["amount", "email"],
        identifier_column="record_id",
    )

    assert status["state"] == "succeeded"
    assert status["result"]["analysis_columns"] == ["amount", "email"]
    assert_matches_reference(
        status["result"],
        PATTERN_FIXTURE,
        {},
        "record_id",
        ["amount", "email"],
    )


def test_hostile_column_names_are_returned_verbatim_as_json_text():
    csv_bytes = b"<script>alert('x')</script>,notes\n1,hello\n"

    status = run_pattern_analysis(
        client,
        csv_bytes,
        ["<script>alert('x')</script>", "notes"],
        file_name="hostile.csv",
    )
    status_response = client.get(f"/api/analysis-jobs/{status['job_id']}")

    assert status["state"] == "succeeded"
    assert status_response.headers["content-type"].startswith("application/json")
    assert status["result"]["analysis_columns"] == ["<script>alert('x')</script>", "notes"]


def test_analysis_rejects_a_missing_analysis_columns_field():
    response = start_analysis_job(client, "data.csv", PATTERN_FIXTURE, {})

    assert response.status_code == 400
    assert "columns to analyze" in response.json()["detail"].lower()


def test_analysis_rejects_analysis_columns_that_are_not_a_list_of_strings():
    not_a_list_response = start_analysis_job(
        client, "data.csv", PATTERN_FIXTURE, {"analysis_columns": '{"email": true}'}
    )
    not_strings_response = start_analysis_job(
        client, "data.csv", PATTERN_FIXTURE, {"analysis_columns": '["email", 3]'}
    )

    assert not_a_list_response.status_code == 400
    assert "columns to analyze" in not_a_list_response.json()["detail"].lower()
    assert not_strings_response.status_code == 400
    assert "columns to analyze" in not_strings_response.json()["detail"].lower()


def test_analysis_rejects_an_empty_list_of_analysis_columns():
    response = request_pattern_analysis(client, PATTERN_FIXTURE, [])

    assert response.status_code == 400
    assert "at least one column" in response.json()["detail"].lower()


def test_analysis_rejects_analysis_columns_that_are_not_in_the_file():
    response = request_pattern_analysis(client, PATTERN_FIXTURE, ["email", "nickname"])

    assert response.status_code == 400
    assert "nickname" in response.json()["detail"]


def test_analysis_rejects_an_analysis_column_selected_more_than_once():
    response = request_pattern_analysis(client, PATTERN_FIXTURE, ["email", "email"])

    assert response.status_code == 400
    assert "email" in response.json()["detail"]
    assert "more than once" in response.json()["detail"].lower()


def test_analysis_rejects_an_identifier_column_that_is_not_in_the_file():
    response = request_pattern_analysis(
        client,
        PATTERN_FIXTURE,
        ["email"],
        identifier_column="nickname",
    )

    assert response.status_code == 400
    assert "nickname" in response.json()["detail"]


def test_analysis_rejects_a_selection_that_leaves_no_column_to_analyze():
    response = request_pattern_analysis(
        client,
        PATTERN_FIXTURE,
        ["record_id"],
        identifier_column="record_id",
    )

    assert response.status_code == 400
    assert "at least one column" in response.json()["detail"].lower()


def test_analysis_rejects_missing_markers_for_unknown_columns_with_clear_error():
    response = request_pattern_analysis(
        client,
        PATTERN_FIXTURE,
        ["email"],
        missing_markers_by_column={"nickname": ["n/a"]},
    )

    assert response.status_code == 400
    assert "nickname" in response.json()["detail"]


def test_analysis_rejects_empty_malformed_and_unsupported_files():
    empty_response = request_pattern_analysis(client, b"", [], file_name="empty.csv")
    malformed_response = request_pattern_analysis(
        client, b"name,amount\nAda,1\nBob\n", ["name"], file_name="broken.csv"
    )
    unsupported_response = request_pattern_analysis(
        client, b"not-a-workbook", ["name"], file_name="workbook.xls"
    )

    assert empty_response.status_code == 400
    assert "empty" in empty_response.json()["detail"].lower()
    assert malformed_response.status_code == 400
    assert "csv" in malformed_response.json()["detail"].lower()
    assert unsupported_response.status_code == 415
    assert "csv" in unsupported_response.json()["detail"].lower()


def test_analysis_of_a_header_only_file_fails_with_a_clear_error():
    status = run_pattern_analysis(
        client,
        b"name,amount\n",
        ["name"],
        file_name="header-only.csv",
    )

    assert status["state"] == "failed"
    assert "input rows" in status["error"].lower()


def test_each_analysis_reports_the_summary_of_the_uploaded_file_only():
    other_fixture = b"record_id,name\nA,x\nA,\n"

    first_status = run_pattern_analysis(
        client,
        PATTERN_FIXTURE,
        ["email"],
        identifier_column="record_id",
    )
    second_status = run_pattern_analysis(
        client,
        other_fixture,
        ["name"],
        identifier_column="record_id",
    )

    assert first_status["state"] == "succeeded"
    assert first_status["result"]["input_rows"] == 6
    assert second_status["state"] == "succeeded"
    assert second_status["result"]["input_rows"] == 2
    assert_matches_reference(second_status["result"], other_fixture, {}, "record_id", ["name"])


def test_successful_analysis_retains_only_its_staged_database(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)

    creation_response = request_pattern_analysis(
        test_client,
        PATTERN_FIXTURE,
        ["email", "phone"],
        identifier_column="record_id",
    )
    status = await_analysis_job(test_client, creation_response.json()["job_id"])

    assert status["state"] == "succeeded"
    job_directory = work_directory / "uploads" / f"job-{status['job_id']}"
    assert [path.name for path in job_directory.iterdir()] == ["analysis.sqlite3"]


def test_failed_analysis_start_leaves_no_working_files_behind(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)

    response = request_pattern_analysis(test_client, PATTERN_FIXTURE, ["nickname"])

    assert response.status_code == 400
    assert_no_working_files_left(work_directory)
