import io
from pathlib import Path

import openpyxl
from fastapi.testclient import TestClient

from app.main import create_application


def make_test_client(work_directory: Path) -> TestClient:
    application = create_application(work_directory)
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


def assert_no_working_files_left(work_directory: Path) -> None:
    assert list((work_directory / "uploads").iterdir()) == []
    assert list((work_directory / "duckdb").iterdir()) == []