import io
import json
import zipfile

from fastapi.testclient import TestClient

from app.main import app
from support import (
    assert_no_working_files_left,
    make_test_client,
    make_workbook_bytes,
    run_pattern_analysis_job,
    start_analysis_job,
)

client = TestClient(app)

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# Excel's file format allows at most 1,048,576 worksheet rows, header row
# included. This is a property of the format, not a limit chosen by this tool.
EXCEL_WORKSHEET_ROW_LIMIT = 1_048_576

# The same records as CSV text and as worksheet cells, so every analysis rule
# can be checked for behaving identically on both input formats. The fixture
# covers duplicate identifier values, empty and whitespace-only values, zero as
# a present value, and numeric cells.
SHEET_ROWS = [
    ["record_id", "email", "phone", "amount"],
    ["A1", "alice@example.com", "555-0100", 0],
    ["A1", "", "555-0101", 10],
    ["A2", "bob@example.com", "", 5],
    ["A1", None, "555-0102", 0],
    ["A3", "  ", "555-0103", 7],
    ["A2", "carol@example.com", "555-0104", ""],
]
SAME_DATA_AS_CSV = (
    b"record_id,email,phone,amount\n"
    b"A1,alice@example.com,555-0100,0\n"
    b"A1,,555-0101,10\n"
    b"A2,bob@example.com,,5\n"
    b"A1,,555-0102,0\n"
    b'A3,"  ",555-0103,7\n'
    b"A2,carol@example.com,555-0104,\n"
)


def request_import(test_client, file_name, file_bytes, sheet=None):
    form_fields = {}
    if sheet is not None:
        form_fields["sheet"] = sheet

    return test_client.post(
        "/api/imports",
        files={"file": (file_name, file_bytes, XLSX_CONTENT_TYPE)},
        data=form_fields,
    )


def request_column_completeness(
    test_client,
    file_name,
    file_bytes,
    sheet=None,
    missing_markers_by_column=None,
):
    form_fields = {}
    if sheet is not None:
        form_fields["sheet"] = sheet
    if missing_markers_by_column is not None:
        form_fields["missing_markers"] = json.dumps(missing_markers_by_column)

    return test_client.post(
        "/api/column-completeness",
        files={"file": (file_name, file_bytes, XLSX_CONTENT_TYPE)},
        data=form_fields,
    )


def run_pattern_analysis(
    test_client,
    file_name,
    file_bytes,
    analysis_columns,
    sheet=None,
    missing_markers_by_column=None,
    identifier_column=None,
):
    """Run one full analysis job for the file and return its finished status."""
    return run_pattern_analysis_job(
        test_client,
        file_bytes,
        analysis_columns,
        identifier_column=identifier_column,
        missing_markers_by_column=missing_markers_by_column,
        file_name=file_name,
        sheet=sheet,
    )


def make_row_limit_workbook_bytes(data_rows: int) -> bytes:
    """Build a workbook with one header row and the given number of data rows.

    The worksheet rows are written as raw worksheet XML so that a fixture at the
    Excel worksheet row limit stays cheap to generate. The remaining workbook
    parts come from a small workbook written by openpyxl.
    """
    template_workbook = make_workbook_bytes({"Data": [["value"]]})
    rows_xml_parts = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        "<sheetData>"
    ]
    for row_number in range(1, data_rows + 2):
        rows_xml_parts.append(
            f'<row r="{row_number}"><c r="A{row_number}" t="inlineStr"><is><t>x</t></is></c></row>'
        )
    rows_xml_parts.append("</sheetData></worksheet>")
    sheet_xml = "".join(rows_xml_parts)

    workbook_buffer = io.BytesIO()
    template_buffer = io.BytesIO(template_workbook)
    with zipfile.ZipFile(template_buffer, "r") as template_archive:
        with zipfile.ZipFile(workbook_buffer, "w", zipfile.ZIP_DEFLATED) as workbook_archive:
            for entry in template_archive.infolist():
                if entry.filename == "xl/worksheets/sheet1.xml":
                    workbook_archive.writestr(entry, sheet_xml)
                else:
                    workbook_archive.writestr(entry, template_archive.read(entry.filename))

    return workbook_buffer.getvalue()


def test_workbook_import_lists_worksheets_before_one_is_chosen():
    workbook_bytes = make_workbook_bytes({"Summary": [["title"]], "Data": [["id", "name"]]})

    response = request_import(client, "workbook.xlsx", workbook_bytes)

    assert response.status_code == 200
    assert response.json() == {
        "sheets": ["Summary", "Data"],
        "columns": None,
        "worksheet_row_limit": EXCEL_WORKSHEET_ROW_LIMIT,
    }


