import shutil
import tempfile
from pathlib import Path

UPLOADS_DIRECTORY_NAME = "uploads"
DUCKDB_WORKING_DIRECTORY_NAME = "duckdb"


def default_work_directory() -> Path:
    return Path(tempfile.gettempdir()) / "patternx"


def prepare_work_directory(work_directory: Path) -> None:
    uploads_directory(work_directory).mkdir(parents=True, exist_ok=True)
    duckdb_working_directory(work_directory).mkdir(parents=True, exist_ok=True)


def uploads_directory(work_directory: Path) -> Path:
    return work_directory / UPLOADS_DIRECTORY_NAME


def duckdb_working_directory(work_directory: Path) -> Path:
    return work_directory / DUCKDB_WORKING_DIRECTORY_NAME


def new_raw_upload_path(work_directory: Path) -> Path:
    raw_file = tempfile.NamedTemporaryFile(
        suffix=".csv",
        delete=False,
        dir=uploads_directory(work_directory),
    )
    raw_file.close()
    return Path(raw_file.name)


def clear_duckdb_working_directory(work_directory: Path) -> None:
    working_directory = duckdb_working_directory(work_directory)
    shutil.rmtree(working_directory, ignore_errors=True)
    working_directory.mkdir(parents=True, exist_ok=True)
