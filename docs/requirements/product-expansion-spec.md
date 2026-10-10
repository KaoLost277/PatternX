# Product expansion specification

**Status:** Phase 1, the uniqueness summary, is implemented and verified. Later phases remain proposed.
**Roadmap:** [PatternX Product Expansion Roadmap](../roadmaps/product-expansion.md)
**Research:** [Product expansion research and sources](../research/patternx-product-expansion.md)

## Purpose

PatternX already reports Completeness Patterns, Formal Terms, and Group Data. This specification defines how users can turn those reports into repeatable, user-defined checks, compare aggregate profiles, and inspect selected data characteristics while keeping source data local.

The proposed work serves users who inspect recurring CSV or XLSX extracts and need to know whether files meet explicit expectations or changed since an earlier extract. PatternX remains a local, offline, single-user application. Phase 1 is implemented; later phases remain proposals.

## Current behavior

- PatternX imports CSV files or one worksheet selected from an XLSX workbook.
- PatternX counts each Input Row independently. Repeated Identifier Column values do not combine rows.
- PatternX treats null, empty, and whitespace-only values as missing by default. Users can configure additional per-column missing markers.
- Completeness Patterns, Formal Terms, and Group Data run as separate analysis modes.
- Users can inspect and explicitly export selected row details. PatternX does not retain row data permanently.

See [CONTEXT.md](../../CONTEXT.md), [ADR-0001](../adr/0001-local-offline-profiler.md), and [the existing row detail and export requirements](pattern-row-details-and-export.md).

## Product requirements

### Local operation and data lifecycle

- **PX-BASE-01.** PatternX must analyze imported data on the user's machine and must not send source data or metadata to remote services.
- **PX-BASE-02.** The API must remain loopback-only. New features must work without network access.
- **PX-BASE-03.** New jobs must follow the temporary-file cleanup rules in ADR-0001 and ADR-0002 after success, failure, cancellation, and backend shutdown.
- **PX-BASE-04.** New features must preserve the domain definitions in [CONTEXT.md](../../CONTEXT.md). They must not merge Input Rows because Identifier Column values repeat.
- **PX-BASE-05.** PatternX must report observed data and explicit user-defined rule results. It must not label a result anomalous without a user-defined rule.
- **PX-BASE-06.** PatternX must not modify an imported source file. Any future cleaned output must be a separate, user-requested export.
- **PX-BASE-07.** PatternX must preserve existing user-initiated row detail and CSV export behavior. New aggregate-only features must not silently add row-level exports.

### Phase 0. Resolve terms and documentation

- **PX-DOC-01.** Before Phase 1, update README and the initial roadmap to describe the current Completeness Patterns, Formal Terms, and Group Data modes and the current row detail and export behavior.
- **PX-DOC-02.** Before Phase 2, define how contract checks interact with Missing Value rules, including configured markers and per-column overrides.
- **PX-DOC-03.** Before Phase 2, document the contract format version and the subset of rules PatternX supports.

### Phase 1. Uniqueness summaries

- **PX-UNIQUE-01.** The summary must use the ordered columns selected for the existing Group Data run. It must not add a separate column selection or combine results from different runs.
- **PX-UNIQUE-02.** The summary must report distinct Group Data Keys, keys that occur once, keys shared by multiple Input Rows, and Input Rows in repeated-key groups.
- **PX-UNIQUE-03.** The share of keys that occur once must equal `keys_occurring_once / distinct_keys`. The interface must identify distinct keys as the denominator. This is not the share of Input Rows in singleton groups.
- **PX-UNIQUE-04.** Key construction must follow the existing Group Data semantics, including configured Missing Value handling and exact text comparison for other values.
- **PX-UNIQUE-05.** The summary must not identify a primary key or business identity automatically. It must not merge, delete, or label Input Rows as duplicate records.
- **PX-UNIQUE-06.** The summary must remain exact and must not silently truncate results. PatternX must benchmark Group Data workloads before making performance claims or setting warnings. Completeness benchmarks do not establish Group Data coverage.
- **PX-UNIQUE-07.** A successful `group_data` result must include a required `key_uniqueness` object with `distinct_key_count`, `singleton_key_count`, `repeated_key_count`, `input_rows_in_repeated_key_groups`, and `singleton_key_share`. Formal Terms results and unsuccessful jobs must not include this object.
- **PX-UNIQUE-08.** PatternX must calculate the summary from the existing Group Data groups. It must not run another source-row scan or SQL query for these metrics.
- **PX-UNIQUE-09.** The UI must show the metrics outside the sortable, filterable, preview-limited Group Data table. It must preserve the existing groups array order and row-detail indexes.

