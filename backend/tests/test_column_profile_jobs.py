import json
import threading
import time

from fastapi.testclient import TestClient

from app import column_profile_jobs, data_analyses
from app.data_analyses import compute_column_profile
from app.sqlite_storage import load_csv_into_database, open_analysis_database
from support import make_test_client


PROFILE_FIXTURE = (
    b"record_id,status,amount,all_missing\n"
    b"001,Active,0,N/A\n"
    b"002,N/A,0,N/A\n"
    b"003,Active,,n/a\n"
    b'004," A ",N/A," N/A "\n'
)
PROFILE_MARKERS = {
    "status": [" n/a "],
    "amount": ["0", "N/A"],
    "all_missing": ["N/A"],
}


def start_column_profile(
    client: TestClient,
    csv_bytes: bytes,
    missing_markers: dict[str, list[str]] | None = None,
    file_name: str = "data.csv",
    sheet: str | None = None,
):
    form_fields = {}
    if missing_markers is not None:
        form_fields["missing_markers"] = json.dumps(missing_markers)
    if sheet is not None:
        form_fields["sheet"] = sheet
    return client.post(
        "/api/column-profile-jobs",
        files={"file": (file_name, csv_bytes, "text/csv")},
        data=form_fields,
    )


def await_job_status(
    client: TestClient,
    route: str,
    job_id: str,
    timeout_seconds: float = 10.0,
):
    deadline = time.monotonic() + timeout_seconds
    while True:
        response = client.get(f"{route}/{job_id}")
        assert response.status_code == 200
        status = response.json()
        if status["state"] != "running":
            return status
        if time.monotonic() >= deadline:
            raise AssertionError(f"The job {job_id} did not finish in time.")
        time.sleep(0.01)


def await_column_profile(client: TestClient, job_id: str, timeout_seconds: float = 10.0):
    return await_job_status(client, "/api/column-profile-jobs", job_id, timeout_seconds)


def run_column_profile(
    client: TestClient,
    csv_bytes: bytes,
    missing_markers: dict[str, list[str]] | None = None,
):
    started = start_column_profile(client, csv_bytes, missing_markers)
    assert started.status_code == 201, started.text
    return await_column_profile(client, started.json()["job_id"])


