import json

from support import (
    await_analysis_job,
    make_test_client,
    make_workbook_bytes,
    run_analysis_job,
    start_analysis_job,
)


ROWS_FIXTURE = (
    b"record_id,email,phone,notes\n"
    b'A1," n/A ",555-0100,first\n'
    b"A1,,555-0101,second\n"
    b"A2,bob@example.com,,third\n"
    b"A1,n/a,555-0102,fourth\n"
    b"A3,alice@example.com,555-0103,fifth\n"
)


def test_pattern_rows_include_exact_matches_in_source_order_and_all_columns(tmp_path):
    test_client = make_test_client(tmp_path / "work")
    status = run_analysis_job(
        test_client,
        "data.csv",
        ROWS_FIXTURE,
        {
            "analysis_columns": json.dumps(["email", "phone"]),
            "missing_markers": json.dumps({"email": ["n/a"]}),
        },
    )
    assert status["state"] == "succeeded"
    target_pattern_index = next(
        pattern_index
        for pattern_index, pattern in enumerate(status["result"]["patterns"])
        if pattern["statuses"] == ["missing", "present"]
    )

    response = test_client.get(
        f"/api/analysis-jobs/{status['job_id']}/patterns/{target_pattern_index}/rows"
    )

    assert response.status_code == 200
    assert response.json() == {
        "columns": ["record_id", "email", "phone", "notes"],
        "rows": [
            ["A1", " n/A ", "555-0100", "first"],
            ["A1", None, "555-0101", "second"],
            ["A1", "n/a", "555-0102", "fourth"],
        ],
        "page": 1,
        "page_size": 50,
        "total_rows": 3,
    }


def test_pattern_row_pages_cover_every_match_and_report_the_exact_total(tmp_path):
    test_client = make_test_client(tmp_path / "work")
    row_count = 107
    csv_lines = ["record_id,email"]
    for row_index in range(row_count):
        csv_lines.append(f"R{row_index:03},")
    status = run_analysis_job(
        test_client,
        "data.csv",
        "\n".join(csv_lines).encode("utf-8"),
        {"analysis_columns": json.dumps(["email"])},
    )
    assert status["state"] == "succeeded"

    first_page = test_client.get(
        f"/api/analysis-jobs/{status['job_id']}/patterns/0/rows?page=1"
    )
    second_page = test_client.get(
        f"/api/analysis-jobs/{status['job_id']}/patterns/0/rows?page=2"
    )
    last_page = test_client.get(
        f"/api/analysis-jobs/{status['job_id']}/patterns/0/rows?page=3"
    )
    page_past_the_end = test_client.get(
        f"/api/analysis-jobs/{status['job_id']}/patterns/0/rows?page=999999999999999999999999"
    )

    assert first_page.status_code == 200
    assert second_page.status_code == 200
    assert last_page.status_code == 200
    assert page_past_the_end.status_code == 200
    assert first_page.json()["rows"] == [
        [f"R{row_index:03}", None] for row_index in range(50)
    ]
    assert second_page.json()["rows"] == [
        [f"R{row_index:03}", None] for row_index in range(50, 100)
    ]
    assert last_page.json()["rows"] == [
        [f"R{row_index:03}", None] for row_index in range(100, row_count)
    ]
    assert [
        first_page.json()["page"],
        second_page.json()["page"],
        last_page.json()["page"],
    ] == [1, 2, 3]
    page_payloads = [
        first_page.json(),
        second_page.json(),
        last_page.json(),
    ]
    assert [payload["page_size"] for payload in page_payloads] == [50, 50, 50]
    assert [payload["total_rows"] for payload in page_payloads] == [107, 107, 107]
    assert page_past_the_end.json() == {
        "columns": ["record_id", "email"],
        "rows": [],
        "page": 999999999999999999999999,
        "page_size": 50,
        "total_rows": 107,
    }


def test_pattern_rows_report_clear_errors_for_unknown_targets_and_invalid_pages(tmp_path):
    test_client = make_test_client(tmp_path / "work")
    status = run_analysis_job(
        test_client,
        "data.csv",
        ROWS_FIXTURE,
        {"analysis_columns": json.dumps(["email", "phone"])},
    )
    job_id = status["job_id"]

    unknown_job = test_client.get("/api/analysis-jobs/missing/patterns/0/rows")
    unknown_pattern = test_client.get(f"/api/analysis-jobs/{job_id}/patterns/99/rows")
    invalid_page = test_client.get(f"/api/analysis-jobs/{job_id}/patterns/0/rows?page=0")

    assert unknown_job.status_code == 404
    assert "missing" in unknown_job.json()["detail"]
    assert unknown_pattern.status_code == 404
    assert "pattern" in unknown_pattern.json()["detail"].lower()
    assert "99" in unknown_pattern.json()["detail"]
    assert invalid_page.status_code == 422
    assert "greater than or equal to 1" in str(invalid_page.json()["detail"])


