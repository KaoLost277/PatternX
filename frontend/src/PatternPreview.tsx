import { patternStatusPresentation } from "./patternStatus";
import type { PatternStatus } from "./patternStatus";

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
}

export function PatternPreview({ patternSummary, pattern }: PatternPreviewProps) {
  if (pattern.preview_rows.length === 0) {
    return (
      <p className="hint-text">
        No sample rows were kept for this pattern. Its exact count above is unaffected.
      </p>
    );
  }

  const identifierColumnLabel =
    patternSummary.identifier_column !== null ? patternSummary.identifier_column : "Input Row";

  return (
    <div className="preview-panel">
      <p className="filter-heading">
        {pattern.preview_rows.length} sample Input Rows of this pattern, out of its{" "}
        {pattern.count.toLocaleString()}. Long values are shortened. Every value is shown as plain
        text.
      </p>
      <div className="summary-table-frame">
        <table className="summary-table">
          <thead>
            <tr>
              <th scope="col">{identifierColumnLabel}</th>
              {patternSummary.analysis_columns.map((columnName, columnIndex) => (
                <th key={columnIndex} scope="col">
                  {columnName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pattern.preview_rows.map((previewRow, previewRowIndex) => (
              <tr key={previewRowIndex}>
                <th scope="row">{previewRow.identifier_value ?? "Not set"}</th>
                {previewRow.values.map((cellValue, valueIndex) => (
                  <td key={valueIndex}>
                    <div className="preview-cell">
                      <PatternStatusLabel status={pattern.statuses[valueIndex]} />
                      {cellValue !== null && <span className="preview-value">{cellValue}</span>}
                    </div>
                  </td>
                ))}
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