def test_column_profile_reconciles_with_completeness_and_formal_terms(tmp_path):
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)

    profile_status = run_column_profile(client, PROFILE_FIXTURE, PROFILE_MARKERS)
    completeness_response = client.post(
        "/api/column-completeness",
        files={"file": ("data.csv", PROFILE_FIXTURE, "text/csv")},
        data={"missing_markers": json.dumps(PROFILE_MARKERS)},
    )
    formal_start = client.post(
        "/api/data-analysis-jobs",
        files={"file": ("data.csv", PROFILE_FIXTURE, "text/csv")},
        data={
            "analysis_kind": "formal_terms",
            "selected_columns": json.dumps(["status", "amount", "all_missing"]),
            "missing_markers": json.dumps(PROFILE_MARKERS),
        },
    )
    assert formal_start.status_code == 201, formal_start.text
    formal_status = await_job_status(
        client,
        "/api/data-analysis-jobs",
        formal_start.json()["job_id"],
    )

    assert profile_status["state"] == "succeeded"
    assert profile_status["analysis_kind"] == "column_profile"
    assert profile_status["progress"] == {"items_done": 4, "items_total": 4}
    assert completeness_response.status_code == 200
    assert profile_status["result"] == {
        "kind": "column_profile",
        "input_rows": 4,
        "columns": [
            {
                "name": "record_id",
                "present": {
                    "count": 4,
                    "denominator": 4,
                    "denominator_kind": "input_rows",
                    "share": 1.0,
                },
                "missing": {
                    "count": 0,
                    "denominator": 4,
                    "denominator_kind": "input_rows",
                    "share": 0.0,
                },
                "distinct_terms": {
                    "count": 4,
                    "denominator": 4,
                    "denominator_kind": "present_values",
                    "share": 1.0,
                },
            },
            {
                "name": "status",
                "present": {
                    "count": 3,
                    "denominator": 4,
                    "denominator_kind": "input_rows",
                    "share": 0.75,
                },
                "missing": {
                    "count": 1,
                    "denominator": 4,
                    "denominator_kind": "input_rows",
                    "share": 0.25,
                },
                "distinct_terms": {
                    "count": 2,
                    "denominator": 3,
                    "denominator_kind": "present_values",
                    "share": 2 / 3,
                },
            },
            {
                "name": "amount",
                "present": {
                    "count": 0,
                    "denominator": 4,
                    "denominator_kind": "input_rows",
                    "share": 0.0,
                },
                "missing": {
                    "count": 4,
                    "denominator": 4,
                    "denominator_kind": "input_rows",
                    "share": 1.0,
                },
                "distinct_terms": {
                    "count": 0,
                    "denominator": 0,
                    "denominator_kind": "present_values",
                    "share": None,
                },
            },
            {
                "name": "all_missing",
                "present": {
                    "count": 0,
                    "denominator": 4,
                    "denominator_kind": "input_rows",
                    "share": 0.0,
                },
                "missing": {
                    "count": 4,
                    "denominator": 4,
                    "denominator_kind": "input_rows",
                    "share": 1.0,
                },
                "distinct_terms": {
                    "count": 0,
                    "denominator": 0,
                    "denominator_kind": "present_values",
                    "share": None,
                },
            },
        ],
    }

    completeness_by_name = {
        column["name"]: column for column in completeness_response.json()["columns"]
    }
    formal_columns_by_name = {
        column["name"]: column for column in formal_status["result"]["columns"]
    }
    for profile_column in profile_status["result"]["columns"]:
        completeness_column = completeness_by_name[profile_column["name"]]
        formal_column = formal_columns_by_name.get(profile_column["name"])
        assert profile_column["present"]["count"] == completeness_column["present_count"]
        assert profile_column["missing"]["count"] == completeness_column["missing_count"]
        if formal_column is not None:
            non_missing_terms = [
                term for term in formal_column["terms"] if term["value"] is not None
            ]
            missing_term = next(
                term for term in formal_column["terms"] if term["value"] is None
            )
            assert profile_column["distinct_terms"]["count"] == len(non_missing_terms)
            assert missing_term["share"] == (
                missing_term["count"] / profile_status["result"]["input_rows"]
            )
            assert all(
                term["share"] == term["count"] / profile_status["result"]["input_rows"]
                for term in formal_column["terms"]
            )

    assert not (work_directory / "uploads" / f"job-{profile_status['job_id']}").exists()
    assert client.get(f"/api/column-profile-jobs/{profile_status['job_id']}/rows").status_code == 404
    profile_json = json.dumps(profile_status["result"])
    assert "Active" not in profile_json
    assert "N/A" not in profile_json
    assert "format_patterns" not in profile_json
    assert all("terms" not in column for column in profile_status["result"]["columns"])


def test_column_profile_counts_high_cardinality_values_without_returning_terms(tmp_path):
    client = make_test_client(tmp_path / "work")
    values = [f"private-value-{index:03}" for index in range(128)]
    csv_bytes = ("value\n" + "\n".join(values) + "\n").encode()

    status = run_column_profile(client, csv_bytes)

    assert status["state"] == "succeeded"
    assert status["progress"] == {"items_done": 1, "items_total": 1}
    assert status["result"]["input_rows"] == 128
    assert status["result"]["columns"][0]["distinct_terms"] == {
        "count": 128,
        "denominator": 128,
        "denominator_kind": "present_values",
        "share": 1.0,
    }
    assert "private-value-000" not in json.dumps(status["result"])
    assert set(status["result"]) == {"kind", "input_rows", "columns"}
    assert list((tmp_path / "work" / "uploads").iterdir()) == []


def test_column_profile_reports_progress_after_each_source_column(tmp_path):
    csv_path = tmp_path / "input.csv"
    csv_path.write_bytes(b"first,second,third\na,x,1\nb,x,2\n")
    connection = open_analysis_database(tmp_path / "analysis.sqlite3")
    progress: list[tuple[int, int]] = []

    try:
        column_names = load_csv_into_database(connection, csv_path)
        summary = compute_column_profile(
            connection,
            column_names,
            {},
            progress_reporter=lambda done, total: progress.append((done, total)),
        )
    finally:
        connection.close()

    assert [(column.name, column.distinct_terms.count) for column in summary.columns] == [
        ("first", 2),
        ("second", 1),
        ("third", 2),
    ]
    assert progress == [(1, 3), (2, 3), (3, 3)]


def test_column_profile_no_input_rows_fails_clearly_and_cleans_the_job(tmp_path):
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)

    status = run_column_profile(client, b"header,other\n")

    assert status["state"] == "failed"
    assert status["error"] == "The uploaded file contains a header row but no Input Rows."
    assert status["result"] is None
    assert list((work_directory / "uploads").iterdir()) == []


