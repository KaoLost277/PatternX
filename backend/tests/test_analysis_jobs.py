import json
import time

from fastapi.testclient import TestClient

from app.main import app
from support import (
    assert_no_working_files_left,
    await_analysis_job,
    make_test_client,
    make_workbook_bytes,
    start_analysis_job,
)

client = TestClient(app)

# A run long enough that progress and cancellation can be observed while the
# job is still working.
LARGE_FIXTURE_ROWS = 20_000

# The UI warns before an analysis whose selected-column count reaches 20,
# because 2^20 = 1,048,576 distinct Completeness Patterns become possible.
HIGH_CARDINALITY_COLUMN_THRESHOLD = 20
HIGH_CARDINALITY_PATTERN_SPACE = 1_048_576


def make_large_fixture(row_count: int) -> bytes:
    lines = ["record_id,value"]
    for row_index in range(row_count):
        if row_index % 3 == 0:
            lines.append(f"R{row_index},")
        else:
            lines.append(f"R{row_index},value-{row_index}")

    return "\n".join(lines).encode("utf-8")


def make_wide_fixture(column_count: int) -> bytes:
    header_line = ",".join(f"column_{column_index}" for column_index in range(column_count))
    value_line = ",".join("x" for _ in range(column_count))
    return f"{header_line}\n{value_line}\n".encode("utf-8")


def start_small_analysis(test_client, file_bytes=b"record_id,value\nA,x\nB,\n"):
    creation_response = start_analysis_job(
        test_client,
        "data.csv",
        file_bytes,
        {"analysis_columns": json.dumps(["value"])},
    )
    assert creation_response.status_code == 201
    return creation_response.json()["job_id"]


def test_analysis_job_status_reports_every_field_the_ui_needs():
    job_id = start_small_analysis(client)

    status = await_analysis_job(client, job_id)

    assert set(status.keys()) == {
        "job_id",
        "state",
        "stage",
        "elapsed_seconds",
        "progress",
        "result",
        "error",
    }
    assert status["job_id"] == job_id
    assert status["state"] == "succeeded"
    assert status["stage"] is None
    assert status["elapsed_seconds"] >= 0
    assert status["progress"] == {"rows_done": 2, "rows_total": 2}
    assert status["error"] is None
    assert status["result"]["input_rows"] == 2
    assert status["result"]["analysis_columns"] == ["value"]


def test_analysis_job_reports_progress_and_elapsed_time_while_running(tmp_path):
    fixture = make_large_fixture(LARGE_FIXTURE_ROWS)
    test_client = make_test_client(tmp_path / "work", analysis_batch_rows=1)
    creation_response = start_analysis_job(
        test_client,
        "large.csv",
        fixture,
        {"analysis_columns": json.dumps(["value"])},
    )
    assert creation_response.status_code == 201
    job_id = creation_response.json()["job_id"]

    observed_progress = []
    observed_running_states = []
    deadline = time.monotonic() + 60
    while True:
        status = test_client.get(f"/api/analysis-jobs/{job_id}").json()
        if status["state"] == "running":
            observed_running_states.append(status)
        if status["progress"] is not None:
            observed_progress.append(status["progress"])
        if status["state"] != "running":
            break
        if time.monotonic() >= deadline:
            raise AssertionError(f"The analysis job {job_id} did not finish in time.")
        time.sleep(0.005)

    assert status["state"] == "succeeded"
    assert status["result"]["input_rows"] == LARGE_FIXTURE_ROWS
    assert status["progress"] == {
        "rows_done": LARGE_FIXTURE_ROWS,
        "rows_total": LARGE_FIXTURE_ROWS,
    }

    # While running, the job reports a stage, its elapsed time, and how far the
    # grouping has come, without ever losing Input Rows.
    assert len(observed_running_states) > 0
    for running_status in observed_running_states:
        assert running_status["stage"] is not None
        assert running_status["elapsed_seconds"] >= 0
    assert all(progress["rows_total"] == LARGE_FIXTURE_ROWS for progress in observed_progress)
    assert any(
        0 < progress["rows_done"] < progress["rows_total"] for progress in observed_progress
    )


def test_cancelling_a_running_analysis_stops_the_work_and_cleans_up(tmp_path):
    fixture = make_large_fixture(LARGE_FIXTURE_ROWS)
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory, analysis_batch_rows=1)
    creation_response = start_analysis_job(
        test_client,
        "large.csv",
        fixture,
        {"analysis_columns": json.dumps(["value"])},
    )
    assert creation_response.status_code == 201
    job_id = creation_response.json()["job_id"]

    cancel_response = test_client.post(f"/api/analysis-jobs/{job_id}/cancel")

    assert cancel_response.status_code == 200
    assert cancel_response.json()["state"] == "cancelled"
    assert cancel_response.json()["result"] is None

    status = await_analysis_job(test_client, job_id)
    assert status["state"] == "cancelled"
    assert status["result"] is None
    assert_no_working_files_left(work_directory)


