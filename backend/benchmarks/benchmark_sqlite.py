"""Run a synthetic, local benchmark of the SQLite analysis path."""

import argparse
import csv
import ctypes
import os
import platform
import tempfile
import time
from pathlib import Path

from app.completeness import summarize_column_completeness
from app.patterns import AnalysisInputs, compute_pattern_summary
from app.sqlite_storage import (
    load_csv_into_database,
    open_analysis_database,
    read_column_names,
)

DEFAULT_ROWS = 1_000_000
DEFAULT_COLUMNS = 24
DEFAULT_SELECTED_COLUMNS = 21
DEFAULT_OBSERVED_PATTERNS = 16


def main() -> None:
    arguments = parse_arguments()
    with tempfile.TemporaryDirectory(prefix="patternx-sqlite-benchmark-") as temp_directory:
        benchmark_directory = Path(temp_directory)
        csv_path = benchmark_directory / "synthetic.csv"
        database_path = benchmark_directory / "analysis.sqlite3"
        generate_synthetic_csv(
            csv_path,
            arguments.rows,
            arguments.columns,
            arguments.selected_columns,
            arguments.observed_patterns,
        )

        started_at = time.perf_counter()
        validated_column_names = read_column_names(csv_path)
        connection = open_analysis_database(database_path)
        try:
            column_names = load_csv_into_database(connection, csv_path)
            if column_names != validated_column_names:
                raise AssertionError("CSV headers changed between validation and analysis.")
            column_summary = summarize_column_completeness(
                connection,
                column_names,
                {},
            )
            analysis_inputs = AnalysisInputs(
                analysis_csv_path=csv_path,
                database_path=database_path,
                column_names=column_names,
                missing_markers_by_column={},
                analysis_columns=column_names[: arguments.selected_columns],
                identifier_column=None,
            )
            pattern_summary = compute_pattern_summary(connection, analysis_inputs)
            assert_synthetic_results(
                arguments.rows,
                arguments.columns,
                arguments.selected_columns,
                arguments.observed_patterns,
                column_summary,
                pattern_summary,
            )
        finally:
            connection.close()
        elapsed_seconds = time.perf_counter() - started_at

        print(f"Input Rows: {column_summary.input_rows:,}")
        print(f"Columns: {arguments.columns:,}")
        print(f"Selected columns: {arguments.selected_columns:,}")
        print(f"Observed patterns: {len(pattern_summary.patterns):,}")
        print("Exact synthetic counts verified: yes")
        print(f"File size: {csv_path.stat().st_size / (1024 * 1024):.2f} MiB")
        print(f"Analysis runtime: {elapsed_seconds:.2f} seconds")
        print(f"Peak process memory: {peak_memory_mib():.2f} MiB")
        print(f"Operating system: {platform.platform()}")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=positive_integer, default=DEFAULT_ROWS)
    parser.add_argument("--columns", type=positive_integer, default=DEFAULT_COLUMNS)
    parser.add_argument(
        "--selected-columns",
        type=positive_integer,
        default=DEFAULT_SELECTED_COLUMNS,
    )
    parser.add_argument(
        "--observed-patterns",
        type=positive_integer,
        default=DEFAULT_OBSERVED_PATTERNS,
    )
    arguments = parser.parse_args()
    if arguments.selected_columns > arguments.columns:
        parser.error("--selected-columns cannot exceed --columns")
    if arguments.observed_patterns > 2**arguments.selected_columns:
        parser.error("--observed-patterns cannot exceed the possible pattern count")
    return arguments


def positive_integer(value: str) -> int:
    parsed_value = int(value)
    if parsed_value < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed_value


def generate_synthetic_csv(
    csv_path: Path,
    row_count: int,
    column_count: int,
    selected_column_count: int,
    observed_pattern_count: int,
) -> None:
    headers = [f"column_{column_index}" for column_index in range(column_count)]
    with csv_path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(headers)
        for row_index in range(row_count):
            pattern_number = row_index % observed_pattern_count
            row_values = []
            for column_index in range(column_count):
                if column_index < selected_column_count:
                    is_present = bool(pattern_number & (1 << column_index))
                else:
                    is_present = True
                row_values.append(f"value-{row_index % 100}" if is_present else "")
            writer.writerow(row_values)


def assert_synthetic_results(
    row_count: int,
    column_count: int,
    selected_column_count: int,
    observed_pattern_count: int,
    column_summary,
    pattern_summary,
) -> None:
    rows_per_pattern, extra_rows = divmod(row_count, observed_pattern_count)
    expected_pattern_counts = {}
    for pattern_number in range(observed_pattern_count):
        statuses = tuple(
            "present" if pattern_number & (1 << column_index) else "missing"
            for column_index in range(selected_column_count)
        )
        expected_count = rows_per_pattern + int(pattern_number < extra_rows)
        expected_pattern_counts[statuses] = expected_count

    actual_pattern_counts = {
        pattern.statuses: pattern.count for pattern in pattern_summary.patterns
    }
    if pattern_summary.input_rows != row_count:
        raise AssertionError("The pattern summary returned an unexpected Input Row count.")
    if actual_pattern_counts != expected_pattern_counts:
        raise AssertionError("The exact pattern counts did not match the synthetic reference.")

    for column_index, column in enumerate(column_summary.columns):
        if column_index >= selected_column_count:
            expected_present_count = row_count
        else:
            expected_present_count = 0
            for pattern_number in range(observed_pattern_count):
                pattern_count = rows_per_pattern + int(pattern_number < extra_rows)
                if pattern_number & (1 << column_index):
                    expected_present_count += pattern_count
        if column.present_count != expected_present_count:
            raise AssertionError(
                f"Column {column_index} had an unexpected present-value count."
            )


def peak_memory_mib() -> float:
    if os.name == "nt":
        return windows_peak_working_set_mib()
    return unix_peak_memory_mib()


def windows_peak_working_set_mib() -> float:
    from ctypes import wintypes

    class ProcessMemoryCounters(ctypes.Structure):
        _fields_ = [
            ("cb", ctypes.c_ulong),
            ("PageFaultCount", ctypes.c_ulong),
            ("PeakWorkingSetSize", ctypes.c_size_t),
            ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
            ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t),
            ("PeakPagefileUsage", ctypes.c_size_t),
            ("PrivateUsage", ctypes.c_size_t),
        ]

    counters = ProcessMemoryCounters()
    counters.cb = ctypes.sizeof(counters)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    process_handle = kernel32.GetCurrentProcess()
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    psapi.GetProcessMemoryInfo.argtypes = [
        wintypes.HANDLE,
        ctypes.POINTER(ProcessMemoryCounters),
        wintypes.DWORD,
    ]
    psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
    succeeded = psapi.GetProcessMemoryInfo(
        process_handle,
        ctypes.byref(counters),
        counters.cb,
    )
    if not succeeded:
        raise ctypes.WinError(ctypes.get_last_error())
    return counters.PeakWorkingSetSize / (1024 * 1024)


def unix_peak_memory_mib() -> float:
    import resource

    peak_memory = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if platform.system() == "Darwin":
        return peak_memory / (1024 * 1024)
    return peak_memory / 1024


if __name__ == "__main__":
    main()
