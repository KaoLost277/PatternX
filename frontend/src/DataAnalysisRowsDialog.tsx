import { useEffect, useId, useRef } from "react";
import type { DataAnalysisRowsPage } from "./dataAnalysisApi";

interface DataAnalysisRowsDialogProps {
  title: string;
  targetDescription: string;
  matchingRowCount: number;
  page: DataAnalysisRowsPage | null;
  requestedPage: number;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  exportLoading: boolean;
  exportError: string | null;
  exportSuccess: string | null;
  onExport: () => void;
  onClose: () => void;
}

export function DataAnalysisRowsDialog({
  title,
  targetDescription,
  matchingRowCount,
  page,
  requestedPage,
  loading,
  error,
  onPageChange,
  onRetry,
  exportLoading,
  exportError,
  exportSuccess,
  onExport,
  onClose,
}: DataAnalysisRowsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  function handleCloseButtonClicked() {
    dialogRef.current?.close();
  }

  const totalRows = page?.total_rows ?? matchingRowCount;
  const pageSize = page?.page_size ?? 50;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <dialog
      ref={dialogRef}
      className="pattern-rows-dialog data-rows-dialog"
      aria-labelledby={`${dialogId}-title`}
      aria-describedby={`${dialogId}-description`}
      onClose={onClose}
    >
      <div className="pattern-rows-dialog-header">
        <div>
          <h2 id={`${dialogId}-title`}>{title}</h2>
          <p id={`${dialogId}-description`} className="status-line">
            {matchingRowCount.toLocaleString()} Input Rows match {targetDescription}.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          aria-label="Close data analysis details"
          onClick={handleCloseButtonClicked}
        >
          Close
        </button>
      </div>

      <div className="pattern-rows-export">
        <button
          type="button"
          className="primary-button"
          aria-label="Download all matching Input Rows as CSV"
          disabled={exportLoading}
          onClick={onExport}
        >
          {exportLoading ? "Preparing CSV download..." : "Download all matching rows as CSV"}
        </button>
        {exportLoading && (
          <p className="status-line" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            Preparing the full row export...
          </p>
        )}
        {exportError !== null && (
          <p className="error-message pattern-rows-export-error" role="alert">
            {exportError}
          </p>
        )}
        {exportSuccess !== null && (
          <p className="status-line" role="status">
            {exportSuccess}
          </p>
        )}
      </div>

      {loading && (
        <p className="status-line" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          Loading matching Input Rows...
        </p>
      )}

      {error !== null && (
        <div className="error-message pattern-rows-error" role="alert">
          <p>{error}</p>
          <button type="button" className="secondary-button" onClick={onRetry}>
            Retry loading rows
          </button>
        </div>
      )}

      {!loading && error === null && page !== null && page.total_rows === 0 && (
        <p className="hint-text" role="status">
          No Input Rows match {targetDescription}.
        </p>
      )}

      {!loading && error === null && page !== null && page.total_rows > 0 && (
        <div className="preview-panel">
          <p className="status-line">
            Page {page.page} of {pageCount} · {page.total_rows.toLocaleString()} matching Input Rows.
            Source columns and rows are shown in their original order.
          </p>
          <div
            className="summary-table-frame preview-table-frame"
            role="region"
            aria-label="Matching Input Rows. Scroll to view additional columns or rows."
            tabIndex={0}
          >
            <table className="summary-table preview-table pattern-rows-table">
              <thead>
                <tr>
                  {page.columns.map((columnName, columnIndex) => (
                    <th key={columnIndex} scope="col">
                      {columnName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {page.columns.map((_, columnIndex) => (
                      <td key={columnIndex}>
                        <span className="preview-value">{row[columnIndex] ?? "Not set"}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <nav className="pattern-rows-pagination" aria-label="Matching Input Rows pages">
        <button
          type="button"
          className="secondary-button"
          disabled={requestedPage <= 1 || loading}
          onClick={() => onPageChange(requestedPage - 1)}
        >
          Previous page
        </button>
        <span aria-live="polite">
          Page {requestedPage} of {pageCount}
        </span>
        <button
          type="button"
          className="secondary-button"
          disabled={requestedPage >= pageCount || loading}
          onClick={() => onPageChange(requestedPage + 1)}
        >
          Next page
        </button>
      </nav>
    </dialog>
  );
}
