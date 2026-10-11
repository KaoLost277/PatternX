"""Temporary row-detail access for a completed Column Completeness Summary."""

import sqlite3
import threading
from collections.abc import Iterator
from pathlib import Path

from app.completeness import (
    ColumnCompletenessSummary,
    presence_function_name,
    register_presence_functions,
    summarize_column_completeness,
    sqlite_column_name,
)
from app.row_details import SourceColumnProjection, source_column_projection
from app.row_filters import (
    ColumnFilters,
    register_row_filter_functions,
    row_filter_conditions,
)
from app.sqlite_storage import load_csv_into_database, open_analysis_database
from app.workfiles import clean_up_job, clean_up_job_sources

COLUMN_STATUS_PAGE_SIZE = 50
COLUMN_STATUS_EXPORT_BATCH_SIZE = 1_000


class ColumnStatusTargetNotFoundError(Exception):
    """Raised when a requested source column is outside the analyzed dataset."""


class ColumnStatusRowsExport(Iterator[tuple[str | None, ...]]):
    """Stream matching source rows and release the job lock when closed."""

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

    def __iter__(self) -> "ColumnStatusRowsExport":
        return self

    def __next__(self) -> tuple[str | None, ...]:
        if self._closed:
            raise StopIteration

        if self._next_row_index == len(self._batch_rows):
            try:
                self._batch_rows = self._cursor.fetchmany(COLUMN_STATUS_EXPORT_BATCH_SIZE)
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


class ColumnCompletenessJob:
    """Retain one exact Column Completeness result and its temporary row database."""

    def __init__(
        self,
        job_id: str,
        job_directory: Path,
        column_names: list[str],
        missing_markers_by_column: dict[str, list[str]],
        summary: ColumnCompletenessSummary,
    ) -> None:
        self.job_id = job_id
        self.job_directory = job_directory
        self.database_path = job_directory / "analysis.sqlite3"
        self.column_names = column_names
        self.missing_markers_by_column = missing_markers_by_column
        self.summary = summary
        self._lock = threading.Lock()
        self._cleaned_up = False

    def rows_page(
        self,
        column_index: int,
        status: str,
        page: int,
        filters: ColumnFilters | None = None,
    ) -> dict[str, object]:
        """Return one source-ordered page for the selected column status."""
        if column_index < 0 or column_index >= len(self.column_names):
            raise ColumnStatusTargetNotFoundError()
        if status not in {"present", "missing"}:
            raise ColumnStatusTargetNotFoundError()

        with self._lock:
            self._require_database()
            connection = self._open_read_connection()
            try:
                self._register_query_functions(connection)
                query, count_query, parameters, projection = self._rows_query(
                    column_index,
                    status,
                    filters,
                )
                total_rows = int(connection.execute(count_query, parameters).fetchone()[0])
                offset = (page - 1) * COLUMN_STATUS_PAGE_SIZE
                rows: list[tuple[str | None, ...]] = []
                if offset < total_rows:
                    rows = connection.execute(
                        f"{query} LIMIT ? OFFSET ?",
                        [*parameters, COLUMN_STATUS_PAGE_SIZE, offset],
                    ).fetchall()
            finally:
                connection.close()

        return {
            "columns": list(projection.names),
            "rows": [list(row) for row in rows],
            "page": page,
            "page_size": COLUMN_STATUS_PAGE_SIZE,
            "total_rows": total_rows,
        }

    def open_rows_export(
        self,
        column_index: int,
        status: str,
        filters: ColumnFilters | None = None,
    ) -> tuple[list[str], ColumnStatusRowsExport]:
        """Open a streamed export for all Input Rows matching one column status."""
        if column_index < 0 or column_index >= len(self.column_names):
            raise ColumnStatusTargetNotFoundError()
        if status not in {"present", "missing"}:
            raise ColumnStatusTargetNotFoundError()
        self._lock.acquire()
        connection: sqlite3.Connection | None = None
        try:
            self._require_database()
            connection = self._open_read_connection()
            self._register_query_functions(connection)
            query, _count_query, parameters, projection = self._rows_query(
                column_index,
                status,
                filters,
            )
            cursor = connection.execute(query, parameters)
            rows = ColumnStatusRowsExport(cursor, connection, self._lock)
            connection = None
            return list(projection.names), rows
        except BaseException:
            try:
                if connection is not None:
                    connection.close()
            finally:
                self._lock.release()
            raise

    def clean_up_retained_data(self) -> None:
        """Delete the retained database when this summary is replaced or cleared."""
        with self._lock:
            if self._cleaned_up:
                return
            clean_up_job(self.job_directory)
            self._cleaned_up = True

    def _require_database(self) -> None:
        if self._cleaned_up or not self.database_path.exists():
            raise ColumnStatusTargetNotFoundError()

    def _open_read_connection(self) -> sqlite3.Connection:
        database_uri = self.database_path.resolve().as_uri() + "?mode=ro"
        return sqlite3.connect(database_uri, uri=True, check_same_thread=False)

    def _register_query_functions(self, connection: sqlite3.Connection) -> None:
        register_presence_functions(
            connection,
            self.column_names,
            self.missing_markers_by_column,
        )
        register_row_filter_functions(connection)

    def _rows_query(
        self,
        column_index: int,
        status: str,
        filters: ColumnFilters | None,
    ) -> tuple[str, str, list[object], SourceColumnProjection]:
        expected_present = int(status == "present")
        status_condition = (
            f"{presence_function_name(column_index)}"
            f"({sqlite_column_name(column_index)}) = ?"
        )
        filter_conditions, filter_parameters = row_filter_conditions(
            filters or {},
            self.column_names,
            lambda _source_index, sqlite_column: (
                f"patternx_is_present_{_source_index}({sqlite_column}) = 0"
            ),
        )
        conditions = [status_condition, *filter_conditions]
        parameters: list[object] = [expected_present, *filter_parameters]
        where_clause = " AND ".join(conditions)
        projection = source_column_projection(
            self.column_names,
            (),
            "all",
        )
        query = (
            f'SELECT {", ".join(projection.sqlite_columns)} FROM "input_rows" '
            f"WHERE {where_clause} ORDER BY rowid ASC"
        )
        count_query = f'SELECT count(*) FROM "input_rows" WHERE {where_clause}'
        return query, count_query, parameters, projection


