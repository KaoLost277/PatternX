# Data Completeness Profiler Roadmap

This roadmap reflects the product decisions in [CONTEXT.md](../CONTEXT.md) and [ADR-0001](adr/0001-local-offline-profiler.md). It is a proposed sequence, not a claim that these capabilities already exist.

## Product scope

- One imported data row is one `Input Row`; duplicate identifier values do not merge rows.
- The optional `Identifier Column` is for identifying or displaying rows, not grouping them.
- Null, empty, and whitespace-only values are missing by default. Users can configure additional per-column markers; marker matching trims surrounding whitespace and ignores letter case. Zero is a value unless configured otherwise.
- Show per-column completeness first, then let users choose a subset of columns for exact cross-column pattern counts. Present results descriptively; do not label patterns as anomalous.
- Support CSV as the primary large-file format and XLSX with one user-selected sheet. XLSX remains subject to Excel's worksheet row limit.
- Run for one user on Windows and macOS through local commands. The runtime must work without external services; bind the API to loopback and bundle runtime assets.
- Delete raw input files after analysis. Do not keep server-side analysis history or export raw rows. Offer two downloads: `column_completeness.csv` and `pattern_summary.csv`.
- Benchmark an initial target of 1–2 million rows and datasets with more than 20 columns. Do not promise a fixed processing time before measuring representative data.

## Current prototype

`prototypeapps/dynamic_data_pattern_profiler.html` demonstrates file selection, mock data, column selection, binary completeness patterns, counts and percentages, pattern filtering, and a 50-row preview. `prototypeapps/note.md` describes a larger-file architecture that is not implemented yet.

The prototype is not ready for sensitive or large real-world files:

- File-provided headers and cell values are interpolated into `innerHTML`, creating an injection risk.
- CSV/XLSX data is loaded into browser memory and analyzed synchronously; the stated million-row target has not been benchmarked.
- Pattern cardinality can grow exponentially with the number of selected columns.
- Missing-value rules are hard-coded, and re-importing can retain stale selections/results.
- Runtime assets are loaded from CDNs, so the page is not offline-capable.

Keep the HTML prototype as a reference while migrating its desired workflow into the new application. Do not use it with sensitive data until its injection risk is addressed, and do not delete it as part of the migration without explicit approval.

## Phases

### 1. Establish the local application boundary

- Add a React/Vite frontend and a FastAPI/SQLite backend as separate applications.
- Provide local run scripts for Windows and macOS.
- Bind the API to loopback only and remove runtime dependencies on CDNs or other external services.
- Define temporary-file handling so raw uploads and SQLite working databases are cleaned up after success, failure, or cancellation.

**Exit criteria:** the application starts locally on both target operating systems, makes no external runtime requests, and does not expose the API to the network.

### 2. Implement safe file ingestion and completeness rules

- Parse CSV and let users choose one sheet from an XLSX workbook.
- Validate headers, malformed files, empty files, and unsupported formats with useful errors.
- Apply the agreed missing-value defaults and per-column custom markers consistently.
- Reset all selection and result state on each new import.
- Keep the identifier column separate from the pattern-analysis columns.

**Exit criteria:** tests cover CSV/XLSX selection, duplicate identifiers, blank/null values, custom markers, case/whitespace normalization, and zero as a valid value by default.

### 3. Build the analysis engine

- Calculate per-column counts and shares for all input rows.
- Calculate exact counts for every observed pattern across the user-selected subset of columns.
- Run large analyses as background jobs with progress and elapsed-time reporting.
- Show the most common patterns in the UI and make the complete exact pattern summary downloadable; never silently discard the remaining patterns.
- Benchmark representative 1–2 million-row files and high-cardinality selections before setting limits or performance claims.

**Exit criteria:** analysis results match reference calculations on deterministic fixtures, progress is visible, and benchmark results record row count, column count, selected-column count, file size, runtime, and peak memory.

### 4. Complete the user workflow and exports

- Migrate the current prototype's desired column-selection, pattern filtering, and row-preview workflow into React.
- Export `column_completeness.csv` and `pattern_summary.csv`; keep source rows out of exports.
- Make file-derived values render as text rather than executable markup.
- Display explicit warnings before expensive high-cardinality analyses.

**Exit criteria:** a user can import a file, inspect column completeness, choose pattern columns, view and filter results, and download both summaries without exposing raw rows.

### 5. Verify safety and cross-platform behavior

- Test hostile CSV/XLSX headers and cell values to prevent script injection.
- Verify raw and temporary files are removed after success, failure, and cancellation.
- Verify operation with network access disabled.
- Run the same import, analysis, export, and cleanup tests on Windows and macOS.
- Use benchmark results to choose evidence-based file-size and selected-column warnings; retain exact counts rather than truncating silently.

**Exit criteria:** the safety and functional tests pass on both operating systems, and measured limits are documented without claiming unmeasured performance.

## Not in the initial scope

- Cloud hosting, multi-user accounts, multi-tenant isolation, or saved analysis history.
- Automatic anomaly classification or prescriptive recommendations.
- Exporting raw rows or row-level details.
- A fixed latency guarantee before representative benchmarks exist.
