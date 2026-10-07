"""Background analysis jobs with progress reporting and cancellation.

One analysis runs on its own worker thread with its own working directory. The
raw file and normalized worksheet copy are deleted at every final state. The
SQLite database is also deleted after failure or cancellation, but remains
temporarily available after success until the job is replaced or the backend
shuts down.

Only the most recent job is kept. Starting a new analysis cancels and forgets
the previous one, so results of an earlier import can never survive into a
newer one.
"""

import sqlite3
import threading
import time
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

from app.completeness import (
    UNREADABLE_CSV_MESSAGE,
    ColumnCompletenessSummary,
    presence_function_name,
    register_presence_functions,
    summarize_column_completeness,
    sqlite_column_name,
)
from app.patterns import (
    AnalysisCancelledError,
    AnalysisInputs,
    CompletenessPattern,
    PRESENT_STATUS,
    PatternSummary,
    compute_pattern_summary,
)
from app.sqlite_storage import (
    CSVFileError,
    CSVImportCancelledError,
    load_csv_into_database,
    open_analysis_database,
)
from app.workfiles import clean_up_job, clean_up_job_sources

JOB_STATE_RUNNING = "running"
JOB_STATE_SUCCEEDED = "succeeded"
JOB_STATE_FAILED = "failed"
JOB_STATE_CANCELLED = "cancelled"

STAGE_LOADING_INPUT_ROWS = "Loading Input Rows into the local analysis database"
STAGE_COLUMN_COMPLETENESS = "Computing the Column Completeness Summary"
STAGE_COUNTING_INPUT_ROWS = "Counting Input Rows"
STAGE_GROUPING_INPUT_ROWS = "Grouping Input Rows by Completeness Pattern"

# An analysis over this many selected columns can produce a very large number of
# distinct Completeness Patterns (2^columns), so the user must acknowledge a
# warning before such an analysis starts.
HIGH_CARDINALITY_COLUMN_THRESHOLD = 20

CANCEL_WAIT_SECONDS = 5.0
PATTERN_ROWS_PAGE_SIZE = 50
PATTERN_ROWS_EXPORT_BATCH_SIZE = 1_000


class AnalysisNotSucceededError(Exception):
    """Raised when row details are requested before successful completion."""


class PatternIndexNotFoundError(Exception):
    """Raised when a requested index is outside the job's canonical pattern list."""


@dataclass(frozen=True)
class AnalysisProgress:
    """How far the grouping has come: tallied rows of the file's Input Rows."""

    rows_done: int
    rows_total: int


@dataclass(frozen=True)
class AnalysisJobResult:
    """The exact summaries one finished analysis produced."""

    pattern_summary: PatternSummary
    column_completeness: ColumnCompletenessSummary


@dataclass(frozen=True)
class AnalysisJobStatus:
    """A consistent view of one job's progress, result, and error."""

    job_id: str
    state: str
    stage: str | None
    elapsed_seconds: float
    progress: AnalysisProgress | None
    result: AnalysisJobResult | None
    error: str | None


class PatternRowsExportRows(Iterator[tuple[str | None, ...]]):
    """Read matching source rows in bounded batches and release the job lease."""

    def __init__(
        self,
        cursor: sqlite3.Cursor,
        connection: sqlite3.Connection,
        job_lock: threading.Lock,
    ):
        self._cursor = cursor
        self._connection = connection
        self._job_lock = job_lock
        self._batch_rows: list[tuple[str | None, ...]] = []
        self._next_row_index = 0
        self._closed = False

    def __iter__(self) -> "PatternRowsExportRows":
        return self

    def __next__(self) -> tuple[str | None, ...]:
        if self._closed:
            raise StopIteration

        if self._next_row_index == len(self._batch_rows):
            try:
                self._batch_rows = self._cursor.fetchmany(PATTERN_ROWS_EXPORT_BATCH_SIZE)
            except BaseException:
                self.close()
                raise
            self._next_row_index = 0

        if not self._batch_rows:
            self.close()
            raise StopIteration

        row = self._batch_rows[self._next_row_index]
        self._next_row_index += 1
        return row

    def close(self) -> None:
        if self._closed:
            return

        self._closed = True
        try:
            self._connection.close()
        finally:
            self._job_lock.release()