def test_cancelling_a_finished_analysis_reports_its_finished_state():
    job_id = start_small_analysis(client)
    finished_status = await_analysis_job(client, job_id)
    assert finished_status["state"] == "succeeded"

    cancel_response = client.post(f"/api/analysis-jobs/{job_id}/cancel")

    assert cancel_response.status_code == 200
    assert cancel_response.json()["state"] == "succeeded"
    assert cancel_response.json()["result"] == finished_status["result"]


def test_failed_analysis_reports_a_clear_error_and_cleans_up(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)
    header_only_bytes = b"record_id,value\n"

    creation_response = start_analysis_job(
        test_client,
        "header-only.csv",
        header_only_bytes,
        {"analysis_columns": json.dumps(["value"])},
    )
    assert creation_response.status_code == 201

    status = await_analysis_job(test_client, creation_response.json()["job_id"])

    assert status["state"] == "failed"
    assert "input rows" in status["error"].lower()
    assert status["result"] is None
    assert_no_working_files_left(work_directory)


def test_successful_analysis_leaves_no_working_files_behind(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)

    job_id = start_small_analysis(test_client)
    status = await_analysis_job(test_client, job_id)

    assert status["state"] == "succeeded"
    assert_no_working_files_left(work_directory)


def test_starting_a_new_analysis_job_replaces_the_previous_job():
    first_job_id = start_small_analysis(client)
    first_status = await_analysis_job(client, first_job_id)
    assert first_status["state"] == "succeeded"

    second_job_id = start_small_analysis(client)

    replaced_response = client.get(f"/api/analysis-jobs/{first_job_id}")
    assert replaced_response.status_code == 404

    second_status = await_analysis_job(client, second_job_id)
    assert second_status["state"] == "succeeded"


def test_unknown_analysis_jobs_are_reported_with_clear_errors():
    missing_job_response = client.get("/api/analysis-jobs/not-a-job")
    missing_cancel_response = client.post("/api/analysis-jobs/not-a-job/cancel")

    assert missing_job_response.status_code == 404
    assert "not-a-job" in missing_job_response.json()["detail"]
    assert missing_cancel_response.status_code == 404
    assert "not-a-job" in missing_cancel_response.json()["detail"]


def test_high_cardinality_analysis_requires_an_acknowledged_warning():
    wide_fixture = make_wide_fixture(HIGH_CARDINALITY_COLUMN_THRESHOLD)
    analysis_columns = [
        f"column_{column_index}" for column_index in range(HIGH_CARDINALITY_COLUMN_THRESHOLD)
    ]

    unacknowledged_response = start_analysis_job(
        client,
        "wide.csv",
        wide_fixture,
        {"analysis_columns": json.dumps(analysis_columns)},
    )
    acknowledged_response = start_analysis_job(
        client,
        "wide.csv",
        wide_fixture,
        {
            "analysis_columns": json.dumps(analysis_columns),
            "high_cardinality_acknowledged": "true",
        },
    )

    assert unacknowledged_response.status_code == 400
    assert "1,048,576" in unacknowledged_response.json()["detail"]
    assert "acknowledge" in unacknowledged_response.json()["detail"].lower()

    assert acknowledged_response.status_code == 201
    acknowledged_status = await_analysis_job(client, acknowledged_response.json()["job_id"])
    assert acknowledged_status["state"] == "succeeded"
    assert len(acknowledged_status["result"]["analysis_columns"]) == HIGH_CARDINALITY_COLUMN_THRESHOLD


def test_analysis_below_the_high_cardinality_threshold_starts_without_acknowledgement():
    wide_fixture = make_wide_fixture(HIGH_CARDINALITY_COLUMN_THRESHOLD - 1)
    analysis_columns = [
        f"column_{column_index}" for column_index in range(HIGH_CARDINALITY_COLUMN_THRESHOLD - 1)
    ]

    creation_response = start_analysis_job(
        client,
        "wide.csv",
        wide_fixture,
        {"analysis_columns": json.dumps(analysis_columns)},
    )

    assert creation_response.status_code == 201
    status = await_analysis_job(client, creation_response.json()["job_id"])
    assert status["state"] == "succeeded"


def test_analysis_job_analyzes_the_chosen_worksheet_of_a_workbook():
    workbook_bytes = make_workbook_bytes(
        {
            "Summary": [["headline"], ["quarterly totals"]],
            "Data": [["record_id", "value"], ["A", "x"], ["B", ""]],
        }
    )
    creation_response = start_analysis_job(
        client,
        "workbook.xlsx",
        workbook_bytes,
        {"analysis_columns": json.dumps(["value"]), "sheet": "Data"},
    )

    assert creation_response.status_code == 201
    status = await_analysis_job(client, creation_response.json()["job_id"])
    assert status["state"] == "succeeded"
    assert status["result"]["input_rows"] == 2
