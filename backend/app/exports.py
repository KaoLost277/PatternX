"""CSV downloads of the summary results.

Both exports carry summary counts and shares only: never raw Input Rows, never
row-level details. File-derived values such as column names are written as inert
text — every value keeps its own CSV field under CSV quoting rules, and a value a
spreadsheet could read as a formula is prefixed with an apostrophe so it stays
text when the file is opened.
"""

import csv
import io

from app.completeness import ColumnCompletenessSummary
from app.patterns import PatternSummary

COLUMN_COMPLETENESS_EXPORT_NAME = "column_completeness.csv"
PATTERN_SUMMARY_EXPORT_NAME = "pattern_summary.csv"

# Shares are exact counts divided by Input Rows. They are written at full
# precision — the shortest decimal that reads back as the same number — so an
# export never rounds the reported share away.
SPREADSHEET_FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")


def column_completeness_csv(summary: ColumnCompletenessSummary) -> str:
    """Write the Column Completeness Summary as CSV text."""
    header_row = [
        "column",
        "input_rows",
        "input_rows_with_value",
        "share_with_value",
        "input_rows_missing_value",
        "share_missing_value",
    ]
    data_rows = []
    for column in summary.columns:
        data_rows.append(
            [
                inert_cell_text(column.name),
                str(summary.input_rows),
                str(column.present_count),
                format_export_share(column.present_share),
                str(column.missing_count),
                format_export_share(column.missing_share),
            ]
        )

    return build_csv_text(header_row, data_rows)


def pattern_summary_csv(summary: PatternSummary) -> str:
    """Write the complete Completeness Pattern summary as CSV text.

    Every observed pattern gets one row, in the summary's own order: no entry is
    ever dropped, whatever the number of patterns.
    """
    header_row = [inert_cell_text(column_name) for column_name in summary.analysis_columns]
    header_row.extend(["input_rows", "share_of_input_rows"])

    data_rows = []
    for pattern in summary.patterns:
        pattern_row = list(pattern.statuses)
        pattern_row.append(str(pattern.count))
        pattern_row.append(format_export_share(pattern.share))
        data_rows.append(pattern_row)

    return build_csv_text(header_row, data_rows)


def build_csv_text(header_row: list[str], data_rows: list[list[str]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(header_row)
    writer.writerows(data_rows)
    return output.getvalue()


def format_export_share(share: float) -> str:
    return repr(share)


def inert_cell_text(value: str) -> str:
    """Keep one exported cell inert when the file is opened in a spreadsheet.

    Spreadsheet apps trim leading whitespace before they read a cell, so the
    formula check looks past it too: a value like " =1+1" must not slip through
    and evaluate as a formula.
    """
    if value.startswith(SPREADSHEET_FORMULA_TRIGGERS):
        return "'" + value

    trimmed_value = value.lstrip()
    if trimmed_value.startswith(SPREADSHEET_FORMULA_TRIGGERS):
        return "'" + value

    return value
