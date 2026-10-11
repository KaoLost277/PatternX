# Data Visualization Requirements

**Status:** Spec published; not implemented.

**Spec:** [GitHub issue #35](https://github.com/KaoLost277/PatternX/issues/35).

**Related documents:** [Domain context](../../CONTEXT.md), [product expansion roadmap](../roadmaps/product-expansion.md), and [row detail and export requirements](pattern-row-details-and-export.md).

## Purpose

Add charts that help users quickly understand the results of analyzing one local tabular dataset. Charts supplement the existing exact summaries and tables; they do not replace them, make quality judgments, or modify source data.

## Product boundaries

- PatternX remains a local, offline, single-user application with a loopback-only API. Imported data and chart data must not be sent to remote services.
- Each `Input Row` continues to be counted independently. Repeated `Identifier Column` values do not merge rows.
- Charts use the same analysis results and `Missing Value` rules as their corresponding tables. They must not infer that an observed pattern or value is anomalous.
- Charts do not modify the imported file. Access to matching rows and row-level exports remain explicit user actions.
- Charts are descriptive visualizations, not automatic data-quality scores or recommendations.

## Phase 1 — Charts for existing analyses

### Scope and placement

- **PX-VIS-01.** The first release must visualize results from the existing Completeness, Completeness Patterns, Formal Terms, and Group Data analyses. Numeric and date distribution charts are deferred to Phase 2.
- **PX-VIS-02.** Phase 1 must analyze and display charts for one currently imported dataset at a time. Comparing different files is out of scope.
- **PX-VIS-03.** Each chart must appear in its corresponding existing analysis mode, above the related table, and be visible by default when results are available.
- **PX-VIS-04.** Charts are viewed in the application. Exporting a chart as an image or report is out of scope for Phase 1.
- **PX-VIS-05.** A chart is a visual summary only. The corresponding table must continue to provide access to the complete exact results, including categories not drawn in a Top 10 chart.
- **PX-VIS-06.** Chart metrics must be computed from the complete analysis result and must not change when a user sorts or filters a table.

### Column completeness

- **PX-VIS-07.** The Column Completeness chart must include every column in the analyzed dataset, not only columns selected for another analysis.
- **PX-VIS-08.** The chart must use horizontal stacked bars, with separate segments for present and missing `Input Rows` in each column.
- **PX-VIS-09.** The chart must communicate both exact counts and percentages. Both percentages use all `Input Rows` as their denominator.
- **PX-VIS-10.** Columns must be ordered by missing share, highest first, by default. Users must be able to change the ordering.
- **PX-VIS-11.** When the dataset has many columns, users must be able to scroll within the chart area to reach every column; columns must not be silently omitted.

### Completeness Patterns, Formal Terms, and Group Data

- **PX-VIS-12.** Completeness Patterns must show a horizontal bar chart of the ten most frequent observed Completeness Patterns, ordered by `Input Row` count, highest first.
- **PX-VIS-13.** Formal Terms must show a separate horizontal bar chart for each selected column. Each chart shows that column's ten most frequent Formal Terms, ordered by occurrence count, highest first.
- **PX-VIS-14.** Group Data must show a horizontal bar chart of the ten most frequent observed Group Data Keys, ordered by `Input Row` count, highest first.
- **PX-VIS-15.** These frequency charts must show counts and percentages. Completeness Pattern and Group Data percentages use all `Input Rows` as their denominator. Formal Term percentages use the count of non-missing `Input Rows` in that Formal Term's column.
- **PX-VIS-16.** Frequency charts must not combine the remaining categories into an “Other” bar. They must make clear that only the Top 10 are drawn, while the corresponding table retains the complete result.
- **PX-VIS-17.** Long category labels may be shortened on the chart, but the full value must remain available through an accessible tooltip, selection, or the corresponding detail view. User-provided values must be rendered as plain text, not interpreted as markup.

### Interaction and row details

- **PX-VIS-18.** Selecting a chart bar must open the existing paginated row-details experience for the matching Completeness Pattern, Formal Term, or Group Data Key.
- **PX-VIS-19.** Selecting the missing or present segment of a Column Completeness bar must open the `Input Rows` that match that column's selected status, using the same `Missing Value` semantics as the analysis.
- Column-status row details must use paginated access backed by the existing private, temporary SQLite lifecycle. They must not create permanent row-data retention and must follow current cleanup rules.
- **PX-VIS-20.** Opening chart-related row details must not automatically download or export rows. Any row-level CSV export remains an explicit action in the detail view and follows the existing row-detail requirements.

### Usability and feedback

- **PX-VIS-21.** Charts must not use color as the sole way to distinguish present and missing values or other categories. Labels, counts, and accessible text alternatives must communicate the same information.
- **PX-VIS-22.** Charts must account for loading, empty, and error states. Empty or unavailable chart data must not be presented as a zero-valued result or as a successful chart.
- **PX-VIS-23.** Chart labels and controls must remain usable on narrow viewports and with long column names or data values.

### Phase 1 acceptance criteria

- Column Completeness chart counts and percentages reconcile exactly with the Column Completeness Summary for every column.
- Completeness Pattern, Formal Term, and Group Data chart values reconcile with their corresponding complete analysis results and use the specified percentage denominators.
- Frequency charts show no more than ten categories and do not imply that the displayed categories are the complete result; users can reach all categories in the corresponding table.
- Changing table sorting or filters does not change chart metrics.
- Selecting a chart category opens matching rows; selected column-completeness statuses use the current configured `Missing Value` rules.
- Repeated `Identifier Column` values do not alter counts unless that column is explicitly part of the analysis.
- Charts work without a network connection, preserve safe plain-text rendering for hostile cell values, and do not add automatic source-data retention or export behavior.
- Loading, empty, error, keyboard, and narrow-viewport behavior is covered by verification.

## Phase 2 — Explicit numeric and date distributions

Phase 2 is a later proposal. It must not delay Phase 1 or infer types automatically.

- **PX-VIS-NUM-01.** Before plotting a numeric or date distribution, the user must select the column, data type, and supported number or date format.
- **PX-VIS-NUM-02.** Numeric distributions must use a histogram with an automatically selected initial bin count that the user can adjust.
- **PX-VIS-NUM-03.** Date distributions must count values by a selectable calendar interval, including day, week, or month.
- **PX-VIS-NUM-04.** The distribution chart must show counts and percentages of values successfully parsed and plotted. Missing values and parse failures must be counted and shown separately; they must not be merged or silently dropped from the report.
- **PX-VIS-NUM-05.** Numeric/date summaries must also show the minimum, median, and maximum of successfully parsed values.
- **PX-VIS-NUM-06.** Source text must remain unchanged. Parse behavior, locale, date-format, and numeric-format rules must be documented and tested before implementation.
- **PX-VIS-NUM-07.** A distribution must not be labeled anomalous solely because a value is rare or lies at an extreme.

## Out of scope

- Comparing charts across multiple imported files.
- Exporting chart images or generated reports in Phase 1.
- Automatic type inference presented as authoritative.
- Automatic anomaly labels, risk scores, data correction, normalization, or deduplication.
- Sending source data or chart metadata to a remote service.

## Deferred implementation decisions

- The exact histogram binning algorithm and initial bin-count rule for Phase 2.
- The default date interval selection for Phase 2.
- Representative performance limits for very wide datasets and high-cardinality Formal Terms or Group Data results. No workload guarantee should be added until measured.
