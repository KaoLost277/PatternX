# Data Completeness Profiler Roadmap

This file records the current product foundation. The original application-build phases are implemented and are no longer the forward plan. See the [product expansion roadmap](roadmaps/product-expansion.md) for proposed work.

## Product invariants

- Each imported row is an `Input Row`. Repeated `Identifier Column` values do not merge rows or change counts.
- Null, empty, and whitespace-only values are missing by default. Per-column markers are trimmed and matched without case sensitivity. Zero is present unless configured otherwise.
- Completeness results describe observed patterns. They do not label patterns as anomalous.
- PatternX runs for one user on Windows and macOS. The API binds to loopback, and the application makes no external runtime requests.
- Raw uploads and normalized worksheet files are temporary. The latest successful job per analysis mode may retain a temporary SQLite database for row details. PatternX does not keep permanent row-data history. See [ADR-0001](adr/0001-local-offline-profiler.md) and [ADR-0002](adr/0002-use-python-sqlite-for-local-analysis.md).
- Completeness exports contain aggregate summaries. Row-level CSV exports are separate and require a user action in a row-details view.

## Implemented product

- Import CSV files or one selected worksheet from an XLSX workbook.
- Show present and missing counts and shares for each column.
- Show the aggregate Column Profile for every source column, including distinct non-missing Formal Term counts and shares.
- Group selected columns by exact present and missing statuses in Completeness Patterns.
- Count exact Formal Terms and repeated Structural Format Patterns in selected columns.
- Group Input Rows by the observed exact value tuples of selected columns in Group Data. Report distinct keys, singleton and repeated keys, Input Rows in repeated-key groups, and singleton-key share of distinct keys.
- Apply local versioned Data Contracts with `required`, `enum`, `integer`, `number`, and explicit date-format rules. Report aggregate Missing, Pass, and Fail counts for each rule.
- Run all five analyses as background jobs with progress, elapsed-time reporting, and cancellation.
- Inspect matching Input Rows for patterns, terms, formats, and Group Data Keys. Download matching rows as CSV through explicit row-detail actions.
- Download `column_completeness.csv` and `pattern_summary.csv` from Completeness Patterns.

The [README](../README.md) describes input handling, analysis jobs, exports, and temporary-data lifecycle. The [SQLite benchmark report](benchmarks/sqlite-synthetic-windows.md) records measurements for its specific synthetic completeness workloads. Those measurements do not establish Group Data key-cardinality performance or general performance guarantees.

## Historical prototype

`prototypeapps/dynamic_data_pattern_profiler.html` remains a reference for the early workflow. It interpolates file-provided values into `innerHTML`, analyzes data synchronously in browser memory, and loads runtime assets from CDNs. Do not use it with sensitive or large real-world files. Do not delete it without explicit approval.

## Proposed product expansion

Phases 1, 2, and 3 are implemented and covered by tests. Phase 1 adds the Group Data Key uniqueness summary without inferring primary keys, merging Input Rows, or labeling repeated groups as duplicate records. Phase 2 adds local user-defined Data Contracts. Phase 3 adds the aggregate-only Unified Column Profile Overview. The next proposed feature is user-managed Profile Snapshots.

The complete sequence and requirements are in the [product expansion roadmap](roadmaps/product-expansion.md) and [product expansion specification](requirements/product-expansion-spec.md). Later phases remain proposals.
