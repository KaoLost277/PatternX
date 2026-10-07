import { useState } from "react";
import { SortableHeader } from "./SortableHeader";
import { compareNullableText, cycleSort, sortRows } from "./tableSorting";
import type { SortState } from "./tableSorting";
import { patternStatusPresentation } from "./patternStatus";
import type { PatternStatus } from "./patternStatus";

type PreviewSortKey = "identifier" | `value:${number}`;

interface PreviewRow {
  identifier_value: string | null;
  values: (string | null)[];
}

export interface CompletenessPattern {
  statuses: PatternStatus[];
  count: number;
  share: number;
  preview_rows: PreviewRow[];
}

export interface PatternSummary {
  input_rows: number;
  identifier_column: string | null;
  analysis_columns: string[];
  patterns: CompletenessPattern[];
}

interface PatternPreviewProps {
  patternSummary: PatternSummary;
  pattern: CompletenessPattern;
  visibleAnalysisColumns: string[];
}

export function PatternPreview({
  patternSummary,
  pattern,
  visibleAnalysisColumns,
}: PatternPreviewProps) {
  const [previewSort, setPreviewSort] = useState<SortState<PreviewSortKey> | null>(null);
  const previewSortColumnIndex = previewSort?.key.startsWith("value:")
    ? Number(previewSort.key.slice("value:".length))
    : null;
  const previewSortColumnName =
    previewSortColumnIndex === null
      ? null
      : patternSummary.analysis_columns[previewSortColumnIndex];
  const activePreviewSort =
    previewSortColumnName !== null && !visibleAnalysisColumns.includes(previewSortColumnName)
      ? null
      : previewSort;

  const displayedPreviewRows = sortRows(
    pattern.preview_rows,
    activePreviewSort,
    (sortKey, left, right) => {
      if (sortKey === "identifier") {
        return compareNullableText(left.identifier_value, right.identifier_value);
      }

      const columnIndex = Number(sortKey.slice("value:".length));
      return compareNullableText(
        left.values[columnIndex] ?? null,
        right.values[columnIndex] ?? null,
      );
    },
  );

  function handlePreviewSortChanged(sortKey: PreviewSortKey) {
    setPreviewSort((currentSort) => cycleSort(currentSort, sortKey));
  }

  if (pattern.preview_rows.length === 0) {
    return (
      <p className="hint-text">
        No sample rows were kept for this pattern. Its exact count above is unaffected.
      </p>
    );
  }

  const identifierColumnLabel = patternSummary.identifier_column ?? "Input Row";
  const visibleAnalysisColumnSet = new Set(visibleAnalysisColumns);
  const visibleColumns = patternSummary.analysis_columns
    .map((columnName, columnIndex) => ({ columnName, columnIndex }))
    .filter(({ columnName }) => visibleAnalysisColumnSet.has(columnName));

  return (
    <div className="preview-panel">
      <p className="filter-heading">
        {pattern.preview_rows.length} sample Input Rows. Values are plain text. Select a column
        header to sort; long values are shortened.
      </p>
      {visibleColumns.length === 0 && (
        <p className="hint-text">
          No analyzed columns are currently shown. Select columns above to display them.
        </p>
      )}
      <div
        className="summary-table-frame preview-table-frame"
        role="region"
        aria-label="Sample rows table. Scroll to view additional columns or rows."
        tabIndex={0}
      >
        <table
          className="summary-table preview-table"
          aria-label="Sample rows for the selected Completeness Pattern"
        >
          <thead>
            <tr>
              <SortableHeader
                className="preview-identifier-header"
                label={identifierColumnLabel}
                sortKey="identifier"
                sortState={activePreviewSort}
                onSort={handlePreviewSortChanged}
              />
              {visibleColumns.map(({ columnName, columnIndex }) => (
                <SortableHeader
                  key={columnIndex}
                  label={columnName}
                  sortKey={`value:${columnIndex}`}
                  sortState={activePreviewSort}
                  onSort={handlePreviewSortChanged}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedPreviewRows.map((previewRow, previewRowIndex) => (
              <tr key={previewRowIndex}>
                <th className="preview-identifier-cell" scope="row">
                  {previewRow.identifier_value ?? "Not set"}
                </th>
                {visibleColumns.map(({ columnIndex }) => {
                  const cellValue = previewRow.values[columnIndex] ?? null;

                  return (
                    <td key={columnIndex}>
                      <div className="preview-cell">
                        <PatternStatusLabel status={pattern.statuses[columnIndex]} />
                        {cellValue !== null && <span className="preview-value">{cellValue}</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PatternStatusLabel({ status }: { status: PatternStatus }) {
  const statusPresentation = patternStatusPresentation(status);

  return <span className={statusPresentation.className}>{statusPresentation.label}</span>;
}