def test_column_profile_route_validation_rejects_malformed_and_unknown_markers(tmp_path):
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)
    malformed_markers = client.post(
        "/api/column-profile-jobs",
        files={"file": ("data.csv", b"value\nx\n", "text/csv")},
        data={"missing_markers": "not-json"},
    )
    unknown_marker_column = start_column_profile(
        client,
        b"value\nx\n",
        {"other": ["missing"]},
    )

    assert malformed_markers.status_code == 400
    assert "JSON object" in malformed_markers.json()["detail"]
    assert unknown_marker_column.status_code == 400
    assert "other" in unknown_marker_column.json()["detail"]
    assert list((work_directory / "uploads").iterdir()) == []


def test_column_profile_failure_removes_the_entire_job_directory(tmp_path, monkeypatch):
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)

    def fail_profile(self, _connection):
        raise ValueError("The profile query failed.")

    monkeypatch.setattr(column_profile_jobs.ColumnProfileJob, "compute_summary", fail_profile)
    status = run_column_profile(client, b"value\nx\n")

    assert status["state"] == "failed"
    assert status["error"] == "The profile query failed."
    assert status["result"] is None
    assert list((work_directory / "uploads").iterdir()) == []


def test_column_profile_cancellation_interrupts_the_active_query_and_cleans_files(
    tmp_path,
    monkeypatch,
):
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)
    query_started = threading.Event()
    release_query = threading.Event()
    cancellation_requested = threading.Event()
    original_register = data_analyses.register_data_value_functions
    original_request_cancel = column_profile_jobs.ColumnProfileJob.request_cancel

    def register_slow_value(connection, column_names, missing_markers_by_column):
        original_register(connection, column_names, missing_markers_by_column)

        def slow_value(value):
            query_started.set()
            release_query.wait(timeout=5.0)
            return data_analyses.normalize_data_value(
                value,
                data_analyses.normalize_missing_markers(
                    missing_markers_by_column.get("value", [])
                ),
            )

        connection.create_function("patternx_group_value_0", 1, slow_value, deterministic=True)

    def record_cancel_request(job):
        original_request_cancel(job)
        cancellation_requested.set()

    monkeypatch.setattr(data_analyses, "register_data_value_functions", register_slow_value)
    monkeypatch.setattr(
        column_profile_jobs.ColumnProfileJob,
        "request_cancel",
        record_cancel_request,
    )
    started = start_column_profile(client, b"value\none\n")
    assert started.status_code == 201
    job_id = started.json()["job_id"]
    assert query_started.wait(timeout=5.0)
    cancel_response: list[object] = []

    def cancel_profile():
        cancel_response.append(client.post(f"/api/column-profile-jobs/{job_id}/cancel"))

    cancellation_thread = threading.Thread(target=cancel_profile)
    cancellation_thread.start()
    assert cancellation_requested.wait(timeout=5.0)
    release_query.set()
    cancellation_thread.join(timeout=5.0)

    assert not cancellation_thread.is_alive()
    assert len(cancel_response) == 1
    response = cancel_response[0]
    assert response.status_code == 200
    assert response.json()["state"] == "cancelled"
    assert response.json()["result"] is None
    assert list((work_directory / "uploads").iterdir()) == []


def test_column_profile_store_is_separate_and_clears_on_dataset_or_rule_change(tmp_path):
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)
    profile_status = run_column_profile(client, b"value\nx\n")
    formal_start = client.post(
        "/api/data-analysis-jobs",
        files={"file": ("data.csv", b"value\nx\n", "text/csv")},
        data={"analysis_kind": "formal_terms", "selected_columns": '["value"]'},
    )
    assert formal_start.status_code == 201
    formal_status = await_job_status(
        client,
        "/api/data-analysis-jobs",
        formal_start.json()["job_id"],
    )
    assert formal_status["state"] == "succeeded"
    assert client.get(f"/api/column-profile-jobs/{profile_status['job_id']}").status_code == 200

    imported = client.post(
        "/api/imports",
        files={"file": ("next.csv", b"value\ny\n", "text/csv")},
    )
    assert imported.status_code == 200
    assert client.get(f"/api/column-profile-jobs/{profile_status['job_id']}").status_code == 404

    next_profile = run_column_profile(client, b"value\nx\n")
    applied_rules = client.post(
        "/api/column-completeness",
        files={"file": ("data.csv", b"value\nx\n", "text/csv")},
        data={"missing_markers": '{"value":["x"]}', "reset_analysis_results": "true"},
    )
    assert applied_rules.status_code == 200
    assert client.get(f"/api/column-profile-jobs/{next_profile['job_id']}").status_code == 404