def test_choosing_one_worksheet_returns_its_columns_in_row_order():
    workbook_bytes = make_workbook_bytes({"Data": [["id", "name"], [1, "Ada"]]})

    response = request_import(client, "workbook.xlsx", workbook_bytes, sheet="Data")

    assert response.status_code == 200
    assert response.json() == {
        "sheets": ["Data"],
        "columns": ["id", "name"],
        "worksheet_row_limit": EXCEL_WORKSHEET_ROW_LIMIT,
    }


def test_choosing_one_worksheet_reports_only_that_sheets_columns():
    workbook_bytes = make_workbook_bytes(
        {
            "Summary": [["headline"], ["quarterly totals"]],
            "Data": [["id", "name"], [1, "Ada"]],
        }
    )

    response = request_import(client, "workbook.xlsx", workbook_bytes, sheet="Data")

    assert response.status_code == 200
    assert response.json()["sheets"] == ["Summary", "Data"]
    assert response.json()["columns"] == ["id", "name"]


def test_analysis_requires_exactly_one_chosen_worksheet():
    workbook_bytes = make_workbook_bytes({"Data": [["id", "name"], [1, "Ada"]]})

    completeness_response = request_column_completeness(client, "workbook.xlsx", workbook_bytes)
    pattern_response = start_analysis_job(
        client,
        "workbook.xlsx",
        workbook_bytes,
        {"analysis_columns": json.dumps(["name"])},
    )

    assert completeness_response.status_code == 400
    assert "worksheet" in completeness_response.json()["detail"].lower()
    assert pattern_response.status_code == 400
    assert "worksheet" in pattern_response.json()["detail"].lower()


def test_unknown_worksheet_is_rejected_with_the_available_worksheet_names():
    workbook_bytes = make_workbook_bytes({"Summary": [["title"]], "Data": [["id"]]})

    response = request_import(client, "workbook.xlsx", workbook_bytes, sheet="Detail")

    assert response.status_code == 400
    assert "detail" in response.json()["detail"].lower()
    assert "summary" in response.json()["detail"].lower()
    assert "data" in response.json()["detail"].lower()


def test_worksheet_selection_is_rejected_for_csv_files():
    response = client.post(
        "/api/imports",
        files={"file": ("data.csv", SAME_DATA_AS_CSV, "text/csv")},
        data={"sheet": "Data"},
    )

    assert response.status_code == 400
    assert "csv" in response.json()["detail"].lower()


def test_invalid_workbook_bytes_are_rejected_with_clear_error():
    response = request_import(client, "workbook.xlsx", b"PK\x03\x04not-a-workbook")

    assert response.status_code == 400
    assert "xlsx" in response.json()["detail"].lower()


def test_unsupported_file_formats_are_rejected_with_clear_error():
    old_workbook_response = request_import(client, "workbook.xls", b"not-a-workbook")
    text_response = request_import(client, "notes.txt", b"just text")

    assert old_workbook_response.status_code == 415
    assert "csv" in old_workbook_response.json()["detail"].lower()
    assert "xlsx" in old_workbook_response.json()["detail"].lower()
    assert text_response.status_code == 415
    assert "csv" in text_response.json()["detail"].lower()
    assert "xlsx" in text_response.json()["detail"].lower()


def test_empty_worksheet_is_rejected_with_clear_error():
    workbook_bytes = make_workbook_bytes({"Data": [["id"], [1]], "Empty": []})

    response = request_column_completeness(client, "workbook.xlsx", workbook_bytes, sheet="Empty")

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_header_only_worksheet_reports_no_input_rows():
    workbook_bytes = make_workbook_bytes({"Data": [["id", "name"]]})

    response = request_column_completeness(client, "workbook.xlsx", workbook_bytes, sheet="Data")

    assert response.status_code == 400
    assert "input rows" in response.json()["detail"].lower()


def test_column_completeness_on_a_sheet_matches_the_same_data_as_csv():
    workbook_bytes = make_workbook_bytes({"Data": SHEET_ROWS})
    missing_markers_by_column = {"email": ["unknown"], "amount": ["-"]}

    workbook_response = request_column_completeness(
        client,
        "workbook.xlsx",
        workbook_bytes,
        sheet="Data",
        missing_markers_by_column=missing_markers_by_column,
    )
    csv_response = client.post(
        "/api/column-completeness",
        files={"file": ("data.csv", SAME_DATA_AS_CSV, "text/csv")},
        data={"missing_markers": json.dumps(missing_markers_by_column)},
    )

    assert workbook_response.status_code == 200
    assert csv_response.status_code == 200
    assert workbook_response.json() == csv_response.json()
    assert workbook_response.json()["input_rows"] == 6