class AnalysisJob:
    """One background analysis run, from its start to its cleaned-up final state."""

    def __init__(
        self,
        job_id: str,
        job_directory: Path,
        analysis_inputs: AnalysisInputs,
        rows_per_batch: int,
    ):
        self.job_id = job_id
        self.job_directory = job_directory
        self.analysis_inputs = analysis_inputs
        self.rows_per_batch = rows_per_batch

        self.state = JOB_STATE_RUNNING
        self.stage = STAGE_LOADING_INPUT_ROWS
        self.progress: AnalysisProgress | None = None
        self.result: AnalysisJobResult | None = None
        self.error: str | None = None

        self.started_at = time.monotonic()
        self._final_elapsed_seconds: float | None = None
        self._cancel_requested = threading.Event()
        # Guards the job's status fields and its live connection while cancellation
        # interrupts work on the worker thread.
        self._lock = threading.Lock()
        self._connection: sqlite3.Connection | None = None
        self._worker = threading.Thread(
            target=self._run_analysis,
            name=f"analysis-job-{job_id}",
            daemon=True,
        )

    def start(self) -> None:
        self._worker.start()

    def request_cancel(self) -> None:
        self._cancel_requested.set()
        with self._lock:
            if self._connection is not None:
                # Interrupting stops a running query at once; the batch loop
                # notices the cancel flag between batches.
                self._connection.interrupt()

    def wait_until_stopped(self, timeout: float | None = CANCEL_WAIT_SECONDS) -> bool:
        self._worker.join(timeout)
        return not self._worker.is_alive()

    def clean_up_retained_data(self) -> None:
        """Remove the retained row database when this job is no longer current."""
        with self._lock:
            clean_up_job(self.job_directory)

    def _pattern_rows_query(self, pattern: CompletenessPattern) -> tuple[str, list[int]]:
        source_columns = [
            sqlite_column_name(column_index)
            for column_index in range(len(self.analysis_inputs.column_names))
        ]
        status_conditions = []
        for column_name in self.analysis_inputs.analysis_columns:
            column_index = self.analysis_inputs.column_names.index(column_name)
            status_function = presence_function_name(column_index)
            status_conditions.append(
                f"{status_function}({sqlite_column_name(column_index)}) = ?"
            )

        query = (
            f'SELECT {", ".join(source_columns)} FROM "input_rows" '
            f'WHERE {" AND ".join(status_conditions)} '
            "ORDER BY rowid ASC"
        )
        expected_status_values = [
            int(status == PRESENT_STATUS) for status in pattern.statuses
        ]
        return query, expected_status_values

    def pattern_rows_page(self, pattern_index: int, page: int) -> dict[str, object]:
        """Read one source-ordered page matching a completed summary pattern."""
        with self._lock:
            if self.state != JOB_STATE_SUCCEEDED or self.result is None:
                raise AnalysisNotSucceededError()

            patterns = self.result.pattern_summary.patterns
            if pattern_index < 0 or pattern_index >= len(patterns):
                raise PatternIndexNotFoundError()

            pattern = patterns[pattern_index]
            offset = (page - 1) * PATTERN_ROWS_PAGE_SIZE
            rows = []
            if offset < pattern.count:
                database_uri = self.analysis_inputs.database_path.resolve().as_uri() + "?mode=ro"
                connection = sqlite3.connect(database_uri, uri=True)
                try:
                    register_presence_functions(
                        connection,
                        self.analysis_inputs.column_names,
                        self.analysis_inputs.missing_markers_by_column,
                    )
                    query, expected_status_values = self._pattern_rows_query(pattern)
                    rows = connection.execute(
                        f"{query} LIMIT ? OFFSET ?",
                        [*expected_status_values, PATTERN_ROWS_PAGE_SIZE, offset],
                    ).fetchall()
                finally:
                    connection.close()

            return {
                "columns": list(self.analysis_inputs.column_names),
                "rows": [list(row) for row in rows],
                "page": page,
                "page_size": PATTERN_ROWS_PAGE_SIZE,
                "total_rows": pattern.count,
            }

    def open_pattern_rows_export(
        self,
        pattern_index: int,
    ) -> tuple[list[str], PatternRowsExportRows]:
        """Open a streamed source-ordered export for one completed pattern."""
        self._lock.acquire()
        connection: sqlite3.Connection | None = None
        try:
            if self.state != JOB_STATE_SUCCEEDED or self.result is None:
                raise AnalysisNotSucceededError()

            patterns = self.result.pattern_summary.patterns
            if pattern_index < 0 or pattern_index >= len(patterns):
                raise PatternIndexNotFoundError()

            pattern = patterns[pattern_index]
            database_uri = self.analysis_inputs.database_path.resolve().as_uri() + "?mode=ro"
            connection = sqlite3.connect(database_uri, uri=True, check_same_thread=False)
            register_presence_functions(
                connection,
                self.analysis_inputs.column_names,
                self.analysis_inputs.missing_markers_by_column,
            )

            query, expected_status_values = self._pattern_rows_query(pattern)
            cursor = connection.execute(query, expected_status_values)
            rows = PatternRowsExportRows(cursor, connection, self._lock)
            return list(self.analysis_inputs.column_names), rows
        except BaseException:
            try:
                if connection is not None:
                    connection.close()
            finally:
                self._lock.release()
            raise

    def is_cancel_requested(self) -> bool:
        return self._cancel_requested.is_set()

    def report_progress(self, rows_done: int, rows_total: int) -> None:
        with self._lock:
            self.stage = STAGE_GROUPING_INPUT_ROWS
            self.progress = AnalysisProgress(rows_done=rows_done, rows_total=rows_total)

    def set_stage(self, stage: str) -> None:
        with self._lock:
            self.stage = stage

    def status_snapshot(self) -> AnalysisJobStatus:
        with self._lock:
            if self._final_elapsed_seconds is None:
                elapsed_seconds = time.monotonic() - self.started_at
                stage = self.stage
            else:
                elapsed_seconds = self._final_elapsed_seconds
                # A finished job is no longer doing any stage of the work.
                stage = None

            return AnalysisJobStatus(
                job_id=self.job_id,
                state=self.state,
                stage=stage,
                elapsed_seconds=elapsed_seconds,
                progress=self.progress,
                result=self.result,
                error=self.error,
            )

    def _run_analysis(self) -> None:
        connection: sqlite3.Connection | None = None
        final_state = JOB_STATE_FAILED
        result: AnalysisJobResult | None = None
        error: str | None = None
        try:
            self.set_stage(STAGE_LOADING_INPUT_ROWS)
            connection = open_analysis_database(self.analysis_inputs.database_path)
            with self._lock:
                self._connection = connection

            load_csv_into_database(
                connection,
                self.analysis_inputs.analysis_csv_path,
                cancellation_check=self.is_cancel_requested,
            )
            if self.is_cancel_requested():
                raise AnalysisCancelledError("The analysis was cancelled.")

            self.set_stage(STAGE_COLUMN_COMPLETENESS)
            column_completeness = summarize_column_completeness(
                connection,
                self.analysis_inputs.column_names,
                self.analysis_inputs.missing_markers_by_column,
            )

            self.set_stage(STAGE_COUNTING_INPUT_ROWS)
            pattern_summary = compute_pattern_summary(
                connection,
                self.analysis_inputs,
                progress_reporter=self.report_progress,
                cancellation_check=self.is_cancel_requested,
                rows_per_batch=self.rows_per_batch,
            )
            result = AnalysisJobResult(
                pattern_summary=pattern_summary,
                column_completeness=column_completeness,
            )
            final_state = JOB_STATE_SUCCEEDED
        except (AnalysisCancelledError, CSVImportCancelledError):
            final_state = JOB_STATE_CANCELLED
        except sqlite3.Error:
            if self.is_cancel_requested():
                final_state = JOB_STATE_CANCELLED
            else:
                error = UNREADABLE_CSV_MESSAGE
        except CSVFileError as csv_error:
            error = str(csv_error)
        except ValueError as domain_error:
            # The engine's own validation errors already carry a clear message.
            error = str(domain_error)
        except Exception as unexpected_error:
            error = f"The analysis failed: {unexpected_error}"
        finally:
            with self._lock:
                self._connection = None
                if connection is not None:
                    try:
                        connection.close()
                    except Exception:
                        final_state = JOB_STATE_FAILED
                        result = None
                        error = "The analysis database could not be closed cleanly."
            # Only the staged database survives a successful job; the raw file
            # and normalized worksheet copy are removed before success is visible.
            try:
                if final_state == JOB_STATE_SUCCEEDED:
                    clean_up_job_sources(self.job_directory)
                else:
                    clean_up_job(self.job_directory)
            except OSError:
                # A failed cleanup must not leave row-level data available.
                try:
                    clean_up_job(self.job_directory)
                except OSError:
                    pass
                final_state = JOB_STATE_FAILED
                result = None
                error = "Temporary working files could not be removed."
            self._finish(final_state, result=result, error=error)

    def _finish(self, state: str, result: AnalysisJobResult | None, error: str | None) -> None:
        with self._lock:
            self.state = state
            self.result = result
            self.error = error
            self._final_elapsed_seconds = time.monotonic() - self.started_at


