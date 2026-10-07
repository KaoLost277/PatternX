import shutil
import tempfile
from pathlib import Path

UPLOADS_DIRECTORY_NAME = "uploads"
ANALYSIS_DATABASE_NAME = "analysis.sqlite3"


def default_work_directory() -> Path:
    return Path(tempfile.gettempdir()) / "patternx"


def prepare_work_directory(work_directory: Path) -> None:
    uploads_path = uploads_directory(work_directory)
    uploads_path.mkdir(parents=True, exist_ok=True)
    for temporary_directory in uploads_path.iterdir():
        is_temporary_upload = temporary_directory.name.startswith(("job-", "request-"))
        if is_temporary_upload and temporary_directory.is_dir():
            shutil.rmtree(temporary_directory)


def uploads_directory(work_directory: Path) -> Path:
    return work_directory / UPLOADS_DIRECTORY_NAME


def analysis_database_path(directory: Path) -> Path:
    return directory / ANALYSIS_DATABASE_NAME


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


def clean_up_request(request_directory: Path) -> None:
    """Remove this request's upload and SQLite files, without touching other work."""
    shutil.rmtree(request_directory)


def new_job_directory(work_directory: Path, job_id: str) -> Path:
    """Create a private directory for one analysis job's raw file and working data."""
    job_directory = uploads_directory(work_directory) / f"job-{job_id}"
    job_directory.mkdir(parents=True, exist_ok=False)
    return job_directory


def clean_up_job(job_directory: Path) -> None:
    """Remove everything one analysis job left behind, on every outcome."""
    if job_directory.exists():
        shutil.rmtree(job_directory)


def clean_up_job_sources(job_directory: Path) -> None:
    """Remove uploads and normalized source copies, retaining the staged database."""
    database_path = analysis_database_path(job_directory)
    for working_path in job_directory.iterdir():
        if working_path == database_path:
            continue
        if working_path.is_dir():
            shutil.rmtree(working_path)
        else:
            working_path.unlink()
