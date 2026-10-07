import { useEffect, useRef } from "react";
import type { PatternRowsPage } from "./patternRows";
import "./PatternRowsDialog.css";

interface PatternRowsDialogProps {
  patternCount: number;
  page: PatternRowsPage | null;
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

export function PatternRowsDialog({
  patternCount,
  page,
  requestedPage,
  loading,
  error,
  onPageChange,
  onRetry,
  exportLoading,
  exportError,
  exportSuccess = null,
  onExport,
  onClose,
}: PatternRowsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  function handleCloseButtonClicked() {
    dialogRef.current?.close();
  }

  const totalRows = page?.total_rows ?? patternCount;
  const pageSize = page?.page_size ?? 50;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const previousPageAvailable = requestedPage > 1;
  const nextPageAvailable = requestedPage < pageCount;

  return (
    <dialog
      ref={dialogRef}
      className="pattern-rows-dialog"
      aria-labelledby="pattern-rows-dialog-title"
      aria-describedby="pattern-rows-dialog-description"
      onClose={onClose}
    >
      <div className="pattern-rows-dialog-header">
        <div>
          <h2 id="pattern-rows-dialog-title">Input Rows for a Completeness Pattern</h2>
          <p id="pattern-rows-dialog-description" className="status-line">
            {patternCount.toLocaleString()} Input Rows share this pattern.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          aria-label="Close pattern details"
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
            Preparing the full pattern export...
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
          Loading Input Rows for this pattern...
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
          No Input Rows were found for this Completeness Pattern.
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
            aria-label="Input Rows table. Scroll to view additional columns or rows."
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

      <nav className="pattern-rows-pagination" aria-label="Input Rows pages">
        <button
          type="button"
          className="secondary-button"
          disabled={!previousPageAvailable || loading}
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
          disabled={!nextPageAvailable || loading}
          onClick={() => onPageChange(requestedPage + 1)}
        >
          Next page
        </button>
      </nav>
    </dialog>
  );
}
