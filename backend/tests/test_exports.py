import csv
import io
import json

from fastapi.testclient import TestClient

from app.exports import inert_cell_text
from app.main import app
from support import (
    make_test_client,
    run_analysis_job,
)

client = TestClient(app)

COLUMN_COMPLETENESS_EXPORT_NAME = "column_completeness.csv"
PATTERN_SUMMARY_EXPORT_NAME = "pattern_summary.csv"

# Deterministic fixture: hand-checkable counts and shares per column, and three
# distinct Completeness Patterns over the two analyzed columns.
EXPORT_FIXTURE = (
    b"record_id,email,phone\n"
    b"A1,alice@example.com,555-0100\n"
    b"A2,,555-0101\n"
    b"A3,bob@example.com,\n"
)

# Twelve distinct Completeness Patterns over four analyzed columns: more entries
# than the UI shows at once, so silent truncation in the export would show here.
# One "x" is a present value, one empty cell a missing value.
MANY_PATTERN_FIXTURE = (
    b"col_a,col_b,col_c,col_d\n"
    b",,,\n"
    b",,,x\n"
    b",,x,\n"
    b",,x,x\n"
    b",x,,\n"
    b",x,,x\n"
    b",x,x,\n"
    b",x,x,x\n"
    b"x,,,\n"
    b"x,,,x\n"
    b"x,,x,\n"
    b"x,,x,x\n"
)

HOSTILE_FIXTURE = (
    b'"=HYPERLINK(""http://example.com"")","<script>alert(1)</script>"," =1+1"\n'
    b"secret-value,other-secret,third-secret\n"
)


def run_export_analysis(test_client, csv_bytes, analysis_columns, file_name="data.csv"):
    return run_analysis_job(
        test_client,
        file_name,
        csv_bytes,
        {"analysis_columns": json.dumps(analysis_columns)},
    )


def download_export(test_client, job_id, export_file_name):
    return test_client.get(f"/api/analysis-jobs/{job_id}/exports/{export_file_name}")


def download_pattern_rows_export(test_client, job_id, pattern_index):
    return test_client.get(
        f"/api/analysis-jobs/{job_id}/patterns/{pattern_index}/exports/rows.csv"
    )


def parse_export_csv(response) -> list[list[str]]:
    export_text = response.content.decode("utf-8-sig")
    return list(csv.reader(io.StringIO(export_text)))


def test_finished_analysis_offers_both_summary_downloads_with_the_documented_file_names():
    status = run_export_analysis(client, EXPORT_FIXTURE, ["email", "phone"])
    assert status["state"] == "succeeded"

    completeness_response = download_export(
        client, status["job_id"], COLUMN_COMPLETENESS_EXPORT_NAME
    )
    pattern_response = download_export(client, status["job_id"], PATTERN_SUMMARY_EXPORT_NAME)

    assert completeness_response.status_code == 200
    assert completeness_response.headers["content-type"].startswith("text/csv")
    assert COLUMN_COMPLETENESS_EXPORT_NAME in completeness_response.headers["content-disposition"]
    assert pattern_response.status_code == 200
    assert pattern_response.headers["content-type"].startswith("text/csv")
    assert PATTERN_SUMMARY_EXPORT_NAME in pattern_response.headers["content-disposition"]

    assert parse_export_csv(completeness_response)[0] == [
        "column",
        "input_rows",
        "input_rows_with_value",
        "share_with_value",
        "input_rows_missing_value",
        "share_missing_value",
    ]
    assert parse_export_csv(pattern_response)[0] == [
        "email",
        "phone",
        "input_rows",
        "share_of_input_rows",
    ]


def test_column_completeness_export_reports_counts_and_shares_for_every_column():
    status = run_export_analysis(client, EXPORT_FIXTURE, ["email", "phone"])

    response = download_export(client, status["job_id"], COLUMN_COMPLETENESS_EXPORT_NAME)
    export_rows = parse_export_csv(response)

    assert export_rows == [
        [
            "column",
            "input_rows",
            "input_rows_with_value",
            "share_with_value",
            "input_rows_missing_value",
            "share_missing_value",
        ],
        ["record_id", "3", "3", "1.0", "0", "0.0"],
        ["email", "3", "2", "0.6666666666666666", "1", "0.3333333333333333"],
        ["phone", "3", "2", "0.6666666666666666", "1", "0.3333333333333333"],
    ]


def test_pattern_summary_export_reports_every_observed_pattern():
    status = run_export_analysis(client, EXPORT_FIXTURE, ["email", "phone"])

    response = download_export(client, status["job_id"], PATTERN_SUMMARY_EXPORT_NAME)
    export_rows = parse_export_csv(response)

    assert export_rows == [
        ["email", "phone", "input_rows", "share_of_input_rows"],
        ["missing", "present", "1", "0.3333333333333333"],
        ["present", "missing", "1", "0.3333333333333333"],
        ["present", "present", "1", "0.3333333333333333"],
    ]


