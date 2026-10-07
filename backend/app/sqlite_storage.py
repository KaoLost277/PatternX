"""Stream CSV text into a private SQLite database for one request or job."""

import csv
import sqlite3
from collections.abc import Callable
from pathlib import Path

ANALYSIS_TABLE_NAME = "input_rows"
ANALYSIS_COLUMN_PREFIX = "input_column_"
INSERT_BATCH_ROWS = 10_000


class CSVFileError(ValueError):
    """Raised when CSV text cannot be read as a rectangular table."""


class CSVImportCancelledError(Exception):
    """Raised when an analysis is cancelled while CSV rows are being staged."""


def open_analysis_database(database_path: Path) -> sqlite3.Connection:
    """Open a disposable database tuned for one local analysis run."""
    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA journal_mode = OFF")
    connection.execute("PRAGMA synchronous = OFF")
    connection.execute("PRAGMA temp_store = MEMORY")
    return connection


def read_column_names(csv_path: Path) -> list[str]:
    """Read normalized headers and validate row widths without storing row data."""
    try:
        with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
            reader = csv.reader(csv_file, strict=True)
            header = next(reader)
            if not header:
                raise CSVFileError("The uploaded file could not be read as a CSV file.")

            column_names = unique_column_names(header)
            validate_row_widths(reader, len(column_names))
    except (OSError, UnicodeDecodeError, csv.Error, StopIteration) as error:
        raise CSVFileError("The uploaded file could not be read as a CSV file.") from error

    return column_names


def load_csv_into_database(
    connection: sqlite3.Connection,
    csv_path: Path,
    cancellation_check: Callable[[], bool] | None = None,
) -> list[str]:
    """Load every Input Row as text and return the normalized header names."""
    try:
        with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
            reader = csv.reader(csv_file, strict=True)
            header = next(reader)
            if not header:
                raise CSVFileError("The uploaded file could not be read as a CSV file.")

            column_names = unique_column_names(header)
            create_input_table(connection, len(column_names))
            insert_rows(connection, reader, len(column_names), cancellation_check)
    except CSVImportCancelledError:
        raise
    except CSVFileError:
        raise
    except (OSError, UnicodeDecodeError, csv.Error, StopIteration) as error:
        raise CSVFileError("The uploaded file could not be read as a CSV file.") from error

    return column_names


def unique_column_names(header: list[str]) -> list[str]:
    """Keep source headers readable while making repeated names unambiguous."""
    unique_names = []
    used_names: set[str] = set()
    next_suffix_by_name: dict[str, int] = {}

    for raw_source_name in header:
        source_name = raw_source_name.strip()
        candidate_name = source_name
        suffix = next_suffix_by_name.get(source_name, 1)
        while candidate_name in used_names:
            candidate_name = f"{source_name}_{suffix}"
            suffix += 1

        unique_names.append(candidate_name)
        used_names.add(candidate_name)
        next_suffix_by_name[source_name] = suffix

    return unique_names


def validate_row_widths(csv_rows, column_count: int) -> None:
    for csv_row in csv_rows:
        if not csv_row and column_count > 1:
            continue
        if not csv_row and column_count == 1:
            continue
        if len(csv_row) != column_count:
            raise CSVFileError("The uploaded file could not be read as a CSV file.")


def create_input_table(connection: sqlite3.Connection, column_count: int) -> None:
    generated_columns = [
        f'"{ANALYSIS_COLUMN_PREFIX}{column_index}" TEXT'
        for column_index in range(column_count)
    ]
    connection.execute(
        f'CREATE TABLE "{ANALYSIS_TABLE_NAME}" ({", ".join(generated_columns)})'
    )


def insert_rows(
    connection: sqlite3.Connection,
    csv_rows,
    column_count: int,
    cancellation_check: Callable[[], bool] | None,
) -> None:
    placeholders = ", ".join("?" for _ in range(column_count))
    insert_statement = (
        f'INSERT INTO "{ANALYSIS_TABLE_NAME}" VALUES ({placeholders})'
    )
    batch_rows: list[tuple[str | None, ...]] = []

    with connection:
        for csv_row in csv_rows:
            if not csv_row and column_count > 1:
                continue

            if not csv_row:
                csv_row = [""]
            if len(csv_row) != column_count:
                raise CSVFileError("The uploaded file could not be read as a CSV file.")

            batch_rows.append(
                tuple(cell_value if cell_value != "" else None for cell_value in csv_row)
            )
            if len(batch_rows) == INSERT_BATCH_ROWS:
                raise_if_import_cancelled(cancellation_check)
                connection.executemany(insert_statement, batch_rows)
                batch_rows.clear()

        raise_if_import_cancelled(cancellation_check)
        if batch_rows:
            connection.executemany(insert_statement, batch_rows)


def raise_if_import_cancelled(cancellation_check: Callable[[], bool] | None) -> None:
    if cancellation_check is not None and cancellation_check():
        raise CSVImportCancelledError()
