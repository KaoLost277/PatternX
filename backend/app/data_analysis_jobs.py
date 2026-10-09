"""Background jobs for Formal Terms and Group Data analyses."""

import sqlite3
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

from app.analysis_jobs import (
    CANCEL_WAIT_SECONDS,
    JOB_STATE_CANCELLED,
    JOB_STATE_FAILED,
    JOB_STATE_RUNNING,
    JOB_STATE_SUCCEEDED,
)
from app.completeness import UNREADABLE_CSV_MESSAGE, sqlite_column_name
from app.data_analyses import (
    DataAnalysisInputs,
    DataAnalysisSummary,
    DataFormatPattern,
    FormalTermsSummary,
    GroupDataSummary,
    compute_formal_terms,
    compute_group_data,
    format_function_name,
    register_data_value_functions,
    value_function_name,
)
from app.patterns import AnalysisCancelledError
from app.row_details import ColumnMode, source_columns_for_mode
from app.sqlite_storage import CSVFileError, CSVImportCancelledError, load_csv_into_database, open_analysis_database
from app.workfiles import clean_up_job, clean_up_job_sources

FORMAL_TERMS_KIND = "formal_terms"
GROUP_DATA_KIND = "group_data"
DATA_ANALYSIS_KINDS = {FORMAL_TERMS_KIND, GROUP_DATA_KIND}

DATA_ROWS_PAGE_SIZE = 50
DATA_ROWS_EXPORT_BATCH_SIZE = 1_000


class DataAnalysisNotSucceededError(Exception):
    """Raised when data rows are requested before their job succeeds."""


class DataAnalysisTargetNotFoundError(Exception):
    """Raised when the requested term, format, or group is not in the result."""


@dataclass(frozen=True)
class DataAnalysisProgress:
    items_done: int
    items_total: int


@dataclass(frozen=True)
class DataAnalysisJobStatus:
    job_id: str
    analysis_kind: str
    state: str
    stage: str | None
    elapsed_seconds: float
    progress: DataAnalysisProgress | None
    result: DataAnalysisSummary | None
    error: str | None


class DataAnalysisRowsExport(Iterator[tuple[str | None, ...]]):
    """Stream matching source rows and release the job lease when closed."""

    def __init__(
        self,
        cursor: sqlite3.Cursor,
        connection: sqlite3.Connection,
        job_lock: threading.Lock,
    ) -> None:
        self._cursor = cursor
        self._connection = connection
        self._job_lock = job_lock
        self._batch_rows: list[tuple[str | None, ...]] = []
        self._next_row_index = 0
        self._closed = False

    def __iter__(self) -> "DataAnalysisRowsExport":
        return self

    def __next__(self) -> tuple[str | None, ...]:
        if self._closed:
            raise StopIteration

        if self._next_row_index == len(self._batch_rows):
            try:
                self._batch_rows = self._cursor.fetchmany(DATA_ROWS_EXPORT_BATCH_SIZE)
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


