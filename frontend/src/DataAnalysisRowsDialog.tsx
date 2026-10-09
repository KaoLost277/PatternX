import { useEffect, useId, useRef } from "react";
import type { DataAnalysisRowsPage } from "./dataAnalysisApi";
import {
  dialogClasses,
  errorMessageClasses,
  hintTextClasses,
  loadingSpinnerClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  separatedSummaryTableClasses,
  statusTextClasses,
  summaryTableFrameClasses,
} from "./uiClasses";

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
      className={dialogClasses}
      aria-labelledby={`${dialogId}-title`}
      aria-describedby={`${dialogId}-description`}
      onClose={onClose}
    >
      <div className="flex min-w-0 items-start justify-between gap-5 max-sm:gap-3">
        <div>
          <h2 id={`${dialogId}-title`}>{title}</h2>
          <p id={`${dialogId}-description`} className={`${statusTextClasses} mt-2`}>
            {matchingRowCount.toLocaleString()} Input Rows match {targetDescription}.
          </p>
        </div>
        <button
          type="button"
          className={secondaryButtonClasses}
          aria-label="Close data analysis details"
          onClick={handleCloseButtonClicked}
        >
          Close
        </button>
      </div>

      <div className="grid min-w-0 justify-items-start gap-4">
        <button
          type="button"
          className={primaryButtonClasses}
          aria-label="Download all matching Input Rows as CSV"
          disabled={exportLoading}
          onClick={onExport}
        >
          {exportLoading ? "Preparing CSV download..." : "Download all matching rows as CSV"}
        </button>
        {exportLoading && (
          <p className={statusTextClasses} role="status">
            <span className={loadingSpinnerClasses} aria-hidden="true" />
            Preparing the full row export...
          </p>
        )}
        {exportError !== null && (
          <p className={errorMessageClasses} role="alert">
            {exportError}
          </p>
        )}
        {exportSuccess !== null && (
          <p className={statusTextClasses} role="status">
            {exportSuccess}
          </p>
        )}
      </div>

      {loading && (
        <p className={statusTextClasses} role="status">
          <span className={loadingSpinnerClasses} aria-hidden="true" />
          Loading matching Input Rows...
        </p>
      )}

      {error !== null && (
        <div className={`${errorMessageClasses} grid justify-items-start gap-3`} role="alert">
          <p>{error}</p>
          <button type="button" className={secondaryButtonClasses} onClick={onRetry}>
            Retry loading rows
          </button>
        </div>
      )}

      {!loading && error === null && page !== null && page.total_rows === 0 && (
        <p className={hintTextClasses} role="status">
          No Input Rows match {targetDescription}.
        </p>
      )}

      {!loading && error === null && page !== null && page.total_rows > 0 && (
        <div className="grid min-w-0 gap-4">
          <p className={statusTextClasses}>
            Page {page.page} of {pageCount} · {page.total_rows.toLocaleString()} matching Input Rows.
            Source columns and rows are shown in their original order.
          </p>
          <div
            className={`${summaryTableFrameClasses} max-h-[min(56vh,35rem)] overflow-auto overscroll-contain`}
            role="region"
            aria-label="Matching Input Rows. Scroll to view additional columns or rows."
            tabIndex={0}
          >
            <table className={`${separatedSummaryTableClasses} min-w-max`}>
              <thead>
                <tr>
                  {page.columns.map((columnName, columnIndex) => (
                    <th className="sticky top-0 z-10 min-w-32 bg-surface-muted" key={columnIndex} scope="col">
                      {columnName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {page.columns.map((_, columnIndex) => (
                      <td className="min-w-32" key={columnIndex}>
                        <span className="break-words">{row[columnIndex] ?? "Not set"}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <nav className="flex flex-wrap items-center justify-between gap-3 max-sm:justify-center" aria-label="Matching Input Rows pages">
        <button
          type="button"
          className={secondaryButtonClasses}
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
          className={secondaryButtonClasses}
          disabled={requestedPage >= pageCount || loading}
          onClick={() => onPageChange(requestedPage + 1)}
        >
          Next page
        </button>
      </nav>
    </dialog>
  );
}
