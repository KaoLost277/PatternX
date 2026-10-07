# Use Python's built-in SQLite for local analysis

The Windows Smart App Control policy blocked DuckDB's native Python extension in the target development environment. The profiler must continue to run on Windows without disabling or bypassing that policy, remain local and offline, and preserve its exact completeness results. SQLite is available through the Python standard library and was verified to import in the affected virtual environment.

Replace DuckDB with Python's built-in `sqlite3` and the standard-library CSV parser. Keep the API and user-visible summaries unchanged. Store imported rows in a per-request or per-job temporary SQLite database, then delete that database together with the raw upload on success, failure, and cancellation. Record representative synthetic benchmark results before making performance claims for the 1–2 million-row target.

This supersedes the DuckDB engine choice in [ADR-0001](0001-local-offline-profiler.md); its decisions about the local React/FastAPI boundary, loopback-only service, offline runtime, and transient source data remain in force.

## Consequences

- The backend no longer installs or imports DuckDB, avoiding its blocked native extension.
- CSV parsing, completeness aggregation, pattern grouping, cancellation, and cleanup must retain the existing API contract and exact counts.
- SQLite may be slower than DuckDB on large inputs. Measurements are recorded in the synthetic benchmark report, but they do not establish a general performance limit.
- The temporary SQLite database contains imported row data while an analysis is running and must be removed on every outcome.
