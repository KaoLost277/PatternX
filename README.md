# PatternX — Data Completeness Profiler

A local, offline tool that finds recurring completeness patterns in tabular data. It runs for one
user on Windows and macOS: a React web UI talking to a loopback-only FastAPI service backed by
DuckDB. Your data never leaves your machine. See [CONTEXT.md](CONTEXT.md) for the product language
and [docs/ROADMAP.md](docs/ROADMAP.md) for the plan.

## Current status

You can import a CSV file or one chosen worksheet of an XLSX workbook and see the Column Completeness
Summary: for every column, the exact count and share of Input Rows with a present value. Null, empty,
and whitespace-only values are missing by default, additional missing value markers can be configured
per column, and zero counts as present. The Completeness Summary — every observed Completeness Pattern
with its exact count and share of Input Rows — runs as a background analysis job with progress,
elapsed-time reporting, and cancellation. Every finished analysis offers the two summary downloads
`column_completeness.csv` and `pattern_summary.csv`, and clicking a pattern previews a small sample
of its Input Rows.

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

The Completeness Summary runs as a background analysis job. While it runs, the app reports what stage
the job is in, how long it has been running, and how many Input Rows have been grouped so far, and
the job can be cancelled at any time. Cancelling stops the work and deletes the job's working data,
just like a finished or failed run.

Before an analysis whose selected-column count reaches 20 the app shows a warning the user must
acknowledge: 2^20 = 1,048,576 distinct Completeness Patterns become possible at that count, and the
exact summary reports every observed one. This is a statement about the number of possible patterns,
not a performance claim.

Only the most recent analysis job is kept: starting a new analysis cancels and replaces the previous
one, so results of an earlier import never survive into a newer one.

## Exports

Every finished analysis offers two downloads:

- `column_completeness.csv` — for every column of the file: the Input Rows with a value, the Input
  Rows missing one, and each share of all Input Rows
- `pattern_summary.csv` — one row per observed Completeness Pattern: its present/missing statuses,
  its exact count of Input Rows, and its share of all Input Rows. Every observed pattern is written,
  whatever their number

Both files hold summary counts and shares only: never raw Input Rows, never row-level details. They
are UTF-8 CSV with a byte order mark so spreadsheet apps read them as text, shares are written at
full precision, and a column name a spreadsheet could read as a formula — with or without leading
whitespace — is prefixed with an apostrophe so it stays inert text.

## Pattern previews

Clicking a pattern shows a small sample of the Input Rows behind it, with present and missing cells
distinguished and Identifier Column values for recognition. Every value is shown as plain text, so
hostile cell content cannot run as markup or script.

The samples are kept while the analysis runs: up to five rows per pattern, with values longer than
256 characters shortened. Memory stays bounded — every pattern keeps its first sample row before any
pattern keeps a second one, up to 20,000 first rows and 20,000 further rows in total. A pattern
whose samples were not kept says so in the UI; the exact counts beside the samples are never capped.
Preview rows exist only in the app — the downloads never contain them.

## Tests

Install the test tooling once, then run the suite from `backend`:

```bash
.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt   # Windows
.venv/bin/python -m pip install -r backend/requirements-dev.txt           # macOS

cd backend
../.venv/Scripts/python.exe -m pytest -q    # Windows
../.venv/bin/python -m pytest -q            # macOS
```

## Temporary file layout

The API keeps all transient working data under one work directory
(`%TEMP%\patternx` on Windows, `/tmp/patternx` on macOS), organized as:

- `uploads/` — one private directory per request and per analysis job, holding the raw uploaded file
  and the normalized CSV copy of the chosen worksheet; deleted again when the request or the job ends
- `duckdb/` — DuckDB spill and working files

Nothing in this directory is kept after a request or an analysis job finishes.