class DataAnalysisJob:
    """One asynchronous Formal Terms or Group Data analysis."""

    def __init__(
        self,
        job_id: str,
        analysis_kind: str,
        job_directory: Path,
        analysis_inputs: DataAnalysisInputs,
    ) -> None:
        self.job_id = job_id
        self.analysis_kind = analysis_kind
        self.job_directory = job_directory
        self.analysis_inputs = analysis_inputs
        self.state = JOB_STATE_RUNNING
        self.stage: str | None = "Loading Input Rows into the local analysis database"
        self.progress: DataAnalysisProgress | None = None
        self.result: DataAnalysisSummary | None = None
        self.error: str | None = None

        self.started_at = time.monotonic()
        self._final_elapsed_seconds: float | None = None
        self._cancel_requested = threading.Event()
        self._lock = threading.Lock()
        self._connection: sqlite3.Connection | None = None
        self._worker = threading.Thread(
            target=self._run_analysis,
            name=f"data-analysis-job-{job_id}",
            daemon=True,
        )

    def start(self) -> None:
        self._worker.start()

    def request_cancel(self) -> None:
        self._cancel_requested.set()
        with self._lock:
            if self._connection is not None:
                self._connection.interrupt()

    def wait_until_stopped(self, timeout: float | None = CANCEL_WAIT_SECONDS) -> bool:
        self._worker.join(timeout)
        return not self._worker.is_alive()

    def clean_up_retained_data(self) -> None:
        with self._lock:
            clean_up_job(self.job_directory)

    def is_cancel_requested(self) -> bool:
        return self._cancel_requested.is_set()

    def report_progress(self, items_done: int, items_total: int) -> None:
        with self._lock:
            self.progress = DataAnalysisProgress(items_done=items_done, items_total=items_total)

    def set_stage(self, stage: str) -> None:
        with self._lock:
            self.stage = stage

    def status_snapshot(self) -> DataAnalysisJobStatus:
        with self._lock:
            if self._final_elapsed_seconds is None:
                elapsed_seconds = time.monotonic() - self.started_at
                stage = self.stage
            else:
                elapsed_seconds = self._final_elapsed_seconds
                stage = None

            return DataAnalysisJobStatus(
                job_id=self.job_id,
                analysis_kind=self.analysis_kind,
                state=self.state,
                stage=stage,
                elapsed_seconds=elapsed_seconds,
                progress=self.progress,
                result=self.result,
                error=self.error,
            )

    def rows_page(
        self,
        target_kind: str,
        item_index: int,
        column_index: int | None,
        page: int,
    ) -> dict[str, object]:
        with self._lock:
            if self.state != JOB_STATE_SUCCEEDED or self.result is None:
                raise DataAnalysisNotSucceededError()

            query, parameters, matching_row_count = self._rows_query(
                target_kind,
                item_index,
                column_index,
            )
            offset = (page - 1) * DATA_ROWS_PAGE_SIZE
            rows: list[tuple[object, ...]] = []
            if offset < matching_row_count:
                database_uri = self.analysis_inputs.database_path.resolve().as_uri() + "?mode=ro"
                connection = sqlite3.connect(database_uri, uri=True)
                try:
                    register_data_value_functions(
                        connection,
                        self.analysis_inputs.column_names,
                        self.analysis_inputs.missing_markers_by_column,
                    )
                    rows = connection.execute(
                        f"{query} LIMIT ? OFFSET ?",
                        [*parameters, DATA_ROWS_PAGE_SIZE, offset],
                    ).fetchall()
                finally:
                    connection.close()

            return {
                "columns": list(self.analysis_inputs.column_names),
                "rows": [list(row) for row in rows],
                "page": page,
                "page_size": DATA_ROWS_PAGE_SIZE,
                "total_rows": matching_row_count,
            }

    def open_rows_export(
        self,
        target_kind: str,
        item_index: int,
        column_index: int | None,
        column_mode: ColumnMode = "all",
    ) -> tuple[list[str], DataAnalysisRowsExport]:
        self._lock.acquire()
        connection: sqlite3.Connection | None = None
        try:
            if self.state != JOB_STATE_SUCCEEDED or self.result is None:
                raise DataAnalysisNotSucceededError()

            query, parameters, _ = self._rows_query(
                target_kind,
                item_index,
                column_index,
                column_mode,
            )
            database_uri = self.analysis_inputs.database_path.resolve().as_uri() + "?mode=ro"
            connection = sqlite3.connect(database_uri, uri=True, check_same_thread=False)
            register_data_value_functions(
                connection,
                self.analysis_inputs.column_names,
                self.analysis_inputs.missing_markers_by_column,
            )
            rows = DataAnalysisRowsExport(
                connection.execute(query, parameters),
                connection,
                self._lock,
            )
            visible_source_columns = source_columns_for_mode(
                self.analysis_inputs.column_names,
                self.result.selected_columns,
                column_mode,
            )
            return visible_source_columns, rows
        except BaseException:
            try:
                if connection is not None:
                    connection.close()
            finally:
                self._lock.release()
            raise

    def _rows_query(
        self,
        target_kind: str,
        item_index: int,
        column_index: int | None,
        column_mode: ColumnMode = "all",
    ) -> tuple[str, list[object], int]:
        if self.result is None:
            raise DataAnalysisNotSucceededError()
        if item_index < 0:
            raise DataAnalysisTargetNotFoundError()

        conditions: list[str] = []
        parameters: list[object] = []
        if target_kind == "group" and isinstance(self.result, GroupDataSummary):
            if column_index is not None or item_index >= len(self.result.groups):
                raise DataAnalysisTargetNotFoundError()
            group = self.result.groups[item_index]
            for selected_column, value in zip(self.result.selected_columns, group.values):
                source_column_index = self.analysis_inputs.column_names.index(selected_column)
                conditions.append(
                    f"{value_function_name(source_column_index)} "
                    f"({sqlite_column_name(source_column_index)}) IS ?"
                )
                parameters.append(value)
            matching_row_count = group.count
        elif target_kind in {"term", "format"} and isinstance(self.result, FormalTermsSummary):
            if column_index is None or column_index < 0 or column_index >= len(self.result.columns):
                raise DataAnalysisTargetNotFoundError()
            column_result = self.result.columns[column_index]
            source_column_index = self.analysis_inputs.column_names.index(column_result.name)
            if target_kind == "term":
                if item_index >= len(column_result.terms):
                    raise DataAnalysisTargetNotFoundError()
                term = column_result.terms[item_index]
                conditions.append(
                    f"{value_function_name(source_column_index)} "
                    f"({sqlite_column_name(source_column_index)}) IS ?"
                )
                parameters.append(term.value)
                matching_row_count = term.count
            else:
                if item_index >= len(column_result.format_patterns):
                    raise DataAnalysisTargetNotFoundError()
                format_pattern: DataFormatPattern = column_result.format_patterns[item_index]
                conditions.append(
                    f"{format_function_name(source_column_index)} "
                    f"({sqlite_column_name(source_column_index)}) = ?"
                )
                parameters.append(format_pattern.pattern)
                matching_row_count = format_pattern.occurrence_count
        else:
            raise DataAnalysisTargetNotFoundError()

        visible_source_columns = source_columns_for_mode(
            self.analysis_inputs.column_names,
            self.result.selected_columns,
            column_mode,
        )
        source_columns = [
            sqlite_column_name(self.analysis_inputs.column_names.index(column_name))
            for column_name in visible_source_columns
        ]
        query = (
            f'SELECT {", ".join(source_columns)} FROM "input_rows" '
            f'WHERE {" AND ".join(conditions)} ORDER BY rowid ASC'
        )
        return query, parameters, matching_row_count

    def _run_analysis(self) -> None:
        connection: sqlite3.Connection | None = None
        final_state = JOB_STATE_FAILED
        result: DataAnalysisSummary | None = None
        error: str | None = None

        try:
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

            if self.analysis_kind == FORMAL_TERMS_KIND:
                self.set_stage("Counting terms and finding structural formats")
                result = compute_formal_terms(
                    connection,
                    self.analysis_inputs.column_names,
                    self.analysis_inputs.selected_columns,
                    self.analysis_inputs.missing_markers_by_column,
                    progress_reporter=self.report_progress,
                    cancellation_check=self.is_cancel_requested,
                )
            else:
                self.set_stage("Grouping Input Rows by selected values")
                result = compute_group_data(
                    connection,
                    self.analysis_inputs.column_names,
                    self.analysis_inputs.selected_columns,
                    self.analysis_inputs.missing_markers_by_column,
                    progress_reporter=self.report_progress,
                    cancellation_check=self.is_cancel_requested,
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

            try:
                if final_state == JOB_STATE_SUCCEEDED:
                    clean_up_job_sources(self.job_directory)
                else:
                    clean_up_job(self.job_directory)
            except OSError:
                try:
                    clean_up_job(self.job_directory)
                except OSError:
                    pass
                final_state = JOB_STATE_FAILED
                result = None
                error = "Temporary working files could not be removed."

            self._finish(final_state, result, error)

    def _finish(
        self,
        state: str,
        result: DataAnalysisSummary | None,
        error: str | None,
    ) -> None:
        with self._lock:
            self.state = state
            self.stage = None
            self.result = result
            self.error = error
            self._final_elapsed_seconds = time.monotonic() - self.started_at


class DataAnalysisJobStore:
    """Retain one current Formal Terms and one current Group Data job."""

    def __init__(self) -> None:
        self._jobs: dict[str, DataAnalysisJob] = {}
        self._latest_job_by_kind: dict[str, str] = {}
        self._lock = threading.Lock()

    def replace_with(self, job: DataAnalysisJob) -> None:
        with self._lock:
            previous_job_id = self._latest_job_by_kind.pop(job.analysis_kind, None)
            previous_job = self._jobs.pop(previous_job_id, None)

        if previous_job is not None:
            previous_job.request_cancel()
            if previous_job.wait_until_stopped():
                previous_job.clean_up_retained_data()

        job.start()
        with self._lock:
            self._jobs[job.job_id] = job
            self._latest_job_by_kind[job.analysis_kind] = job.job_id

    def find(self, job_id: str) -> DataAnalysisJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> DataAnalysisJob | None:
        job = self.find(job_id)
        if job is not None:
            job.request_cancel()
            job.wait_until_stopped()
        return job

    def clear(self) -> None:
        with self._lock:
            jobs = list(self._jobs.values())
            self._jobs.clear()
            self._latest_job_by_kind.clear()

        for job in jobs:
            job.request_cancel()
        for job in jobs:
            job.wait_until_stopped(timeout=None)
            job.clean_up_retained_data()

    def shutdown(self) -> None:
        self.clear()