class AnalysisJobStore:
    """Keeps only the most recent analysis job; starting a new one replaces it."""

    def __init__(self) -> None:
        self._jobs: dict[str, AnalysisJob] = {}
        self._lock = threading.Lock()

    def replace_with(self, job: AnalysisJob) -> None:
        with self._lock:
            previous_jobs = list(self._jobs.values())
            self._jobs.clear()

        for previous_job in previous_jobs:
            previous_job.request_cancel()
        for previous_job in previous_jobs:
            if previous_job.wait_until_stopped():
                previous_job.clean_up_retained_data()

        job.start()
        with self._lock:
            self._jobs[job.job_id] = job

    def find(self, job_id: str) -> AnalysisJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> AnalysisJob | None:
        """Ask one job to stop and wait for it to acknowledge, if it exists."""
        job = self.find(job_id)
        if job is not None:
            job.request_cancel()
            job.wait_until_stopped()
        return job

    def clear(self) -> None:
        """Cancel all current work and remove retained row databases."""
        with self._lock:
            current_jobs = list(self._jobs.values())
            self._jobs.clear()

        for job in current_jobs:
            job.request_cancel()
        for job in current_jobs:
            job.wait_until_stopped(timeout=None)
            job.clean_up_retained_data()

    def shutdown(self) -> None:
        """Stop the current worker and remove any data retained for row details."""
        self.clear()


def new_job_id() -> str:
    return uuid.uuid4().hex