def test_pattern_summary_on_a_sheet_matches_the_same_data_as_csv():
    workbook_bytes = make_workbook_bytes({"Data": SHEET_ROWS})
    missing_markers_by_column = {"email": ["unknown"], "amount": ["-"]}

    workbook_status = run_pattern_analysis_job(
        client,
        workbook_bytes,
        ["email", "phone", "amount"],
        identifier_column="record_id",
        missing_markers_by_column=missing_markers_by_column,
        file_name="workbook.xlsx",
        sheet="Data",
    )
    csv_status = run_pattern_analysis_job(
        client,
        SAME_DATA_AS_CSV,
        ["email", "phone", "amount"],
        identifier_column="record_id",
        missing_markers_by_column=missing_markers_by_column,
        file_name="data.csv",
    )

    assert workbook_status["state"] == "succeeded"
    assert csv_status["state"] == "succeeded"
    assert workbook_status["result"] == csv_status["result"]
    assert workbook_status["result"]["input_rows"] == 6


def test_empty_rows_in_a_multi_column_worksheet_are_not_input_rows():
    workbook_bytes = make_workbook_bytes(
        {"Data": [["name", "amount"], ["Ada", 1], [], [None, None], ["Bob", 2]]}
    )

    response = request_column_completeness(client, "workbook.xlsx", workbook_bytes, sheet="Data")

    assert response.status_code == 200
    assert response.json()["input_rows"] == 2


def test_empty_rows_in_a_one_column_worksheet_are_input_rows_with_a_missing_value():
    # The same rule as an empty line in a one-column CSV file: a record with one
    # empty value, not a blank line to discard.
    workbook_bytes = make_workbook_bytes({"Data": [["name"], ["Ada"], [], ["Bob"]]})

    response = request_column_completeness(client, "workbook.xlsx", workbook_bytes, sheet="Data")

    assert response.status_code == 200
    assert response.json()["input_rows"] == 3
    assert response.json()["columns"][0]["present_count"] == 2
    assert response.json()["columns"][0]["missing_count"] == 1


def test_formula_cells_are_read_as_text_and_count_as_present_values():
    workbook_bytes = make_workbook_bytes({"Data": [["name", "total"], ["Ada", "=1+1"]]})

    response = request_column_completeness(client, "workbook.xlsx", workbook_bytes, sheet="Data")

    assert response.status_code == 200
    total_column = response.json()["columns"][1]
    assert total_column["name"] == "total"
    assert total_column["present_count"] == 1


def test_hostile_worksheet_headers_and_values_are_returned_verbatim_as_json_text():
    workbook_bytes = make_workbook_bytes(
        {
            "Data": [
                ["<script>alert('x')</script>", "notes"],
                ["<img src=x onerror=alert(1)>", "=HYPERLINK(\"http://example.com\")"],
            ]
        }
    )

    import_response = request_import(client, "hostile.xlsx", workbook_bytes, sheet="Data")
    completeness_response = request_column_completeness(
        client, "hostile.xlsx", workbook_bytes, sheet="Data"
    )

    assert import_response.status_code == 200
    assert import_response.headers["content-type"].startswith("application/json")
    assert import_response.json()["columns"] == ["<script>alert('x')</script>", "notes"]

    assert completeness_response.status_code == 200
    assert completeness_response.headers["content-type"].startswith("application/json")
    assert [column["name"] for column in completeness_response.json()["columns"]] == [
        "<script>alert('x')</script>",
        "notes",
    ]


def test_rows_at_the_excel_worksheet_row_limit_are_counted_without_truncation():
    workbook_bytes = make_row_limit_workbook_bytes(EXCEL_WORKSHEET_ROW_LIMIT - 1)

    response = request_column_completeness(client, "workbook.xlsx", workbook_bytes, sheet="Data")

    assert response.status_code == 200
    assert response.json()["input_rows"] == EXCEL_WORKSHEET_ROW_LIMIT - 1
    assert response.json()["columns"][0]["present_count"] == EXCEL_WORKSHEET_ROW_LIMIT - 1


def test_successful_workbook_request_leaves_no_working_files_behind(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)
    workbook_bytes = make_workbook_bytes({"Data": SHEET_ROWS})

    response = request_import(test_client, "workbook.xlsx", workbook_bytes, sheet="Data")

    assert response.status_code == 200
    assert_no_working_files_left(work_directory)


def test_failed_workbook_request_leaves_no_working_files_behind(tmp_path):
    work_directory = tmp_path / "work"
    test_client = make_test_client(work_directory)
    workbook_bytes = make_workbook_bytes({"Data": SHEET_ROWS})

    response = request_column_completeness(test_client, "workbook.xlsx", workbook_bytes)

    assert response.status_code == 400
    assert_no_working_files_left(work_directory)
