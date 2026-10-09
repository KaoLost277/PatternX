import csv
import io
import json
import time

from fastapi.testclient import TestClient

from support import assert_no_working_files_left, make_test_client


def start_data_analysis(
    client: TestClient,
    analysis_kind: str,
    csv_bytes: bytes,
    selected_columns: list[str],
    missing_markers: dict[str, list[str]] | None = None,
):
    form_fields = {
        "analysis_kind": analysis_kind,
        "selected_columns": json.dumps(selected_columns),
        "missing_markers": json.dumps(missing_markers or {}),
    }
    return client.post(
        "/api/data-analysis-jobs",
        files={"file": ("data.csv", csv_bytes, "text/csv")},
        data=form_fields,
    )


def await_data_analysis(client: TestClient, job_id: str):
    deadline = time.monotonic() + 30
    while True:
        response = client.get(f"/api/data-analysis-jobs/{job_id}")
        assert response.status_code == 200
        status = response.json()
        if status["state"] != "running":
            return status
        if time.monotonic() >= deadline:
            raise AssertionError(f"The data analysis job {job_id} did not finish in time.")
        time.sleep(0.01)


def run_data_analysis(
    client: TestClient,
    analysis_kind: str,
    csv_bytes: bytes,
    selected_columns: list[str],
    missing_markers: dict[str, list[str]] | None = None,
):
    response = start_data_analysis(
        client,
        analysis_kind,
        csv_bytes,
        selected_columns,
        missing_markers,
    )
    assert response.status_code == 201, response.text
    return await_data_analysis(client, response.json()["job_id"])


def test_formal_terms_report_exact_terms_repeated_formats_and_missing_values(tmp_path):
    client = make_test_client(tmp_path / "work")
    csv_bytes = (
        b"Employee_ID,Code,Approval_Status\n"
        b"EMP-00101,EMP-00101,Approved\n"
        b"EMP-00102,EMP-00102,Approved\n"
        b"EMP-00103,SUP-003,Pending\n"
        b"EMP-00104,EMP-00101,N/A\n"
    )

    status = run_data_analysis(
        client,
        "formal_terms",
        csv_bytes,
        ["Code", "Approval_Status"],
        {"Approval_Status": [" N/A "]},
    )

    assert status["state"] == "succeeded"
    assert status["analysis_kind"] == "formal_terms"
    assert status["progress"] == {"items_done": 8, "items_total": 8}
    result = status["result"]
    assert result["kind"] == "formal_terms"
    assert result["input_rows"] == 4
    assert result["selected_columns"] == ["Code", "Approval_Status"]
    code_column = result["columns"][0]
    assert code_column["terms"] == [
        {"value": "EMP-00101", "count": 2, "share": 0.5},
        {"value": "EMP-00102", "count": 1, "share": 0.25},
        {"value": "SUP-003", "count": 1, "share": 0.25},
    ]
    assert code_column["format_patterns"] == [
        {
            "pattern": "EMP-<5 digits>",
            "occurrence_count": 3,
            "distinct_term_count": 2,
            "share": 0.75,
        }
    ]
    status_terms = result["columns"][1]["terms"]
    assert status_terms == [
        {"value": "Approved", "count": 2, "share": 0.5},
        {"value": None, "count": 1, "share": 0.25},
        {"value": "Pending", "count": 1, "share": 0.25},
    ]

    job_id = status["job_id"]
    term_rows = client.get(
        f"/api/data-analysis-jobs/{job_id}/rows",
        params={"target_kind": "term", "column_index": 0, "item_index": 0},
    )
    assert term_rows.status_code == 200
    assert term_rows.json()["rows"] == [
        ["EMP-00101", "EMP-00101", "Approved"],
        ["EMP-00104", "EMP-00101", "N/A"],
    ]

    format_rows = client.get(
        f"/api/data-analysis-jobs/{job_id}/rows",
        params={"target_kind": "format", "column_index": 0, "item_index": 0},
    )
    assert format_rows.status_code == 200
    assert format_rows.json()["total_rows"] == 3
    assert [row[0] for row in format_rows.json()["rows"]] == [
        "EMP-00101",
        "EMP-00102",
        "EMP-00104",
    ]


