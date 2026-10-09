import type { ReactNode } from "react";

interface SharedDatasetContextPanelProps {
  fileName: string | null;
  worksheetName: string;
  hasWorksheets: boolean;
  columnCount: number;
  children: ReactNode;
}

export function SharedDatasetContextPanel({
  fileName,
  worksheetName,
  hasWorksheets,
  columnCount,
  children,
}: SharedDatasetContextPanelProps) {
  let worksheetSummary: string;
  if (fileName === null) {
    worksheetSummary = "Not selected";
  } else if (!hasWorksheets) {
    worksheetSummary = "CSV file";
  } else {
    worksheetSummary = worksheetName || "Choose a worksheet";
  }

  const columnSummary = fileName === null ? "Not available" : `${columnCount} columns`;

  return (
    <section
      aria-labelledby="shared-context-heading"
      className="grid min-w-0 gap-4 rounded-panel border border-border bg-surface p-4 shadow-card sm:p-panel"
    >
      <header className="grid min-w-0 gap-3 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(0,2fr)] sm:items-start">
        <h2 id="shared-context-heading" className="text-base font-semibold tracking-tight text-text">
          Shared data context
        </h2>
        <dl className="grid min-w-0 gap-3 sm:grid-cols-3">
          <div className="grid min-w-0 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Dataset</dt>
            <dd className="m-0 break-words text-sm font-medium text-text">
              {fileName ?? "No dataset loaded"}
            </dd>
          </div>
          <div className="grid min-w-0 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Worksheet</dt>
            <dd className="m-0 break-words text-sm font-medium text-text">{worksheetSummary}</dd>
          </div>
          <div className="grid min-w-0 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Columns</dt>
            <dd className="m-0 break-words text-sm font-medium text-text">{columnSummary}</dd>
          </div>
        </dl>
      </header>
      {children}
    </section>
  );
}