#### Phase 1 acceptance criteria

- Uniqueness counts reconcile with the corresponding Group Data Summary for single-column and multi-column selections.
- The singleton-key share uses distinct Group Data Keys as its denominator and is not confused with an Input Row share.
- The UI shows the singleton-key numerator and distinct-key denominator next to the formatted percentage.
- Repeated Identifier Column values do not change uniqueness counts unless that column is explicitly selected.
- The successful Group Data API response includes all five fields under `key_uniqueness`; existing group values, ordering, progress, and row-detail results remain unchanged.
- The interface shows the share with its numerator and denominator and keeps all metrics independent of table filtering, sorting, and preview limits.
- Tests cover all-singleton keys, all-repeated keys, mixed groups, missing keys, and high-cardinality selections.

#### Phase 1 design decision

The backend `compute_group_data` operation owns `GroupDataKeyUniqueness` and accumulates its counts while it reads the existing SQLite GROUP BY results. The job response adds the nested `key_uniqueness` object without changing the existing `groups` array, its order, progress, or row-detail indexes. `GroupDataResults` displays the five metrics outside the table and states the singleton-key share numerator and denominator.

The UI does not calculate the metrics from its table projection because sorting, filtering, and the ten-group preview affect only visible rows. A frontend selector over the complete `groups` array could be exact, but it would put the grouping rule in the presentation layer and traverse every group again. A second SQL query is also unnecessary because `compute_group_data` already reads each grouped count. The API field is an additive cost; the local frontend and backend ship together and the result model gives other consumers one definition.

### Phase 2. User-defined data contracts

#### Contract files

- **PX-CONTRACT-01.** Users must be able to import and export a versioned JSON contract from a local file.
- **PX-CONTRACT-02.** A contract must identify columns by name. PatternX must report missing or ambiguous column matches rather than applying a rule to a different column.
- **PX-CONTRACT-03.** The first contract version must support required columns, allowed values, and explicitly selected basic data types or formats.
- **PX-CONTRACT-04.** PatternX must reject or clearly report unsupported contract versions and rules. It must not ignore them silently or claim full Frictionless Table Schema or CSVW compatibility.
- **PX-CONTRACT-05.** PatternX must not fetch a contract or referenced metadata from a URL. Users must select a local file.

#### Rule results

- **PX-CONTRACT-06.** PatternX must report exact Input Row counts for missing, passing, and failing values for each rule.
- **PX-CONTRACT-07.** Missing status must use the existing Missing Value rules. A missing value must fail a required rule. A missing value must not be treated as a parse failure for a type or allowed-value rule.
- **PX-CONTRACT-08.** For required rules, PatternX must report missing Input Rows as failures and also show their missing count. The report must explain that those two counts overlap.
- **PX-CONTRACT-09.** A non-missing value that cannot be parsed under an explicitly selected type or format must fail that rule. PatternX must preserve the source text.
- **PX-CONTRACT-10.** PatternX must evaluate each rule separately. If one Input Row fails multiple rules, each rule's count may include that row. Any combined failure total must count each Input Row once and must be labeled as a row count.
- **PX-CONTRACT-11.** Contract results must be aggregate by default. PatternX must not display or export failing row values automatically.
- **PX-CONTRACT-12.** Starting a contract analysis must use the existing job progress, cancellation, and cleanup patterns.