def create_column_completeness_job(
    job_id: str,
    job_directory: Path,
    analysis_csv_path: Path,
    missing_markers_by_column: dict[str, list[str]],
) -> ColumnCompletenessJob:
    """Import one normalized dataset, compute its summary, and retain only SQLite."""
    database_path = job_directory / "analysis.sqlite3"
    connection = open_analysis_database(database_path)
    try:
        column_names = load_csv_into_database(connection, analysis_csv_path)
        summary = summarize_column_completeness(
            connection,
            column_names,
            missing_markers_by_column,
        )
    finally:
        connection.close()

    clean_up_job_sources(job_directory)
    return ColumnCompletenessJob(
        job_id,
        job_directory,
        column_names,
        missing_markers_by_column,
        summary,
    )


class ColumnCompletenessJobStore:
    """Keep only the current Column Completeness result and its temporary database."""

    def __init__(self) -> None:
        self._job: ColumnCompletenessJob | None = None
        self._lock = threading.Lock()

    def replace_with(self, job: ColumnCompletenessJob) -> None:
        with self._lock:
            previous_job = self._job
            self._job = job

        if previous_job is not None:
            previous_job.clean_up_retained_data()

    def find(self, job_id: str) -> ColumnCompletenessJob | None:
        with self._lock:
            if self._job is None or self._job.job_id != job_id:
                return None
            return self._job

    def clear(self) -> None:
        with self._lock:
            previous_job = self._job
            self._job = None

        if previous_job is not None:
            previous_job.clean_up_retained_data()

    def shutdown(self) -> None:
        self.clear()