def test_successful_job_retains_only_its_staged_database(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)
    status = run_analysis_job(
        test_client,
        "data.csv",
        ROWS_FIXTURE,
        {"analysis_columns": json.dumps(["email", "phone"])},
    )
    job_directory = work_directory / "uploads" / f"job-{status['job_id']}"

    assert status["state"] == "succeeded"
    assert [path.name for path in job_directory.iterdir()] == ["analysis.sqlite3"]
    assert test_client.get(
        f"/api/analysis-jobs/{status['job_id']}/patterns/0/rows"
    ).status_code == 200


def test_workbook_rows_come_from_the_chosen_sheet_without_retaining_its_copy(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)
    workbook_bytes = make_workbook_bytes(
        {
            "Summary": [["title"], ["ignored"]],
            "Data": [
                ["record_id", "email", "notes"],
                ["A1", "", "first"],
                ["A1", "n/a", "second"],
                ["A2", "ada@example.com", "third"],
            ],
        }
    )
    status = run_analysis_job(
        test_client,
        "data.xlsx",
        workbook_bytes,
        {
            "analysis_columns": json.dumps(["email"]),
            "missing_markers": json.dumps({"email": ["n/a"]}),
            "sheet": "Data",
        },
    )

    response = test_client.get(
        f"/api/analysis-jobs/{status['job_id']}/patterns/0/rows"
    )
    job_directory = work_directory / "uploads" / f"job-{status['job_id']}"

    assert status["state"] == "succeeded"
    assert response.status_code == 200
    assert response.json() == {
        "columns": ["record_id", "email", "notes"],
        "rows": [["A1", None, "first"], ["A1", "n/a", "second"]],
        "page": 1,
        "page_size": 50,
        "total_rows": 2,
    }
    assert [path.name for path in job_directory.iterdir()] == ["analysis.sqlite3"]


def test_replacing_a_job_removes_its_retained_rows(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)
    first_status = run_analysis_job(
        test_client,
        "first.csv",
        ROWS_FIXTURE,
        {"analysis_columns": json.dumps(["email", "phone"])},
    )
    first_job_directory = work_directory / "uploads" / f"job-{first_status['job_id']}"
    assert first_job_directory.is_dir()

    second_status = run_analysis_job(
        test_client,
        "second.csv",
        b"name,value\nAda,x\n",
        {"analysis_columns": json.dumps(["value"])},
    )

    old_rows_response = test_client.get(
        f"/api/analysis-jobs/{first_status['job_id']}/patterns/0/rows"
    )
    new_rows_response = test_client.get(
        f"/api/analysis-jobs/{second_status['job_id']}/patterns/0/rows"
    )

    assert second_status["state"] == "succeeded"
    assert old_rows_response.status_code == 404
    assert not first_job_directory.exists()
    assert new_rows_response.status_code == 200
    assert new_rows_response.json()["rows"] == [["Ada", "x"]]


def test_startup_removes_stale_job_data(tmp_path):
    work_directory = tmp_path / "work"
    stale_job_directory = work_directory / "uploads" / "job-previous-run"
    stale_job_directory.mkdir(parents=True)
    (stale_job_directory / "analysis.sqlite3").write_text("stale row data", encoding="utf-8")

    test_client = make_test_client(work_directory)

    assert not stale_job_directory.exists()
    missing_job_response = test_client.get(
        "/api/analysis-jobs/previous-run/patterns/0/rows"
    )
    assert missing_job_response.status_code == 404


def test_startup_removes_stale_request_uploads(tmp_path):
    work_directory = tmp_path / "work"
    stale_request_directory = work_directory / "uploads" / "request-previous-run"
    stale_request_directory.mkdir(parents=True)
    (stale_request_directory / "raw-upload.csv").write_text(
        "private,row data", encoding="utf-8"
    )

    make_test_client(work_directory)

    assert not stale_request_directory.exists()


def test_graceful_shutdown_removes_the_current_jobs_retained_rows(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)

    with test_client:
        status = run_analysis_job(
            test_client,
            "data.csv",
            ROWS_FIXTURE,
            {"analysis_columns": json.dumps(["email", "phone"])},
        )
        job_directory = work_directory / "uploads" / f"job-{status['job_id']}"
        assert job_directory.is_dir()

    assert not job_directory.exists()


def test_failed_job_has_no_row_data_available(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)
    creation_response = start_analysis_job(
        test_client,
        "empty.csv",
        b"email\n",
        {"analysis_columns": json.dumps(["email"])},
    )
    assert creation_response.status_code == 201
    job_id = creation_response.json()["job_id"]
    status = await_analysis_job(test_client, job_id)

    rows_response = test_client.get(f"/api/analysis-jobs/{job_id}/patterns/0/rows")

    assert status["state"] == "failed"
    assert rows_response.status_code == 409
    assert "succeeds" in rows_response.json()["detail"]
    assert not (work_directory / "uploads" / f"job-{job_id}").exists()
