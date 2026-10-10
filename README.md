# PatternX — Data Completeness Profiler

A local, offline tool that finds recurring completeness patterns in tabular data. It runs for one
user on Windows and macOS: a React web UI talking to a loopback-only FastAPI service backed by
Python's built-in SQLite. Your data never leaves your machine. See [CONTEXT.md](CONTEXT.md) for the
product language and [docs/ROADMAP.md](docs/ROADMAP.md) for the plan.

## Current status

You can import a CSV file or one chosen worksheet of an XLSX workbook and see the Column Completeness
Summary: for every column, the exact count and share of Input Rows with a present value. Null, empty,
and whitespace-only values are missing by default, additional missing value markers can be configured
per column, and zero counts as present. The Completeness Patterns analysis groups rows by the selected
columns' present and missing statuses. The Formal Terms analysis reports exact distinct terms and
repeated structural formats. The Group Data analysis reports observed exact value combinations,
their counts and shares, and a uniqueness summary for the selected Group Data Keys. All three analyses
run as background jobs with progress, elapsed-time reporting, and cancellation. Completeness Patterns
provides the aggregate downloads `column_completeness.csv` and `pattern_summary.csv`. Users can also
open row details for a pattern, term, structural format, or Group Data Key and explicitly download its
matching Input Rows as CSV.

## Prerequisites

- Python 3.12 or newer
- Node.js 22 or newer (with npm)

## Run locally

On Windows (PowerShell):

```powershell
.\run.ps1
```

On macOS (or Linux):

```bash
./run.sh
```

Then open http://localhost:5173 in your browser. The scripts create a Python virtual environment
and install dependencies on first run.

The API listens on http://127.0.0.1:8000, bound to loopback only. The web UI talks to it through a
local proxy. The application makes no external runtime requests and loads no external assets.

## Input files

CSV files are read as comma-separated text with the header row in the first line (UTF-8, with or
without a byte order mark). Each data line is one Input Row, counted as it appears in the file, so
rows that repeat an identifier value still count separately. A completely blank line carries no
fields and is not an Input Row; in a one-column file an empty line is a record with one empty value
and therefore is an Input Row with a missing value.

XLSX workbooks are read one worksheet at a time: the app lists the workbook's worksheets and
analyzes exactly the one you choose. The first row carrying values is the header row of that
worksheet, and every following row follows the same Input Row rules as a CSV file line: a row where
every cell is empty is not an Input Row, except in a one-column worksheet where it is one Input Row
with a missing value. Cell values are read as text: numbers as their stored numeric value, dates in
ISO form, booleans as TRUE and FALSE, and formula cells as their formula text, because the
application never evaluates formulas.

Excel's file format defines a maximum of 1,048,576 worksheet rows, header row included. The
application reads every row the chosen worksheet holds and never truncates it: a worksheet at the
limit is counted to its full 1,048,575 data rows. CSV files have no such worksheet row limit.

## Analysis jobs

Completeness Patterns, Formal Terms, and Group Data run as background jobs. While one runs, the app
reports its stage, elapsed time, and progress, and the user can cancel it. Cancelling removes the
job's working data.

The app asks the user to acknowledge a warning before a Completeness Patterns analysis selects 20 or
more columns. At 20 columns, 2^20 = 1,048,576 distinct Completeness Patterns are possible. The exact
summary reports every observed pattern. This count describes possible patterns, not performance.

Completeness Patterns also warns when a CSV upload is larger than the largest recorded synthetic CSV
benchmark (215.72 MiB), or when a selection has more analyzed columns than the largest measured
selection (21). These warnings come from the recorded workloads below. They are not limits, and the
app never truncates exact results. XLSX upload sizes are not compared because compression makes them
incomparable with the normalized CSV measurements. Runtime and memory use outside the recorded
workloads are unmeasured.

See [the synthetic SQLite benchmark report](docs/benchmarks/sqlite-synthetic-windows.md) for
machine- and workload-specific measurements at 1–2 million rows. They are not general performance
guarantees.

The latest successful job for each analysis mode may keep its temporary SQLite database while the
backend runs. The database supports row details and exports. A newer job in the same mode, a newly
accepted dataset import, changed Missing Value rules, graceful backend shutdown, or startup cleanup
removes retained databases. Raw uploads and normalized worksheet copies are removed when analysis
finishes.

## Exports

Every finished Completeness Patterns analysis offers two aggregate downloads:

- `column_completeness.csv` — for every column of the file: the Input Rows with a value, the Input
  Rows missing one, and each share of all Input Rows
- `pattern_summary.csv` — one row per observed Completeness Pattern: its present/missing statuses,
  its exact count of Input Rows, and its share of all Input Rows. Every observed pattern is written,
  whatever their number

Both files hold summary counts and shares only, never Input Rows or row-level details. They are UTF-8
CSV with a byte order mark so spreadsheet apps read them as text. Shares are written at full precision.
A column name a spreadsheet could read as a formula, with or without leading whitespace, is prefixed
with an apostrophe so it stays inert text.

Row detail dialogs for Completeness Patterns, Formal Terms, and Group Data let users inspect matching
Input Rows. The dialogs paginate results and let users explicitly download the matching rows as CSV.
These row-level exports are separate from the aggregate summary downloads.

## Pattern previews

Clicking a pattern shows a small sample of the Input Rows behind it, with present and missing cells
distinguished and Identifier Column values for recognition. Every value is shown as plain text, so
hostile cell content cannot run as markup or script.

The samples are kept while the analysis runs: up to five rows per pattern, with values longer than
256 characters shortened. Memory stays bounded — every pattern keeps its first sample row before any
pattern keeps a second one, up to 20,000 first rows and 20,000 further rows in total. A pattern
whose samples were not kept says so in the UI; the exact counts beside the samples are never capped.
Preview rows exist only in the app. The aggregate summary downloads never contain them. A separate,
user-initiated row-detail export contains the matching source rows.

## Tests

Install the test tooling once, then run the suite from `backend`:

```bash
.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt   # Windows
.venv/bin/python -m pip install -r backend/requirements-dev.txt           # macOS

cd backend
../.venv/Scripts/python.exe -m pytest -q    # Windows
../.venv/bin/python -m pytest -q            # macOS
```

Pytest restricts socket connections to the local machine, so the backend suite cannot make external
network requests. GitHub Actions runs the backend suite and frontend checks on Windows and macOS.

## Temporary file layout

The API keeps working data under one work directory
(`%TEMP%\patternx` on Windows, `/tmp/patternx` on macOS), organized as:

- `uploads/` — one private directory per request and per analysis job, holding the raw upload, the
  normalized CSV copy of the chosen worksheet, and the temporary SQLite database. Successful
  analysis jobs may retain the database temporarily for row details; the upload and normalized copy
  are removed when analysis finishes.

Failed and cancelled jobs leave no row-level data behind. Retained databases are removed when the job
is replaced, the backend shuts down, or startup cleanup runs.