def test_pattern_summary_export_holds_every_pattern_however_many_there_are():
    status = run_export_analysis(client, MANY_PATTERN_FIXTURE, ["col_a", "col_b", "col_c", "col_d"])
    assert status["state"] == "succeeded"
    assert len(status["result"]["patterns"]) == 12

    response = download_export(client, status["job_id"], PATTERN_SUMMARY_EXPORT_NAME)
    export_rows = parse_export_csv(response)

    # One header row plus one row per observed pattern: no entry is dropped.
    assert len(export_rows) == 13
    exported_statuses = {tuple(export_row[:4]) for export_row in export_rows[1:]}
    reported_statuses = {
        tuple(pattern["statuses"]) for pattern in status["result"]["patterns"]
    }
    assert exported_statuses == reported_statuses
    assert sum(int(export_row[4]) for export_row in export_rows[1:]) == 12


def test_exports_never_contain_raw_rows_or_row_level_details():
    status = run_export_analysis(client, EXPORT_FIXTURE, ["email", "phone"])

    completeness_text = download_export(
        client, status["job_id"], COLUMN_COMPLETENESS_EXPORT_NAME
    ).content.decode("utf-8-sig")
    pattern_text = download_export(
        client, status["job_id"], PATTERN_SUMMARY_EXPORT_NAME
    ).content.decode("utf-8-sig")

    for export_text in [completeness_text, pattern_text]:
        assert "alice@example.com" not in export_text
        assert "bob@example.com" not in export_text
        assert "555-0100" not in export_text
        assert "A1" not in export_text


def test_hostile_column_names_are_exported_as_inert_text():
    hostile_column_names = [
        '=HYPERLINK("http://example.com")',
        "<script>alert(1)</script>",
        "=1+1",
    ]
    status = run_export_analysis(
        client,
        HOSTILE_FIXTURE,
        hostile_column_names,
        file_name="hostile.csv",
    )
    assert status["state"] == "succeeded"

    completeness_rows = parse_export_csv(
        download_export(client, status["job_id"], COLUMN_COMPLETENESS_EXPORT_NAME)
    )
    pattern_rows = parse_export_csv(
        download_export(client, status["job_id"], PATTERN_SUMMARY_EXPORT_NAME)
    )

    # The names stay text. The downloads are CSV file downloads, so nothing is
    # rendered as markup, and no cell can be read as a spreadsheet formula.
    for export_rows in [completeness_rows, pattern_rows]:
        for export_row in export_rows:
            for cell in export_row:
                assert not cell.startswith(("=", "+", "-", "@", "\t", "\r"))
                assert not cell.lstrip().startswith(("=", "+", "-", "@"))

    exported_column_names = [export_row[0] for export_row in completeness_rows[1:]]
    assert exported_column_names == [
        '\'=HYPERLINK("http://example.com")',
        "<script>alert(1)</script>",
        "'=1+1",
    ]
    assert pattern_rows[0][:3] == [
        '\'=HYPERLINK("http://example.com")',
        "<script>alert(1)</script>",
        "'=1+1",
    ]
    assert pattern_rows[1][:3] == ["present", "present", "present"]


def test_exported_values_a_spreadsheet_could_trim_into_a_formula_stay_inert():
    # The CSV reader trims header names before the app ever sees them, so this
    # guard cannot be reached through the API seam. It is checked here so the
    # protection cannot silently regress.
    assert inert_cell_text(" =1+1") == "' =1+1"
    assert inert_cell_text("=1+1") == "'=1+1"
    assert inert_cell_text("plain column name") == "plain column name"


def test_exports_of_an_unfinished_analysis_are_refused_with_a_clear_error(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)
    failed_status = run_export_analysis(
        test_client,
        b"record_id,email\n",
        ["email"],
        file_name="header-only.csv",
    )
    assert failed_status["state"] == "failed"

    completeness_response = download_export(
        test_client, failed_status["job_id"], COLUMN_COMPLETENESS_EXPORT_NAME
    )
    missing_job_response = download_export(
        test_client, "not-a-job", PATTERN_SUMMARY_EXPORT_NAME
    )

    assert completeness_response.status_code == 409
    assert "finished summaries" in completeness_response.json()["detail"].lower()
    assert missing_job_response.status_code == 404
    assert "not-a-job" in missing_job_response.json()["detail"]


