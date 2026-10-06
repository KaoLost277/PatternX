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
from app.workfiles import (
    clear_duckdb_working_directory,
    default_work_directory,
    duckdb_working_directory,
    new_raw_upload_path,
    prepare_work_directory,
)

UPLOAD_CHUNK_SIZE = 1024 * 1024


def create_application(work_directory: Path) -> FastAPI:
    prepare_work_directory(work_directory)
    application = FastAPI(title="PatternX Data Completeness Profiler")

    @application.post("/api/imports")
    async def import_file(file: UploadFile) -> dict[str, list[str]]:
        require_csv_file(file)

        raw_file_path = await write_upload_to_raw_file(work_directory, file)
        try:
            require_non_empty_file(raw_file_path)
            column_names = read_column_names(
                raw_file_path,
                duckdb_working_directory(work_directory),
            )
        except duckdb.Error as error:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file could not be read as a CSV file.",
            ) from error
        finally:
            clean_up_request_files(work_directory, raw_file_path)

        return {"columns": column_names}

    @application.post("/api/column-completeness")
    async def column_completeness(
        file: UploadFile,
        missing_markers: str | None = Form(default=None),
    ) -> dict[str, object]:
        require_csv_file(file)

        raw_file_path = await write_upload_to_raw_file(work_directory, file)
        try:
            require_non_empty_file(raw_file_path)
            summary = compute_column_completeness(
                raw_file_path,
                duckdb_working_directory(work_directory),
                parse_missing_markers(missing_markers),
            )
        except (MissingValueMarkersError, NoInputRowsError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except duckdb.Error as error:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file could not be read as a CSV file.",
            ) from error
        finally:
            clean_up_request_files(work_directory, raw_file_path)

        return column_completeness_response(summary)

    return application


def require_csv_file(file: UploadFile) -> None:
    if not file.filename or Path(file.filename).suffix.lower() != ".csv":
        raise HTTPException(
            status_code=415,
            detail="Unsupported file format. Only .csv files can be imported in this version.",
        )


def require_non_empty_file(raw_file_path: Path) -> None:
    if raw_file_path.stat().st_size == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")


def clean_up_request_files(work_directory: Path, raw_file_path: Path) -> None:
    """Remove everything this request left behind, on success and on failure."""
    raw_file_path.unlink(missing_ok=True)
    clear_duckdb_working_directory(work_directory)


async def write_upload_to_raw_file(work_directory: Path, file: UploadFile) -> Path:
    raw_file_path = new_raw_upload_path(work_directory)
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


app = create_application(default_work_directory())