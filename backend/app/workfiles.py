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


def new_request_directory(work_directory: Path) -> Path:
    """Create a private directory for one request's raw upload and working copies."""
    return Path(tempfile.mkdtemp(prefix="request-", dir=uploads_directory(work_directory)))


def new_raw_upload_path(request_directory: Path, suffix: str) -> Path:
    raw_file = tempfile.NamedTemporaryFile(
        suffix=suffix,
        delete=False,
        dir=request_directory,
    )
    raw_file.close()
    return Path(raw_file.name)


def clean_up_request(work_directory: Path, request_directory: Path) -> None:
    """Remove everything this request left behind, on success and on failure."""
    shutil.rmtree(request_directory, ignore_errors=True)
    clear_duckdb_working_directory(work_directory)


def new_job_directory(work_directory: Path, job_id: str) -> Path:
    """Create a private directory for one analysis job's raw file and working data."""
    job_directory = uploads_directory(work_directory) / f"job-{job_id}"
    job_directory.mkdir(parents=True, exist_ok=False)
    return job_directory


def clean_up_job(job_directory: Path) -> None:
    """Remove everything one analysis job left behind, on every outcome."""
    shutil.rmtree(job_directory, ignore_errors=True)


def clear_duckdb_working_directory(work_directory: Path) -> None:
    working_directory = duckdb_working_directory(work_directory)
    shutil.rmtree(working_directory, ignore_errors=True)
    working_directory.mkdir(parents=True, exist_ok=True)
