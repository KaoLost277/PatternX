from pathlib import Path

import duckdb
from fastapi import FastAPI, HTTPException, UploadFile

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
        if not file.filename or Path(file.filename).suffix.lower() != ".csv":
            raise HTTPException(
                status_code=415,
                detail="Unsupported file format. Only .csv files can be imported in this version.",
            )

        raw_file_path = await write_upload_to_raw_file(work_directory, file)
        try:
            if raw_file_path.stat().st_size == 0:
                raise HTTPException(status_code=400, detail="The uploaded file is empty.")

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
            raw_file_path.unlink(missing_ok=True)
            clear_duckdb_working_directory(work_directory)

        return {"columns": column_names}

    return application


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


def read_column_names(raw_file_path: Path, duckdb_directory: Path) -> list[str]:
    connection = duckdb.connect(config={"temp_directory": str(duckdb_directory)})
    try:
        cursor = connection.execute(
            "SELECT * FROM read_csv(?, header = true) LIMIT 0",
            [str(raw_file_path)],
        )
        column_names = [column_description[0] for column_description in cursor.description]
    finally:
        connection.close()
    return column_names


app = create_application(default_work_directory())
