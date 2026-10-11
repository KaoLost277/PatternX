import json
import threading
import time
from datetime import date
from pathlib import Path

from app import data_contract_jobs
from app.patterns import AnalysisCancelledError
from support import make_test_client, make_workbook_bytes


def start_contract_job(
    client,
    file_name: str,
    file_bytes: bytes,
    contract: dict[str, object],
    missing_markers: dict[str, list[str]] | None = None,
    sheet: str | None = None,
):
    form_fields = {"contract_json": json.dumps(contract)}
    if missing_markers is not None:
        form_fields["missing_markers"] = json.dumps(missing_markers)
    if sheet is not None:
        form_fields["sheet"] = sheet

    return client.post(
        "/api/data-contract-jobs",
        files={"file": (file_name, file_bytes, "application/octet-stream")},
        data=form_fields,
    )


def await_contract_job(client, job_id: str, timeout_seconds: float = 5.0):
    deadline = time.monotonic() + timeout_seconds
    while True:
        response = client.get(f"/api/data-contract-jobs/{job_id}")
        assert response.status_code == 200
        status = response.json()
        if status["state"] != "running":
            return status
        if time.monotonic() >= deadline:
            raise AssertionError(f"The data contract job {job_id} did not finish in time.")
        time.sleep(0.01)


def run_contract_job(
    client,
    file_name: str,
    file_bytes: bytes,
    contract: dict[str, object],
    missing_markers: dict[str, list[str]] | None = None,
    sheet: str | None = None,
):
    response = start_contract_job(
        client,
        file_name,
        file_bytes,
        contract,
        missing_markers,
        sheet,
    )
    assert response.status_code == 201
    return await_contract_job(client, response.json()["job_id"])


def contract_rules() -> dict[str, object]:
    return {
        "version": 1,
        "rules": [
            {"column": "Age", "kind": "type", "value_type": "integer"},
            {"column": "Status", "kind": "required"},
            {
                "column": "Start Date",
                "kind": "type",
                "value_type": "date",
                "date_format": "YYYY-MM-DD",
            },
            {"column": "Amount", "kind": "type", "value_type": "number"},
            {
                "column": "Status",
                "kind": "enum",
                "values": ["Active", "Inactive"],
            },
        ],
    }


CONTRACT_CSV = (
    b"Status,Age,Amount,Start Date\n"
    b"Active,01,1.5,2025-02-28\n"
    b"inactive,2,2e2,2024-02-29\n"
    b",,,\n"
    b"N/A,3,0,2023-12-31\n"
    b"Inactive,4,inf,2023-12-31\n"
)


def test_contract_job_reports_exact_aggregate_counts_and_deletes_source_rows(
    tmp_path: Path,
) -> None:
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)

    status = run_contract_job(
        client,
        "customers.csv",
        CONTRACT_CSV,
        contract_rules(),
        {"Status": [" N/A "]},
    )

    assert status["state"] == "succeeded"
    assert status["analysis_kind"] == "data_contract"
    assert status["progress"] == {"items_done": 5, "items_total": 5}
    assert status["result"] == {
        "kind": "data_contract",
        "input_rows": 5,
        "rules": [
            {
                "rule_index": 0,
                "missing_count": 1,
                "passing_count": 4,
                "failing_count": 0,
            },
            {
                "rule_index": 1,
                "missing_count": 2,
                "passing_count": 3,
                "failing_count": 2,
            },
            {
                "rule_index": 2,
                "missing_count": 1,
                "passing_count": 4,
                "failing_count": 0,
            },
            {
                "rule_index": 3,
                "missing_count": 1,
                "passing_count": 3,
                "failing_count": 1,
            },
            {
                "rule_index": 4,
                "missing_count": 2,
                "passing_count": 2,
                "failing_count": 1,
            },
        ],
    }
    assert "Active" not in json.dumps(status["result"])
    assert "N/A" not in json.dumps(status["result"])
    assert list((work_directory / "uploads").iterdir()) == []
    assert client.get(f"/api/data-contract-jobs/{status['job_id']}/rows").status_code == 404
    assert client.get(f"/api/data-contract-jobs/{status['job_id']}/exports/rows.csv").status_code == 404


def test_contract_job_uses_the_selected_xlsx_worksheet(tmp_path: Path) -> None:
    client = make_test_client(tmp_path / "work")
    workbook = make_workbook_bytes(
        {
            "Customers": [
                ["Status", "Age", "Start Date"],
                ["Active", 4, date(2025, 2, 28)],
                ["Inactive", "not an integer", "2025-02-30"],
            ],
            "Ignore": [["Status"], ["Ignored"]],
        }
    )
    contract = {
        "version": 1,
        "rules": [
            {"column": "Status", "kind": "enum", "values": ["Active", "Inactive"]},
            {"column": "Age", "kind": "type", "value_type": "integer"},
            {
                "column": "Start Date",
                "kind": "type",
                "value_type": "date",
                "date_format": "YYYY-MM-DD HH:MM:SS",
            },
        ],
    }

    status = run_contract_job(
        client,
        "customers.xlsx",
        workbook,
        contract,
        sheet="Customers",
    )

    assert status["state"] == "succeeded"
    assert status["result"] == {
        "kind": "data_contract",
        "input_rows": 2,
        "rules": [
            {"rule_index": 0, "missing_count": 0, "passing_count": 2, "failing_count": 0},
            {"rule_index": 1, "missing_count": 0, "passing_count": 1, "failing_count": 1},
            {"rule_index": 2, "missing_count": 0, "passing_count": 1, "failing_count": 1},
        ],
    }