def test_formal_terms_keep_case_and_surrounding_whitespace_distinct(tmp_path):
    client = make_test_client(tmp_path / "work")
    csv_bytes = b"value\nA\n A \na\n"

    status = run_data_analysis(client, "formal_terms", csv_bytes, ["value"])

    assert status["state"] == "succeeded"
    assert status["progress"] == {"items_done": 3, "items_total": 3}
    assert status["result"]["columns"][0]["terms"] == [
        {"value": " A ", "count": 1, "share": 1 / 3},
        {"value": "A", "count": 1, "share": 1 / 3},
        {"value": "a", "count": 1, "share": 1 / 3},
    ]
    assert status["result"]["columns"][0]["format_patterns"] == []


def test_group_data_reports_only_observed_exact_tuples_and_retains_each_input_row(tmp_path):
    client = make_test_client(tmp_path / "work")
    csv_bytes = (
        b"record_id,Department,Approval_Status\n"
        b"1,IT,Approved\n"
        b"2,IT,Approved\n"
        b"3,Finance,\n"
        b"4,Finance,N/A\n"
        b"5,IT,Pending\n"
    )

    status = run_data_analysis(
        client,
        "group_data",
        csv_bytes,
        ["Department", "Approval_Status"],
        {"Approval_Status": ["N/A"], "record_id": ["4"]},
    )

    assert status["state"] == "succeeded"
    assert status["progress"] == {"items_done": 5, "items_total": 5}
    result = status["result"]
    assert result["kind"] == "group_data"
    assert result["input_rows"] == 5
    groups = result["groups"]
    assert len(groups) == 3
    assert {
        (tuple(group["values"]), group["count"])
        for group in groups
    } == {
        (("IT", "Approved"), 2),
        (("Finance", None), 2),
        (("IT", "Pending"), 1),
    }
    assert sum(group["count"] for group in groups) == 5

    repeated_group_index = next(
        index for index, group in enumerate(groups) if group["values"] == ["Finance", None]
    )
    rows_response = client.get(
        f"/api/data-analysis-jobs/{status['job_id']}/rows",
        params={"target_kind": "group", "item_index": repeated_group_index},
    )
    assert rows_response.status_code == 200
    assert rows_response.json()["rows"] == [
        ["3", "Finance", None],
        ["4", "Finance", "N/A"],
    ]
    filtered_rows_response = client.get(
        f"/api/data-analysis-jobs/{status['job_id']}/rows",
        params={
            "target_kind": "group",
            "item_index": repeated_group_index,
            "filters": json.dumps({"record_id": {"kind": "missing"}}),
        },
    )
    assert filtered_rows_response.status_code == 200
    assert filtered_rows_response.json()["rows"] == [["4", "Finance", "N/A"]]
    assert filtered_rows_response.json()["total_rows"] == 1

    export_response = client.get(
        f"/api/data-analysis-jobs/{status['job_id']}/exports/rows.csv",
        params={"target_kind": "group", "item_index": repeated_group_index},
    )
    analysis_columns_export_response = client.get(
        f"/api/data-analysis-jobs/{status['job_id']}/exports/rows.csv",
        params={
            "target_kind": "group",
            "item_index": repeated_group_index,
            "column_mode": "analysis",
        },
    )
    filtered_export_response = client.get(
        f"/api/data-analysis-jobs/{status['job_id']}/exports/rows.csv",
        params={
            "target_kind": "group",
            "item_index": repeated_group_index,
            "filters": json.dumps({"record_id": {"kind": "missing"}}),
        },
    )
    assert export_response.status_code == 200
    export_rows = list(csv.reader(io.StringIO(export_response.text.lstrip("\ufeff"))))
    assert export_rows == [
        ["record_id", "Department", "Approval_Status"],
        ["3", "Finance", ""],
        ["4", "Finance", "N/A"],
    ]
    assert analysis_columns_export_response.status_code == 200
    assert list(
        csv.reader(io.StringIO(analysis_columns_export_response.text.lstrip("\ufeff")))
    ) == [
        ["Department", "Approval_Status"],
        ["Finance", ""],
        ["Finance", "N/A"],
    ]
    assert filtered_export_response.status_code == 200
    assert list(csv.reader(io.StringIO(filtered_export_response.text.lstrip("\ufeff")))) == [
        ["record_id", "Department", "Approval_Status"],
        ["4", "Finance", "N/A"],
    ]