def test_downloading_exports_leaves_only_the_retained_database(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)
    status = run_export_analysis(test_client, EXPORT_FIXTURE, ["email", "phone"])

    download_export(test_client, status["job_id"], COLUMN_COMPLETENESS_EXPORT_NAME)
    download_export(test_client, status["job_id"], PATTERN_SUMMARY_EXPORT_NAME)

    job_directory = work_directory / "uploads" / f"job-{status['job_id']}"
    assert [path.name for path in job_directory.iterdir()] == ["analysis.sqlite3"]


def test_pattern_rows_export_includes_all_source_ordered_rows_as_inert_csv():
    source_rows = []
    for row_index in range(653):
        record_id = "=1+1" if row_index == 0 else f"repeated-id-{row_index % 3}"
        formula_value = " =SUM(A1:A2)" if row_index == 1 else f"value-{row_index}"
        notes = (
            'comma, quote " and\na second line'
            if row_index == 0
            else f"note-{row_index}-" + ("x" * 120)
        )
        source_rows.append([record_id, formula_value, f"matched-{row_index:03}", notes])
    source_rows.append(["other-pattern", "plain", "", "not exported"])

    source = io.StringIO(newline="")
    writer = csv.writer(source, lineterminator="\n")
    writer.writerow(["record_id", "=formula_header", "analysis", "notes"])
    writer.writerows(source_rows)

    status = run_export_analysis(
        client,
        source.getvalue().encode("utf-8"),
        ["analysis"],
    )
    assert status["state"] == "succeeded"
    matching_pattern_index = next(
        pattern_index
        for pattern_index, pattern in enumerate(status["result"]["patterns"])
        if pattern["statuses"] == ["present"]
    )

    first_page = client.get(
        f"/api/analysis-jobs/{status['job_id']}/patterns/{matching_pattern_index}/rows?page=1"
    )
    second_page = client.get(
        f"/api/analysis-jobs/{status['job_id']}/patterns/{matching_pattern_index}/rows?page=2"
    )
    last_page = client.get(
        f"/api/analysis-jobs/{status['job_id']}/patterns/{matching_pattern_index}/rows?page=14"
    )
    response = download_pattern_rows_export(client, status["job_id"], matching_pattern_index)
    analysis_columns_response = client.get(
        f"/api/analysis-jobs/{status['job_id']}/patterns/{matching_pattern_index}/exports/rows.csv",
        params={"column_mode": "analysis"},
    )

    assert first_page.status_code == 200
    assert len(first_page.json()["rows"]) == 50
    assert second_page.status_code == 200
    assert len(second_page.json()["rows"]) == 50
    assert last_page.status_code == 200
    assert last_page.json()["page"] == 14
    assert len(last_page.json()["rows"]) == 3
    assert response.status_code == 200
    assert analysis_columns_response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"] == (
        f'attachment; filename="pattern_rows_{matching_pattern_index + 1}.csv"'
    )

    exported_text = response.content.decode("utf-8-sig")
    exported_rows = parse_export_csv(response)
    assert exported_rows[0] == [
        "record_id",
        "'=formula_header",
        "analysis",
        "notes",
    ]
    assert exported_rows[1:] == [
        [
            "'=1+1" if row_index == 0 else f"repeated-id-{row_index % 3}",
            "' =SUM(A1:A2)" if row_index == 1 else f"value-{row_index}",
            f"matched-{row_index:03}",
            'comma, quote " and\na second line'
            if row_index == 0
            else f"note-{row_index}-" + ("x" * 120),
        ]
        for row_index in range(653)
    ]
    assert len(exported_rows) == 654
    assert '"comma, quote "" and\na second line"' in exported_text
    assert exported_text.endswith("\r\n")

    analysis_export_rows = parse_export_csv(analysis_columns_response)
    assert analysis_export_rows[0] == ["analysis"]
    assert analysis_export_rows[1:] == [
        [f"matched-{row_index:03}"] for row_index in range(653)
    ]


def test_pattern_rows_export_rejects_unknown_job_pattern_and_failed_analysis(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)

    successful_status = run_export_analysis(
        test_client,
        EXPORT_FIXTURE,
        ["email", "phone"],
    )
    unknown_job_response = download_pattern_rows_export(test_client, "not-a-job", 0)
    unknown_pattern_response = download_pattern_rows_export(
        test_client, successful_status["job_id"], 99
    )

    failed_status = run_export_analysis(
        test_client,
        b"record_id,email\n",
        ["email"],
        file_name="header-only.csv",
    )
    failed_response = download_pattern_rows_export(test_client, failed_status["job_id"], 0)

    assert unknown_job_response.status_code == 404
    assert "not-a-job" in unknown_job_response.json()["detail"]
    assert unknown_pattern_response.status_code == 404
    assert failed_status["state"] == "failed"
    assert failed_response.status_code == 409
    assert "analysis succeeds" in failed_response.json()["detail"]
