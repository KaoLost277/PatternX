# PatternX Product Expansion Roadmap

**Status:** Phase 1 is implemented and verified in the current working tree. Later phases remain proposals with no delivery dates.
**Research:** [Product expansion research and sources](../research/patternx-product-expansion.md)

This roadmap collects the extension ideas considered for PatternX and places them in a suggested order. Reprioritize after choosing the users and workflows the next release should serve.

## Product principles

- Keep PatternX local and offline, with the API loopback-only. Do not send imported data or metadata to remote services.
- Preserve the meanings of `Input Row`, `Identifier Column`, `Missing Value`, `Formal Term`, and `Group Data Key` in [CONTEXT.md](../../CONTEXT.md). In particular, repeated Identifier Column values do not merge Input Rows.
- Report exact, explainable counts where feasible. Distinguish missing values from values that fail a user-defined rule.
- Describe observed data; do not automatically label it anomalous, deduplicate it, or change it.
- Do not introduce permanent row-data retention. Existing user-initiated row detail and CSV export flows remain explicit actions and are governed by [ADR-0001](../adr/0001-local-offline-profiler.md).
- Treat contracts and profile snapshots as potentially sensitive, even when they contain aggregate metadata. Save or load them only at the user's request.

## Current foundation

The application already has three analysis modes: Completeness Patterns, Formal Terms, and Group Data. It supports CSV and a user-selected XLSX worksheet, configurable missing markers, background jobs, and row detail/export flows. See [AnalysisModeTabs.tsx](../../frontend/src/AnalysisModeTabs.tsx), [data_analyses.py](../../backend/app/data_analyses.py), and [the row detail/export requirements](../requirements/pattern-row-details-and-export.md).

The root [README](../../README.md) and [initial roadmap](../ROADMAP.md) now describe all three implemented modes. Keep them aligned with the code as features change.

## Proposed roadmap

### Phase 0 — Align product documentation and contract semantics

**Goal:** Make the existing product and the next feature's boundaries clear before expanding behavior.

- Update README and the initial roadmap to describe the current three modes and current row-detail/export behavior.
- Start with the uniqueness summary because it reuses the existing Group Data result. Follow with contracts after the rule and Missing Value semantics are settled.
- Define how a contract rule treats a Missing Value, a value that cannot be parsed, and a value that violates a constraint. Do not silently change current missing-marker semantics.
- Define the supported subset and versioning approach for a local JSON contract before implementing contract validation. Explain unsupported rules instead of ignoring them.

**Exit criteria:** README and the initial roadmap describe the current modes and row-detail/export behavior. Define contract rule outcomes and JSON versioning before Phase 2.

### Phase 1 — Uniqueness summary for selected columns

**Priority:** Implemented first feature.
**Goal:** Answer whether selected values or combinations are unique without inferring business meaning.

- For the columns selected in the existing Group Data run, report distinct Group Data Keys, keys occurring once, keys repeated across Input Rows, Input Rows in repeated-key groups, and the share of keys occurring once.
- Define the share of keys occurring once as singleton keys divided by distinct keys. State that denominator in the UI; do not present it as a share of Input Rows.
- Reuse the existing Group Data semantics and aggregation where practical.
- Explain how missing values participate in the key and report counts without combining Input Rows.
- Do not automatically declare a primary key, entity identity, duplicate record, or deletion candidate.

**Exit criteria:** Uniqueness measures reconcile with Group Data counts, including missing values and repeated Identifier Column values. Tests cover singleton, repeated, mixed, missing-containing, and high-cardinality groups. PatternX makes no Group Data performance claims or workload warnings until it has representative Group Data benchmarks.

### Phase 2 — User-defined data contracts

**Priority:** Next major feature after the uniqueness summary.
**Goal:** Let a user describe expectations and check a later file against those expectations without automatically judging the data.

- Create, import, and export a versioned contract JSON file, matched to columns by name.
- MVP rules: required, allowed values (`enum`), and a small set of explicitly selected basic types/formats.
- Show per-column/rule counts for missing, passing, and failing Input Rows. Clearly explain how these counts relate to the existing Missing Value rules.
- Keep results aggregate by default. Do not show or export failing row values automatically; existing row detail/export actions remain user-initiated.
- Warn about and reject unsupported contract features rather than claiming full compatibility with a standard.

**Exit criteria:** Exact counts on deterministic CSV/XLSX fixtures; contract version and unsupported-rule behavior are tested; no change to existing analysis semantics; cancellation and temporary-data cleanup work on success, failure, and cancellation.