#### Phase 2 acceptance criteria

- A user can create, import, and export a supported contract without a network connection.
- A contract that names an unknown or ambiguous column produces a clear error and applies no rule to another column.
- For each rule, missing, pass, and fail counts match deterministic CSV and XLSX fixtures.
- Missing configured markers follow the current Missing Value behavior. Required rules fail on missing values. Type and allowed-value checks do not reinterpret missing values as parse failures.
- Unsupported rules and versions produce clear messages instead of partial, silent validation.
- Cancellation and failure remove temporary row data. A successful job follows the existing temporary retention lifecycle.

### Phase 3. Unified column profile

- **PX-PROFILE-01.** PatternX must provide one overview that combines present and missing counts with distinct Formal Term counts and shares.
- **PX-PROFILE-02.** The overview may show top Formal Terms and repeated Structural Format Patterns. It must link to the existing detailed analysis for each result.
- **PX-PROFILE-03.** The first version must not present an automatically inferred data type as fact.
- **PX-PROFILE-04.** Each metric must identify its denominator and must match the corresponding detailed analysis.
- **PX-PROFILE-05.** PatternX must benchmark high-cardinality columns before making performance claims.

#### Phase 3 acceptance criteria

- Every overview metric reconciles with the existing Completeness and Formal Terms results for the same import and Missing Value rules.
- The interface distinguishes observed statistics from user-defined contract results.
- Long-running profile work reports progress, supports cancellation, and cleans up temporary data.

### Phase 4. User-managed aggregate Profile Snapshots

- **PX-SNAPSHOT-01.** Users must be able to save an aggregate Profile Snapshot to a local file and compare two selected snapshots.
- **PX-SNAPSHOT-02.** The first snapshot version must include its format version and enough settings metadata to determine whether compared metrics use compatible Missing Value rules and definitions.
- **PX-SNAPSHOT-03.** The comparison must report columns added, removed, or reordered and differences in selected aggregate metrics, including Input Row counts, completeness shares, distinct Formal Term counts, and Structural Format Pattern counts.
- **PX-SNAPSHOT-04.** PatternX must match columns by exact name first. It must require user mapping when column names differ.
- **PX-SNAPSHOT-05.** The first snapshot version must not include Input Rows, previews, exact Formal Terms, exact Group Data tuples, or source file paths.
- **PX-SNAPSHOT-06.** PatternX must warn before saving that column names and aggregate statistics can still be sensitive. It must not save snapshots automatically or create an in-app history.
- **PX-SNAPSHOT-07.** PatternX must not describe a difference as an anomaly without a user-defined rule.

#### Phase 4 acceptance criteria

- Users explicitly select both the save location and the snapshots to compare.
- Snapshot comparison reports column and metric changes according to documented matching rules.
- Incompatible snapshot versions or settings produce a clear message. PatternX does not compare incompatible metrics as if they were equivalent.
- Snapshot files contain none of the excluded row-level data or source paths.

### Phase 5. Numeric and date summaries

- **PX-NUM-01.** Users must select the data type and supported number or date format before PatternX computes type-specific statistics.
- **PX-NUM-02.** PatternX must report exact counts of parseable and unparseable non-missing values.
- **PX-NUM-03.** For supported numeric and date columns, PatternX must report minimum, maximum, median, and selected quantiles.
- **PX-NUM-04.** PatternX must preserve source text and document decimal, locale, timezone, and date-format behavior for every supported parser.
- **PX-NUM-05.** Parse failures must remain distinct from Missing Values. PatternX must not infer a type as authoritative or label a distribution as anomalous.

#### Phase 5 acceptance criteria

- Parsing results are deterministic for every documented format and locale.
- Parseable, unparseable, and missing counts reconcile with the Input Row total under the documented rules.
- Summary statistics match reference calculations on deterministic fixtures.
- Performance claims cover measured row counts, column counts, selected columns, file sizes, runtime, and memory.

