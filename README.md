# PatternX — Data Completeness Profiler

A local, offline tool that finds recurring completeness patterns in tabular data. It runs for one
user on Windows and macOS: a React web UI talking to a loopback-only FastAPI service backed by
DuckDB. Your data never leaves your machine. See [CONTEXT.md](CONTEXT.md) for the product language
and [docs/ROADMAP.md](docs/ROADMAP.md) for the plan.

## Current status

You can import a CSV file and see the Column Completeness Summary: for every column, the exact count
and share of Input Rows with a present value. Null, empty, and whitespace-only values are missing by
default, additional missing value markers can be configured per column, and zero counts as present.
Pattern analysis, exports, and the rest of the workflow follow in later tickets.

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

- `uploads/` — raw uploaded files, deleted again as soon as they have been read
- `duckdb/` — DuckDB spill and working files

Nothing in this directory is kept after a request finishes.
