from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_application


def make_test_client(work_directory: Path) -> TestClient:
    application = create_application(work_directory)
    return TestClient(application)


def assert_no_working_files_left(work_directory: Path) -> None:
    assert list((work_directory / "uploads").iterdir()) == []
    assert list((work_directory / "duckdb").iterdir()) == []