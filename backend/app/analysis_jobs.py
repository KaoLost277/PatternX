"""Background analysis jobs with progress reporting and cancellation.

One analysis runs on its own worker thread with its own working directory: the
raw file, the normalized worksheet copy, and every DuckDB working file live
inside that directory and are deleted when the job reaches any final state —
success, failure, or cancellation.

Only the most recent job is kept. Starting a new analysis cancels and forgets
the previous one, so results of an earlier import can never survive into a
newer one.
"""

import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

import duckdb

from app.completeness import (
    UNREADABLE_CSV_MESSAGE,
    ColumnCompletenessSummary,
    summarize_column_completeness,
)
from app.patterns import (
    AnalysisCancelledError,
    AnalysisInputs,
    PatternSummary,
    compute_pattern_summary,
)
from app.workfiles import clean_up_job

JOB_STATE_RUNNING = "running"
JOB_STATE_SUCCEEDED = "succeeded"
JOB_STATE_FAILED = "failed"
JOB_STATE_CANCELLED = "cancelled"

STAGE_COLUMN_COMPLETENESS = "Computing the Column Completeness Summary"
STAGE_COUNTING_INPUT_ROWS = "Counting Input Rows"
STAGE_GROUPING_INPUT_ROWS = "Grouping Input Rows by Completeness Pattern"

# An analysis over this many selected columns can produce a very large number of
# distinct Completeness Patterns (2^columns), so the user must acknowledge a
# warning before such an analysis starts.
HIGH_CARDINALITY_COLUMN_THRESHOLD = 20

CANCEL_WAIT_SECONDS = 5.0


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
        self.stage = STAGE_COLUMN_COMPLETENESS
        self.progress: AnalysisProgress | None = None
        self.result: AnalysisJobResult | None = None
        self.error: str | None = None

        self.started_at = time.monotonic()
        self._final_elapsed_seconds: float | None = None
        self._cancel_requested = threading.Event()
        # Guards the job's status fields and its live connection: the connection
        # must not be interrupted while it is being closed.
        self._lock = threading.Lock()
        self._connection: duckdb.DuckDBPyConnection | None = None
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

    def wait_until_stopped(self) -> None:
        self._worker.join(CANCEL_WAIT_SECONDS)

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
        connection: duckdb.DuckDBPyConnection | None = None
        final_state = JOB_STATE_FAILED
        result: AnalysisJobResult | None = None
        error: str | None = None
        try:
            connection = duckdb.connect(
                config={"temp_directory": str(self.analysis_inputs.duckdb_directory)}
            )
            with self._lock:
                self._connection = connection

            self.set_stage(STAGE_COLUMN_COMPLETENESS)
            column_completeness = summarize_column_completeness(
                connection,
                self.analysis_inputs.analysis_csv_path,
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
        except AnalysisCancelledError:
            final_state = JOB_STATE_CANCELLED
        except duckdb.InterruptException:
            # The cancel request interrupted a running query.
            final_state = JOB_STATE_CANCELLED
        except duckdb.Error:
            error = UNREADABLE_CSV_MESSAGE
        except ValueError as domain_error:
            # The engine's own validation errors already carry a clear message.
            error = str(domain_error)
        except Exception as unexpected_error:
            error = f"The analysis failed: {unexpected_error}"
        finally:
            with self._lock:
                self._connection = None
                if connection is not None:
                    connection.close()
            # The raw file and all working data are gone after every outcome,
            # and only then is the final state reported: a job that can be seen
            # as finished has nothing left on disk.
            clean_up_job(self.job_directory)
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
            previous_job.wait_until_stopped()

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


def new_job_id() -> str:
    return uuid.uuid4().hex