def test_analysis_column_exports_use_source_order_and_all_matching_rows(tmp_path):
    client = make_test_client(tmp_path / "work")
    row_count = 107
    csv_lines = ["record_id,z_value,a_value,notes"]
    for row_index in range(row_count):
        csv_lines.append(f"R{row_index:03},z-{row_index:03},shared,note-{row_index:03}")

    status = run_data_analysis(
        client,
        "formal_terms",
        "\n".join(csv_lines).encode("utf-8"),
        ["a_value", "z_value"],
    )
    term_index = next(
        index
        for index, term in enumerate(status["result"]["columns"][0]["terms"])
        if term["value"] == "shared"
    )

    all_columns_response = client.get(
        f"/api/data-analysis-jobs/{status['job_id']}/exports/rows.csv",
        params={"target_kind": "term", "column_index": 0, "item_index": term_index},
    )
    analysis_columns_response = client.get(
        f"/api/data-analysis-jobs/{status['job_id']}/exports/rows.csv",
        params={
            "target_kind": "term",
            "column_index": 0,
            "item_index": term_index,
            "column_mode": "analysis",
        },
    )

    all_export_rows = list(csv.reader(io.StringIO(all_columns_response.text.lstrip("\ufeff"))))
    analysis_export_rows = list(
        csv.reader(io.StringIO(analysis_columns_response.text.lstrip("\ufeff")))
    )
    assert all_export_rows[0] == ["record_id", "z_value", "a_value", "notes"]
    assert len(all_export_rows) == row_count + 1
    assert all_export_rows[1] == ["R000", "z-000", "shared", "note-000"]
    assert all_export_rows[-1] == ["R106", "z-106", "shared", "note-106"]
    assert analysis_export_rows[0] == ["z_value", "a_value"]
    assert len(analysis_export_rows) == row_count + 1
    assert analysis_export_rows[1] == ["z-000", "shared"]
    assert analysis_export_rows[-1] == ["z-106", "shared"]


def test_data_analysis_jobs_are_retained_per_mode_and_cleared_on_new_import(tmp_path):
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)
    csv_bytes = b"department,status\nIT,Approved\nIT,Pending\n"

    formal_status = run_data_analysis(client, "formal_terms", csv_bytes, ["department"])
    group_status = run_data_analysis(client, "group_data", csv_bytes, ["department", "status"])

    assert client.get(f"/api/data-analysis-jobs/{formal_status['job_id']}").status_code == 200
    assert client.get(f"/api/data-analysis-jobs/{group_status['job_id']}").status_code == 200

    replacement_status = run_data_analysis(client, "formal_terms", csv_bytes, ["status"])
    assert client.get(f"/api/data-analysis-jobs/{formal_status['job_id']}").status_code == 404
    assert client.get(f"/api/data-analysis-jobs/{group_status['job_id']}").status_code == 200
    assert replacement_status["state"] == "succeeded"

    import_response = client.post(
        "/api/imports",
        files={"file": ("next.csv", b"next_value\nnew\n", "text/csv")},
    )
    assert import_response.status_code == 200
    assert client.get(f"/api/data-analysis-jobs/{group_status['job_id']}").status_code == 404
    assert client.get(f"/api/data-analysis-jobs/{replacement_status['job_id']}").status_code == 404
    assert_no_working_files_left(work_directory)


def test_changed_missing_rules_clear_every_mode_row_database(tmp_path):
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)
    csv_bytes = b"department,status\nIT,Approved\nIT,N/A\n"
    formal_status = run_data_analysis(
        client,
        "formal_terms",
        csv_bytes,
        ["status"],
    )
    group_status = run_data_analysis(
        client,
        "group_data",
        csv_bytes,
        ["department", "status"],
    )

    completeness_response = client.post(
        "/api/column-completeness",
        files={"file": ("data.csv", csv_bytes, "text/csv")},
        data={
            "missing_markers": json.dumps({"status": ["N/A"]}),
            "reset_analysis_results": "true",
        },
    )

    assert completeness_response.status_code == 200
    assert client.get(f"/api/data-analysis-jobs/{formal_status['job_id']}").status_code == 404
    assert client.get(f"/api/data-analysis-jobs/{group_status['job_id']}").status_code == 404
    assert_no_working_files_left(work_directory)


def test_data_analysis_rejects_invalid_columns_and_cleans_temporary_uploads(tmp_path):
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)

    no_columns_response = start_data_analysis(
        client,
        "group_data",
        b"value\nx\n",
        [],
    )
    unknown_column_response = start_data_analysis(
        client,
        "formal_terms",
        b"value\nx\n",
        ["other"],
    )
    unsupported_kind_response = start_data_analysis(
        client,
        "unknown",
        b"value\nx\n",
        ["value"],
    )

    assert no_columns_response.status_code == 400
    assert unknown_column_response.status_code == 400
    assert unsupported_kind_response.status_code == 400
    assert_no_working_files_left(work_directory)
