from pathlib import Path

import duckdb
from fastapi import FastAPI, Form, HTTPException, UploadFile

from app.completeness import (
    ColumnCompletenessSummary,
    MissingValueMarkersError,
    NoInputRowsError,
    compute_column_completeness,
    parse_missing_markers,
    read_column_names,
)
from app.patterns import (
    ColumnSelectionError,
    PatternSummary,
    compute_pattern_summary,
    parse_analysis_columns,
)
from app.workbooks import (
    CHOOSE_WORKSHEET_MESSAGE,
    CSV_HAS_NO_WORKSHEETS_MESSAGE,
    EXCEL_WORKSHEET_ROW_LIMIT,
    WORKSHEET_CSV_NAME,
    WorkbookFileError,
    WorksheetSelectionError,
    is_workbook_file_name,
    list_worksheet_names,
    write_worksheet_to_csv,
)
from app.workfiles import (
    clean_up_request,
    default_work_directory,
    duckdb_working_directory,
    new_raw_upload_path,
    new_request_directory,
    prepare_work_directory,
)

UPLOAD_CHUNK_SIZE = 1024 * 1024

SUPPORTED_FILE_FORMATS_MESSAGE = (
    "Unsupported file format. Only .csv and .xlsx files can be imported in this version."
)
UNREADABLE_CSV_MESSAGE = "The uploaded file could not be read as a CSV file."


