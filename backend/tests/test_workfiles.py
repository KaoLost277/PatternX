from app.workfiles import (
    analysis_database_path,
    clean_up_request,
    new_request_directory,
    prepare_work_directory,
    uploads_directory,
)


def test_cleaning_a_request_preserves_another_requests_work_files(tmp_path):
    work_directory = tmp_path / "work"
    prepare_work_directory(work_directory)

    first_request_directory = new_request_directory(work_directory)
    second_request_directory = new_request_directory(work_directory)
    second_database_path = analysis_database_path(second_request_directory)
    second_database_path.write_text("still in use", encoding="utf-8")

    clean_up_request(first_request_directory)

    assert not first_request_directory.exists()
    assert second_database_path.read_text(encoding="utf-8") == "still in use"
    assert list(uploads_directory(work_directory).iterdir()) == [second_request_directory]

    clean_up_request(second_request_directory)
    assert list(uploads_directory(work_directory).iterdir()) == []
