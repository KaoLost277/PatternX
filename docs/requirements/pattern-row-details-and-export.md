# Pattern-Matching Input Row Details and Export

**Status:** Implemented and verified.

**Spec:** [GitHub issue #12](https://github.com/KaoLost277/PatternX/issues/12).

**Implementation tickets:** [#13](https://github.com/KaoLost277/PatternX/issues/13), [#14](https://github.com/KaoLost277/PatternX/issues/14).

## Summary

When a user opens the row details for a Completeness Pattern, the application must make every Input Row assigned to that pattern available for inspection and CSV export. The current preview is limited to a small sample and is not sufficient for this use case.

## User story

As a user reviewing a Completeness Pattern, I want to inspect all of its matching Input Rows and export them, so that I can review the underlying source data rather than only a sample or aggregate summary.

## Functional requirements

### Selecting and viewing rows

1. Activating the row action for a Completeness Pattern opens the existing details dialog, adapted to display the complete matching-row table.
2. The table contains every Input Row whose present/missing statuses match the selected Completeness Pattern, using the same analysis columns and missing-value rules as the completed analysis.
3. The table includes every source column from the worksheet analyzed for the selected job. For a CSV import, this means every column in that CSV.
4. Input Rows appear in their original worksheet or CSV order. Rows are not combined when their Identifier Column values repeat; each Input Row remains a separate row.
5. The table is paginated, with 50 rows per page by default. Users can navigate through all matching rows, and the interface communicates the total matching-row count.
6. The table must remain usable when a pattern contains many rows or the source contains many columns; users must not need to render all matching rows at once to reach them.

### CSV export

1. The details dialog provides an action to download the rows for its selected Completeness Pattern as CSV.
2. The CSV contains every matching Input Row, not only the rows on the currently visible page.
3. The CSV includes all columns from the analyzed worksheet, in source column order, and rows in source row order.
4. CSV values must be written as correctly quoted fields. Values that spreadsheet applications could interpret as formulas must be protected as inert text.
5. The existing aggregate summary exports remain available and retain their current meaning; this is an additional row-level export.

## Data availability and lifecycle

1. Row details and their CSV export are available for the latest analysis job while its results remain available in the running backend.
2. To support post-analysis paging and export, the application may retain a local, temporary copy of the analyzed rows for the latest job after analysis completes.
3. The original upload and intermediary source copies are not retained longer than needed to complete analysis. No row-level data is stored permanently or sent to a remote service.
4. The retained temporary row data is deleted when a newer analysis replaces the job and when the backend shuts down. Temporary data left by an unclean shutdown is removed on the next backend start.
5. Failed or cancelled jobs do not leave row-level temporary data available for details or export.

## User feedback

1. While a page of details is being retrieved, the dialog communicates that it is loading.
2. If details or export cannot be retrieved, the dialog presents a clear, human-readable error rather than an empty or misleading table.
3. An empty result state must explain that no matching rows are available, rather than presenting it as a loading or failure state.

## Acceptance criteria

- For a selected pattern with more than five matching rows, the user can navigate through and inspect every matching row.
- The details table shows all source columns from the analyzed worksheet and preserves the source row order.
- Repeated Identifier Column values do not cause rows to be merged or omitted.
- The displayed total matches the selected pattern's exact count in the Completeness Summary.
- Downloading the CSV while viewing any page produces all matching rows and all source columns, in source order.
- Changing the selected pattern changes both the detail rows and the rows included in its export.
- Starting a new analysis or shutting down the backend removes the prior job's retained row-level data; restarting the backend cleans up data left by an unclean shutdown.
- CSV fields remain correctly quoted, and spreadsheet-formula-like source values are protected as inert text.

## Explicitly out of scope

- Showing or exporting rows from every pattern at once.
- Combining data from multiple workbook worksheets; analysis and details are limited to the one worksheet selected for the job.
- Permanent storage of imported rows or access to a previous job after it has been replaced or the backend has shut down.
- Adding row sorting, filtering, or a non-CSV row-level export format.

## Documentation follow-up

The local/offline profiler ADR currently says only summary CSVs are offered, while the SQLite ADR says the temporary database is deleted after every outcome. Before implementation is complete, update both decisions to document the temporary post-analysis row-data lifecycle and the additional row-level CSV export.