def create_application(work_directory: Path) -> FastAPI:
    prepare_work_directory(work_directory)
    application = FastAPI(title="PatternX Data Completeness Profiler")

    @application.post("/api/imports")
    async def import_file(
        file: UploadFile,
        sheet: str | None = Form(default=None),
    ) -> dict[str, object]:
        require_supported_file(file)

        request_directory = new_request_directory(work_directory)
        try:
            raw_file_path = await write_upload_to_raw_file(request_directory, file)
            require_non_empty_file(raw_file_path)
            if is_workbook_file_name(raw_file_path.name):
                response = workbook_import_response(
                    raw_file_path,
                    sheet,
                    request_directory,
                    work_directory,
                )
            else:
                reject_worksheet_selection_for_csv(sheet)
                column_names = read_column_names(
                    raw_file_path,
                    duckdb_working_directory(work_directory),
                )
                response = {
                    "sheets": [],
                    "columns": column_names,
                    "worksheet_row_limit": None,
                }
        except (WorkbookFileError, WorksheetSelectionError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except duckdb.Error as error:
            raise HTTPException(status_code=400, detail=UNREADABLE_CSV_MESSAGE) from error
        finally:
            clean_up_request(work_directory, request_directory)

        return response

    @application.post("/api/column-completeness")
    async def column_completeness(
        file: UploadFile,
        sheet: str | None = Form(default=None),
        missing_markers: str | None = Form(default=None),
    ) -> dict[str, object]:
        require_supported_file(file)

        request_directory = new_request_directory(work_directory)
        try:
            raw_file_path = await write_upload_to_raw_file(request_directory, file)
            require_non_empty_file(raw_file_path)
            analysis_csv_path = analysis_csv_path_for(raw_file_path, sheet, request_directory)
            summary = compute_column_completeness(
                analysis_csv_path,
                duckdb_working_directory(work_directory),
                parse_missing_markers(missing_markers),
            )
        except (
            MissingValueMarkersError,
            NoInputRowsError,
            WorkbookFileError,
            WorksheetSelectionError,
        ) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except duckdb.Error as error:
            raise HTTPException(status_code=400, detail=UNREADABLE_CSV_MESSAGE) from error
        finally:
            clean_up_request(work_directory, request_directory)

        return column_completeness_response(summary)

    @application.post("/api/pattern-summary")
    async def pattern_summary(
        file: UploadFile,
        sheet: str | None = Form(default=None),
        missing_markers: str | None = Form(default=None),
        identifier_column: str | None = Form(default=None),
        analysis_columns: str | None = Form(default=None),
    ) -> dict[str, object]:
        require_supported_file(file)

        request_directory = new_request_directory(work_directory)
        try:
            raw_file_path = await write_upload_to_raw_file(request_directory, file)
            require_non_empty_file(raw_file_path)
            analysis_csv_path = analysis_csv_path_for(raw_file_path, sheet, request_directory)
            summary = compute_pattern_summary(
                analysis_csv_path,
                duckdb_working_directory(work_directory),
                parse_missing_markers(missing_markers),
                parse_analysis_columns(analysis_columns),
                identifier_column,
            )
        except (
            MissingValueMarkersError,
            NoInputRowsError,
            ColumnSelectionError,
            WorkbookFileError,
            WorksheetSelectionError,
        ) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except duckdb.Error as error:
            raise HTTPException(status_code=400, detail=UNREADABLE_CSV_MESSAGE) from error
        finally:
            clean_up_request(work_directory, request_directory)

        return pattern_summary_response(summary)

    return application


def require_supported_file(file: UploadFile) -> None:
    if not file.filename:
        raise HTTPException(status_code=415, detail=SUPPORTED_FILE_FORMATS_MESSAGE)

    file_suffix = Path(file.filename).suffix.lower()
    if file_suffix not in (".csv", ".xlsx"):
        raise HTTPException(status_code=415, detail=SUPPORTED_FILE_FORMATS_MESSAGE)


def require_non_empty_file(raw_file_path: Path) -> None:
    if raw_file_path.stat().st_size == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")


def analysis_csv_path_for(
    raw_file_path: Path,
    worksheet_name: str | None,
    request_directory: Path,
) -> Path:
    """Return the CSV text the completeness engine analyzes for this upload.

    A CSV upload is analyzed as it is. A workbook upload is analyzed through the
    exactly one chosen worksheet, normalized into CSV text first so that both
    formats share one analysis engine.
    """
    if is_workbook_file_name(raw_file_path.name):
        if worksheet_name is None:
            raise WorksheetSelectionError(CHOOSE_WORKSHEET_MESSAGE)
        return write_worksheet_to_csv(
            raw_file_path,
            worksheet_name,
            request_directory / WORKSHEET_CSV_NAME,
        )

    reject_worksheet_selection_for_csv(worksheet_name)
    return raw_file_path


def reject_worksheet_selection_for_csv(worksheet_name: str | None) -> None:
    if worksheet_name is not None:
        raise WorksheetSelectionError(CSV_HAS_NO_WORKSHEETS_MESSAGE)


def workbook_import_response(
    raw_file_path: Path,
    worksheet_name: str | None,
    request_directory: Path,
    work_directory: Path,
) -> dict[str, object]:
    """List the workbook's worksheets, and the columns of the chosen one."""
    worksheet_names = list_worksheet_names(raw_file_path)
    if worksheet_name is None:
        return {
            "sheets": worksheet_names,
            "columns": None,
            "worksheet_row_limit": EXCEL_WORKSHEET_ROW_LIMIT,
        }

    worksheet_csv_path = analysis_csv_path_for(raw_file_path, worksheet_name, request_directory)
    column_names = read_column_names(worksheet_csv_path, duckdb_working_directory(work_directory))
    return {
        "sheets": worksheet_names,
        "columns": column_names,
        "worksheet_row_limit": EXCEL_WORKSHEET_ROW_LIMIT,
    }


async def write_upload_to_raw_file(request_directory: Path, file: UploadFile) -> Path:
    file_suffix = Path(file.filename or "").suffix.lower()
    raw_file_path = new_raw_upload_path(request_directory, file_suffix)
    with raw_file_path.open("wb") as raw_file:
        # Stream in chunks so large uploads never sit fully in memory.
        while True:
            chunk = await file.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            raw_file.write(chunk)
    return raw_file_path


def column_completeness_response(summary: ColumnCompletenessSummary) -> dict[str, object]:
    columns = []
    for column in summary.columns:
        columns.append(
            {
                "name": column.name,
                "present_count": column.present_count,
                "present_share": column.present_share,
                "missing_count": column.missing_count,
                "missing_share": column.missing_share,
            }
        )

    return {"input_rows": summary.input_rows, "columns": columns}


def pattern_summary_response(summary: PatternSummary) -> dict[str, object]:
    patterns = []
    for pattern in summary.patterns:
        patterns.append(
            {
                "statuses": list(pattern.statuses),
                "count": pattern.count,
                "share": pattern.share,
            }
        )

    return {
        "input_rows": summary.input_rows,
        "identifier_column": summary.identifier_column,
        "analysis_columns": list(summary.analysis_columns),
        "patterns": patterns,
    }


app = create_application(default_work_directory())