### Phase 6. Reviewable normalization suggestions

- **PX-NORM-01.** PatternX may suggest groups of Formal Terms that differ by documented case or surrounding-whitespace rules.
- **PX-NORM-02.** Each suggestion must show the original Formal Terms, their counts, and the proposed normalized text before the user accepts or rejects it.
- **PX-NORM-03.** PatternX must not normalize values silently or modify the imported source.
- **PX-NORM-04.** If a user requests normalized output, PatternX must write a separate export and preserve all Input Rows.
- **PX-NORM-05.** PatternX must defer fuzzy matching, automatic correction, and deduplication until separate requirements define their review and false-positive behavior.

#### Phase 6 acceptance criteria

- Users can inspect and reject every proposed grouping before exporting.
- Exported values and headers remain inert text when opened in spreadsheet applications.
- Row count and order remain unchanged unless a future, separately approved requirement states otherwise.

### Phase 7. Cross-file key and reference checks

- **PX-REF-01.** PatternX may support checks between two user-selected local datasets after a separate scope and privacy review.
- **PX-REF-02.** Users must select the two datasets and the columns to compare. PatternX must not infer relationships automatically.
- **PX-REF-03.** Results must report matched and unmatched key counts without combining Input Rows or exporting row values by default.
- **PX-REF-04.** Both datasets and all working files must follow the existing temporary-data cleanup, cancellation, and loopback-only rules.
- **PX-REF-05.** Cross-file checks are not part of the initial contract version.

#### Phase 7 acceptance criteria

- A separate approved requirement defines dataset selection, key comparison, missing-key behavior, and performance targets before implementation begins.
- Tests prove exact matched and unmatched counts and cleanup after success, failure, and cancellation.

## Non-goals

- Cloud upload, SaaS hosting, multi-user accounts, telemetry, or remote APIs.
- Fetching contracts or metadata from URLs.
- Automatic anomaly labels, black-box risk scores, authoritative automatic type inference, or prescriptive recommendations.
- Silent normalization, automatic correction, or deduplication.
- Automatic permanent storage of imported rows, jobs, or Profile Snapshots.

## Cross-phase acceptance criteria

- Exact counts are never silently truncated.
- Existing Input Row, Identifier Column, Missing Value, Formal Term, Structural Format Pattern, and Group Data Key semantics remain unchanged unless a separate approved decision updates [CONTEXT.md](../../CONTEXT.md).
- The application works without network access, and the API remains loopback-only.
- Temporary uploads, normalized files, and SQLite data are removed after success, failure, cancellation, and shutdown according to [ADR-0001](../adr/0001-local-offline-profiler.md) and [ADR-0002](../adr/0002-use-python-sqlite-for-local-analysis.md).
- CSV and XLSX inputs, hostile cell values, exports, and supported Windows and macOS workflows receive coverage.
- New full-data scans and high-cardinality workloads are benchmarked before PatternX makes performance claims.

## Open decisions before later phases

- What exact JSON schema and migration policy will the contract use?
- Which number and date formats, locale rules, and decimal precision will the first contract version support?
- How will PatternX identify a column if an input file has duplicate header names?
- Which snapshot settings must match before PatternX can compare each metric?
- Which normalization operations, beyond case and surrounding whitespace, are safe to suggest?
- Does cross-file reference checking solve a confirmed user need, and which file combinations must it support?

## References

- [PatternX Product Expansion Roadmap](../roadmaps/product-expansion.md)
- [Product expansion research and primary sources](../research/patternx-product-expansion.md)
- [Frictionless Table Schema](https://specs.frictionlessdata.io/table-schema/)
- [W3C Metadata Vocabulary for Tabular Data](https://www.w3.org/TR/tabular-metadata/)
- [Great Expectations data quality use cases](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/schema/)
