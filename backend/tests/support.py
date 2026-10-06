import io
import json
import time
from pathlib import Path

import openpyxl
from fastapi.testclient import TestClient
from httpx import Response

from app.main import create_application


def make_test_client(work_directory: Path, analysis_batch_rows: int | None = None) -> TestClient:
    if analysis_batch_rows is None:
        application = create_application(work_directory)
    else:
        application = create_application(work_directory, analysis_batch_rows=analysis_batch_rows)
    return TestClient(application)


def make_workbook_bytes(sheets: dict[str, list[list[object]]]) -> bytes:
    """Build an .xlsx workbook in memory with one worksheet per entry."""
    workbook = openpyxl.Workbook()
    default_sheet = workbook.active
    for sheet_index, (sheet_name, rows) in enumerate(sheets.items()):
        if sheet_index == 0:
            worksheet = default_sheet
            worksheet.title = sheet_name
        else:
            worksheet = workbook.create_sheet(sheet_name)
        for row in rows:
            worksheet.append(row)

    workbook_buffer = io.BytesIO()
    workbook.save(workbook_buffer)
    return workbook_buffer.getvalue()


def start_analysis_job(
    test_client: TestClient,
    file_name: str,
    file_bytes: bytes,
    form_fields: dict[str, str],
) -> Response:
    """Start one analysis job through the API and return its creation response."""
    return test_client.post(
        "/api/analysis-jobs",
        files={"file": (file_name, file_bytes, "text/csv")},
        data=form_fields,
    )


def await_analysis_job(
    test_client: TestClient,
    job_id: str,
    timeout_seconds: float = 30.0,
) -> dict[str, object]:
    """Poll one analysis job until it is finished and return its status payload."""
    deadline = time.monotonic() + timeout_seconds
    while True:
        status = test_client.get(f"/api/analysis-jobs/{job_id}").json()
        if status["state"] != "running":
            return status
        if time.monotonic() >= deadline:
            raise AssertionError(f"The analysis job {job_id} did not finish in time.")
        time.sleep(0.01)


def run_analysis_job(
    test_client: TestClient,
    file_name: str,
    file_bytes: bytes,
    form_fields: dict[str, str],
) -> dict[str, object]:
    """Start one analysis job, wait for it to finish, and return its status payload."""
    creation_response = start_analysis_job(test_client, file_name, file_bytes, form_fields)
    assert creation_response.status_code == 201
    return await_analysis_job(test_client, creation_response.json()["job_id"])


def pattern_analysis_fields(
    analysis_columns: list[str],
    identifier_column: str | None = None,
    missing_markers_by_column: dict[str, list[str]] | None = None,
    sheet: str | None = None,
) -> dict[str, str]:
    """Build the form fields of one pattern analysis request."""
    form_fields = {"analysis_columns": json.dumps(analysis_columns)}
    if identifier_column is not None:
        form_fields["identifier_column"] = identifier_column
    if missing_markers_by_column is not None:
        form_fields["missing_markers"] = json.dumps(missing_markers_by_column)
    if sheet is not None:
        form_fields["sheet"] = sheet

    return form_fields


def run_pattern_analysis_job(
    test_client: TestClient,
    csv_bytes: bytes,
    analysis_columns: list[str],
    identifier_column: str | None = None,
    missing_markers_by_column: dict[str, list[str]] | None = None,
    file_name: str = "data.csv",
    sheet: str | None = None,
) -> dict[str, object]:
    """Run one full pattern analysis job and return its finished status payload."""
    return run_analysis_job(
        test_client,
        file_name,
        csv_bytes,
        pattern_analysis_fields(
            analysis_columns,
            identifier_column,
            missing_markers_by_column,
            sheet,
        ),
    )


def assert_no_working_files_left(work_directory: Path) -> None:
    assert list((work_directory / "uploads").iterdir()) == []
    assert list((work_directory / "duckdb").iterdir()) == []