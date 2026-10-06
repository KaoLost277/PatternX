from fastapi.testclient import TestClient

from app.main import app
from support import assert_no_working_files_left, make_test_client

client = TestClient(app)


def test_import_returns_column_names_in_file_order():
    csv_bytes = b"customer_id,email,phone\n1,alice@example.com,555\n"

    response = client.post(
        "/api/imports",
        files={"file": ("customers.csv", csv_bytes, "text/csv")},
    )

    assert response.status_code == 200
    assert response.json() == {"columns": ["customer_id", "email", "phone"]}


def test_import_rejects_empty_file_with_clear_error():
    response = client.post(
        "/api/imports",
        files={"file": ("empty.csv", b"", "text/csv")},
    )

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_import_rejects_unsupported_file_format_with_clear_error():
    response = client.post(
        "/api/imports",
        files={"file": ("workbook.xlsx", b"PK\x03\x04not-a-csv", "application/octet-stream")},
    )

    assert response.status_code == 415
    assert "csv" in response.json()["detail"].lower()


def test_import_rejects_malformed_file_with_clear_error():
    response = client.post(
        "/api/imports",
        files={"file": ("broken.csv", b"\xff\xfe\x00\x01not-valid-text\xff", "text/csv")},
    )

    assert response.status_code == 400
    assert "csv" in response.json()["detail"].lower()


def test_import_returns_hostile_header_values_verbatim_as_json_text():
    csv_bytes = b"<script>alert('x')</script>,notes\n1,hello\n"

    response = client.post(
        "/api/imports",
        files={"file": ("hostile.csv", csv_bytes, "text/csv")},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {"columns": ["<script>alert('x')</script>", "notes"]}


def test_work_directory_contains_uploads_and_duckdb_working_directories(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)

    response = test_client.post(
        "/api/imports",
        files={"file": ("customers.csv", b"customer_id\n1\n", "text/csv")},
    )

    assert response.status_code == 200
    assert (work_directory / "uploads").is_dir()
    assert (work_directory / "duckdb").is_dir()


def test_successful_import_leaves_no_working_files_behind(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)

    response = test_client.post(
        "/api/imports",
        files={"file": ("customers.csv", b"customer_id\n1\n", "text/csv")},
    )

    assert response.status_code == 200
    assert_no_working_files_left(work_directory)


def test_failed_import_leaves_no_working_files_behind(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)

    response = test_client.post(
        "/api/imports",
        files={"file": ("broken.csv", b"\xff\xfe\x00\x01not-valid-text\xff", "text/csv")},
    )

    assert response.status_code == 400
    assert_no_working_files_left(work_directory)