def test_contract_preflight_rejects_whole_request_and_cleans_uploads(tmp_path: Path) -> None:
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)
    unsupported_version = start_contract_job(
        client,
        "customers.csv",
        b"Status\nActive\n",
        {"version": 2, "rules": [{"column": "Status", "kind": "required"}]},
    )
    unknown_column = start_contract_job(
        client,
        "customers.csv",
        b"Status\nActive\n",
        {
            "version": 1,
            "rules": [
                {"column": "Status", "kind": "required"},
                {"column": "Other", "kind": "required"},
            ],
        },
    )
    unsupported_rule = start_contract_job(
        client,
        "customers.csv",
        b"Status\nActive\n",
        {"version": 1, "rules": [{"column": "Status", "kind": "regex", "pattern": ".*"}]},
    )

    assert unsupported_version.status_code == 400
    assert "version" in unsupported_version.json()["detail"].casefold()
    assert unknown_column.status_code == 400
    assert "other" in unknown_column.json()["detail"].casefold()
    assert unsupported_rule.status_code == 400
    assert "regex" in unsupported_rule.json()["detail"].casefold()
    assert list((work_directory / "uploads").iterdir()) == []


def test_contract_job_failure_removes_database_and_uploads(
    tmp_path: Path,
    monkeypatch,
) -> None:
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)

    def fail_summary(self, _connection):
        raise ValueError("The contract scan failed.")

    monkeypatch.setattr(data_contract_jobs.DataContractJob, "compute_summary", fail_summary)
    status = run_contract_job(
        client,
        "customers.csv",
        b"Status\nActive\n",
        {"version": 1, "rules": [{"column": "Status", "kind": "required"}]},
    )

    assert status["state"] == "failed"
    assert status["error"] == "The contract scan failed."
    assert status["result"] is None
    assert list((work_directory / "uploads").iterdir()) == []


def test_contract_job_cancellation_removes_database_and_uploads(
    tmp_path: Path,
    monkeypatch,
) -> None:
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)
    scan_started = threading.Event()

    def wait_for_cancellation(self, _connection):
        scan_started.set()
        while not self.is_cancel_requested():
            time.sleep(0.005)
        raise AnalysisCancelledError("The analysis was cancelled.")

    monkeypatch.setattr(
        data_contract_jobs.DataContractJob,
        "compute_summary",
        wait_for_cancellation,
    )
    started = start_contract_job(
        client,
        "customers.csv",
        b"Status\nActive\n",
        {"version": 1, "rules": [{"column": "Status", "kind": "required"}]},
    )
    assert started.status_code == 201
    job_id = started.json()["job_id"]
    assert scan_started.wait(timeout=5.0)

    cancelled = client.post(f"/api/data-contract-jobs/{job_id}/cancel")

    assert cancelled.status_code == 200
    assert cancelled.json()["state"] == "cancelled"
    assert cancelled.json()["result"] is None
    assert list((work_directory / "uploads").iterdir()) == []


def test_contract_job_is_cleared_when_a_new_dataset_is_imported(tmp_path: Path) -> None:
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)
    status = run_contract_job(
        client,
        "customers.csv",
        b"Status\nActive\n",
        {"version": 1, "rules": [{"column": "Status", "kind": "required"}]},
    )

    imported = client.post(
        "/api/imports",
        files={"file": ("next.csv", b"Status\nInactive\n", "text/csv")},
    )

    assert imported.status_code == 200
    assert client.get(f"/api/data-contract-jobs/{status['job_id']}").status_code == 404
    assert list((work_directory / "uploads").iterdir()) == []


def test_changed_missing_markers_clear_the_contract_job(tmp_path: Path) -> None:
    work_directory = tmp_path / "work"
    client = make_test_client(work_directory)
    csv_bytes = b"Status\nActive\nN/A\n"
    status = run_contract_job(
        client,
        "customers.csv",
        csv_bytes,
        {"version": 1, "rules": [{"column": "Status", "kind": "required"}]},
    )

    completeness = client.post(
        "/api/column-completeness",
        files={"file": ("customers.csv", csv_bytes, "text/csv")},
        data={
            "missing_markers": json.dumps({"Status": ["N/A"]}),
            "reset_analysis_results": "true",
        },
    )

    assert completeness.status_code == 200
    assert client.get(f"/api/data-contract-jobs/{status['job_id']}").status_code == 404
    assert list((work_directory / "uploads").iterdir()) == []
