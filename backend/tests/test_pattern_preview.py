from fastapi.testclient import TestClient

from app.main import app
from app.patterns import PatternTally
from support import run_pattern_analysis_job

client = TestClient(app)

# Three Input Rows share one Completeness Pattern (email missing, phone
# present), one row differs, and the identifier values repeat like real data.
PREVIEW_FIXTURE = (
    b"record_id,email,phone\n"
    b"A1,,555-0100\n"
    b"A2,,555-0101\n"
    b"A3,,555-0102\n"
    b"A4,alice@example.com,555-0103\n"
)

# Eight Input Rows share one pattern: more rows than one preview keeps.
CROWDED_PATTERN_FIXTURE = (
    b"record_id,email\n"
    b"A1,\n"
    b"A2,\n"
    b"A3,\n"
    b"A4,\n"
    b"A5,\n"
    b"A6,\n"
    b"A7,\n"
    b"A8,\n"
)

HOSTILE_PREVIEW_FIXTURE = (
    b'"<script>alert(1)</script>"\n'
    b"<script>alert('x')</script>\n"
    b"\"=cmd|' /C calc'!A0\"\n"
)


def patterns_of(status):
    return status["result"]["patterns"]


def test_clicking_a_pattern_shows_a_small_sample_of_its_input_rows():
    status = run_pattern_analysis_job(
        client, PREVIEW_FIXTURE, ["email", "phone"], identifier_column="record_id"
    )

    assert status["state"] == "succeeded"
    shared_pattern = next(
        pattern
        for pattern in patterns_of(status)
        if pattern["statuses"] == ["missing", "present"]
    )
    assert shared_pattern["count"] == 3

    preview_rows = shared_pattern["preview_rows"]
    identifier_values = [preview_row["identifier_value"] for preview_row in preview_rows]
    assert identifier_values == ["A1", "A2", "A3"]
    for preview_row in preview_rows:
        # The email cell is the missing one; the phone text is kept for
        # recognition.
        assert len(preview_row["values"]) == 2
        assert preview_row["values"][0] is None
        assert preview_row["values"][1].startswith("555-")


def test_present_and_missing_cells_keep_their_distinction_in_the_preview():
    csv_bytes = (
        b"record_id,email\n"
        b"A1,n/a\n"
        b"A2,\n"
    )
    status = run_pattern_analysis_job(
        client,
        csv_bytes,
        ["email"],
        identifier_column="record_id",
        missing_markers_by_column={"email": ["n/a"]},
    )
    missing_pattern = next(
        pattern for pattern in patterns_of(status) if pattern["statuses"] == ["missing"]
    )

    assert missing_pattern["count"] == 2
    marker_row, empty_row = missing_pattern["preview_rows"]
    # Both rows are missing the email value, and each preview keeps the text
    # that made it missing so the user can tell the cases apart.
    assert marker_row["values"] == ["n/a"]
    assert empty_row["values"] == [None]


def test_identifier_values_are_kept_out_of_the_analyzed_values():
    status = run_pattern_analysis_job(
        client, PREVIEW_FIXTURE, ["email", "phone"], identifier_column="record_id"
    )

    for pattern in patterns_of(status):
        for preview_row in pattern["preview_rows"]:
            assert len(preview_row["values"]) == 2
            assert preview_row["identifier_value"] not in preview_row["values"]


def test_a_preview_keeps_only_a_small_sample_of_rows():
    status = run_pattern_analysis_job(client, CROWDED_PATTERN_FIXTURE, ["email"])

    shared_pattern = patterns_of(status)[0]
    assert shared_pattern["count"] == 8
    assert len(shared_pattern["preview_rows"]) == 5


def test_hostile_headers_and_values_are_returned_verbatim_as_json_text():
    status = run_pattern_analysis_job(
        client,
        HOSTILE_PREVIEW_FIXTURE,
        ["<script>alert(1)</script>"],
    )
    status_response = client.get(f"/api/analysis-jobs/{status['job_id']}")

    assert status["state"] == "succeeded"
    assert status_response.headers["content-type"].startswith("application/json")
    assert status["result"]["analysis_columns"] == ["<script>alert(1)</script>"]

    shown_values = []
    for pattern in patterns_of(status):
        for preview_row in pattern["preview_rows"]:
            shown_values.extend(preview_row["values"])

    assert "<script>alert('x')</script>" in shown_values
    assert "=cmd|' /C calc'!A0" in shown_values


def test_long_cell_values_are_shortened_in_the_preview():
    long_value = "x" * 5_000
    csv_bytes = f"record_id,email\nA1,{long_value}\n".encode("utf-8")

    status = run_pattern_analysis_job(
        client, csv_bytes, ["email"], identifier_column="record_id"
    )
    preview_row = patterns_of(status)[0]["preview_rows"][0]

    shown_value = preview_row["values"][0]
    assert len(shown_value) < 300
    assert shown_value.endswith("...")
    assert long_value.startswith(shown_value[:-3])


def test_preview_rows_never_appear_in_the_exports():
    status = run_pattern_analysis_job(
        client, PREVIEW_FIXTURE, ["email", "phone"], identifier_column="record_id"
    )
    assert status["state"] == "succeeded"

    completeness_export = client.get(
        f"/api/analysis-jobs/{status['job_id']}/exports/column_completeness.csv"
    )
    pattern_export = client.get(
        f"/api/analysis-jobs/{status['job_id']}/exports/pattern_summary.csv"
    )

    for export_response in [completeness_export, pattern_export]:
        export_text = export_response.content.decode("utf-8-sig")
        assert "555-0100" not in export_text
        assert "alice@example.com" not in export_text
        assert "A1" not in export_text


def fake_result_row(pattern_index: int, analysis_column_count: int) -> tuple[object, ...]:
    """One streamed result row: statuses first, then the cell text of the columns."""
    statuses = tuple(
        (pattern_index >> column_index) & 1 for column_index in range(analysis_column_count)
    )
    cell_values = tuple("value" for _ in range(analysis_column_count))
    return statuses + cell_values


def test_every_pattern_keeps_a_sample_row_before_any_pattern_keeps_a_second():
    # The sampling caps cannot be reached through the API seam with small
    # fixtures, so the sampling policy is checked here directly.
    analysis_column_count = 15
    tally = PatternTally(analysis_column_count=analysis_column_count, identifier_column=None)

    for pattern_index in range(21_000):
        tally.count_input_row(fake_result_row(pattern_index, analysis_column_count))
    for _ in range(10):
        tally.count_input_row(fake_result_row(0, analysis_column_count))

    all_missing_statuses = tuple("missing" for _ in range(analysis_column_count))

    # The capped rows went to 20,000 distinct patterns — one sample row each,
    # before the first pattern got a second one.
    assert len(tally.preview_rows) == 20_000
    assert len(tally.preview_rows[all_missing_statuses]) == 5
    assert tally.counts[all_missing_statuses] == 11
    assert sum(tally.counts.values()) == 21_010