**Possible standards alignment:** Start with a documented subset informed by [Frictionless Table Schema](https://specs.frictionlessdata.io/table-schema/) or [W3C CSVW metadata](https://www.w3.org/TR/tabular-metadata/). Do not fetch metadata from URLs; any contract is a local file chosen by the user.

### Phase 3 — Unified column profile overview

**Goal:** Give users one starting point for deciding which existing analysis to run next.

- Combine present/missing counts with distinct Formal Term counts and shares.
- Optionally show top Formal Terms and repeated Structural Format Patterns, with links into the existing detailed analyses.
- Keep this view descriptive. Defer automatic type inference; values that look numeric may be identifiers or codes.
- Measure memory and runtime when a column has very high Formal Term cardinality before promising workload limits.

**Exit criteria:** Overview metrics match the existing summaries and are clearly distinguished from inferred or user-defined checks.

### Phase 4 — User-managed aggregate Profile Snapshots and comparison

**Goal:** Compare recurring files without keeping source rows or an automatic job history in PatternX.

- Let users explicitly save and load a versioned aggregate snapshot file, then compare two snapshots.
- Compare columns added/removed/reordered and selected aggregate metrics such as row counts, completeness shares, distinct-term counts, and structural-format counts.
- Match columns by exact name first; require user mapping when names differ.
- Do not include Input Rows, previews, exact Formal Terms, exact Group Data tuples, or source file paths in the first snapshot format.
- Warn that column names and aggregate statistics can still be sensitive. Do not save snapshots automatically.

**Exit criteria:** Snapshot versions and comparison rules are documented; privacy review is complete; comparison never describes a change as an anomaly by itself.

### Phase 5 — Numeric and date summaries with explicit types

**Goal:** Add useful distribution summaries without guessing what a column means.

- Require the user to select a type and supported date/number format.
- Report parseable and unparseable counts, then descriptive metrics such as minimum, maximum, median, and selected quantiles.
- Preserve source text; document locale, decimal, and date parsing rules.
- Do not add automatic anomaly scoring or silently treat parse failures as missing values.

**Exit criteria:** Parsing behavior is deterministic and tested across supported formats/locales; large and high-cardinality workloads are benchmarked.

### Phase 6 — Reviewable normalization suggestions

**Goal:** Help users investigate Formal Terms that differ only by likely formatting variations.

- Suggest candidate groups such as case or surrounding-whitespace variants, based on exact Formal Terms.
- Show the original terms, counts, and proposed normalized result before any action.
- If users request a cleaned output, write a separate export; never alter the imported source or apply a normalization silently.
- Defer fuzzy matching, automatic correction, and deduplication until their false-positive risks and review workflow are specified.

**Exit criteria:** Suggestions are explainable, users can reject them, and exports preserve all rows and safely encode values.

### Phase 7 — Cross-file key and reference checks (future / larger scope)

**Goal:** Explore whether users need to check that values in one local dataset refer to values in another.

- Only proceed after validating demand and defining an explicit two-dataset local workflow.
- Let users choose the columns to compare and report matched/unmatched key counts; do not infer relationships automatically.
- Keep both datasets temporary and apply the existing cleanup, cancellation, and loopback-only boundaries.
- Treat foreign-key or relationship validation as a later contract feature, not part of the initial contract MVP.

**Exit criteria:** A separate scope decision, privacy review, and representative performance measurements are approved before implementation.

## Ideas explicitly not in the current direction

- Cloud upload, SaaS dashboard, multi-user accounts, telemetry, or remote APIs.
- Fetching contracts or CSVW metadata from URLs.
- Automatic anomaly labels, black-box risk scores, automatic type inference as fact, or prescriptive recommendations.
- Silent normalization, autocorrection, or deduplication.
- Automatic permanent history of imported rows, jobs, or snapshots.

These could only be reconsidered through an explicit product and architecture decision; they are not implied by this roadmap.

## Cross-phase quality gates

- Exact counts; never silently truncate results.
- Preserve all domain rules in [CONTEXT.md](../../CONTEXT.md), including the distinction between Input Rows and Identifier Column values.
- Keep the app usable without network access and the API loopback-only.
- Verify cleanup of raw uploads, normalized files, and temporary SQLite data after success, failure, cancellation, and shutdown, following [ADR-0001](../adr/0001-local-offline-profiler.md) and [ADR-0002](../adr/0002-use-python-sqlite-for-local-analysis.md).
- Test hostile CSV/XLSX values, exports, and supported Windows/macOS workflows.
- Benchmark new full-data scans and high-cardinality workloads before making performance claims.

## Research references

- [Frictionless Table Schema](https://specs.frictionlessdata.io/table-schema/) — column metadata, types, and constraints.
- [W3C Metadata Vocabulary for Tabular Data (CSVW)](https://www.w3.org/TR/tabular-metadata/) — tabular metadata and validation concepts.
- [Great Expectations: schema](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/schema/), [missingness](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/missingness/), [uniqueness](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/uniqueness/), and [distribution](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/distribution/) — examples of user-defined checks and descriptive profile metrics.
- [Frictionless Tabular Diff](https://specs.frictionlessdata.io/tabular-diff/) — an example of expressing table changes.
- Detailed findings, source notes, and tradeoffs: [patternx-product-expansion.md](../research/patternx-product-expansion.md).
