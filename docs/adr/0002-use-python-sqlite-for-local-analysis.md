# Use Python's built-in SQLite for local analysis

The Windows Smart App Control policy blocked DuckDB's native Python extension in the target development environment. The profiler must continue to run on Windows without disabling or bypassing that policy, remain local and offline, and preserve its exact completeness results. SQLite is available through the Python standard library and was verified to import in the affected virtual environment.

Replace DuckDB with Python's built-in `sqlite3` and the standard-library CSV parser. Keep existing summary results and completeness rules unchanged. Store imported rows in a per-request or per-result temporary SQLite database. Request databases and failed or cancelled analysis databases are deleted with their raw uploads. As refined by [ADR-0001](0001-local-offline-profiler.md), retain the current successful Column Completeness Summary and latest successful analysis job databases temporarily for local row details, while deleting raw uploads and normalized worksheet copies. Data Contract jobs delete SQLite after computing aggregate results because they do not provide row details. Record representative synthetic benchmark results before making performance claims for the 1–2 million-row target.

This supersedes the DuckDB engine choice in [ADR-0001](0001-local-offline-profiler.md); its decisions about the local React/FastAPI boundary, loopback-only service, offline runtime, and transient source data remain in force.

## Consequences

- The backend no longer installs or imports DuckDB, avoiding its blocked native extension.
- CSV parsing, completeness aggregation, pattern grouping, cancellation, and cleanup must retain the existing API contract and exact counts.
- SQLite may be slower than DuckDB on large inputs. Measurements are recorded in the synthetic benchmark report, but they do not establish a general performance limit.
- Temporary SQLite databases contain imported row data while a summary or analysis is computed. The current successful Column Completeness Summary and latest successful job database per analysis mode remain available only while current and while the backend runs; replacement, accepted imports, changed Missing Value rules, graceful shutdown, and startup cleanup remove retained databases.
- A successful Data Contract job deletes its database after the aggregate result is ready.
