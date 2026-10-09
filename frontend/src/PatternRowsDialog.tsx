import { useEffect, useRef } from "react";
import type { PatternRowsPage } from "./patternRows";
import { InputRowsTable } from "./InputRowsTable";
import {
  dialogClasses,
  dialogHeadingClasses,
  errorMessageClasses,
  hintTextClasses,
  loadingSpinnerClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  statusTextClasses,
} from "./uiClasses";

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
      className={dialogClasses}
      aria-labelledby="pattern-rows-dialog-title"
      aria-describedby="pattern-rows-dialog-description"
      onClose={onClose}
    >
      <div className="flex min-w-0 items-start justify-between gap-5 max-sm:gap-3">
        <div className="grid min-w-0 gap-2">
          <h2 className={dialogHeadingClasses} id="pattern-rows-dialog-title">
            Input Rows for a Completeness Pattern
          </h2>
          <p id="pattern-rows-dialog-description" className={statusTextClasses}>
            {patternCount.toLocaleString()} Input Rows share this pattern.
          </p>
        </div>
        <button
          type="button"
          className={secondaryButtonClasses}
          aria-label="Close pattern details"
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
            Preparing the full pattern export...
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
          Loading Input Rows for this pattern...
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
          No Input Rows were found for this Completeness Pattern.
        </p>
      )}

      {!loading && error === null && page !== null && page.total_rows > 0 && (
        <div className="grid min-w-0 gap-4">
          <p className={statusTextClasses}>
            Page {page.page} of {pageCount} · {page.total_rows.toLocaleString()} matching Input Rows.
            Source columns and rows are shown in their original order.
          </p>
          <InputRowsTable
            ariaLabel="Input Rows table. Scroll to view additional columns or rows."
            columns={page.columns}
            rows={page.rows}
          />
        </div>
      )}

      <nav
        className="flex flex-wrap items-center justify-between gap-3 max-sm:justify-center"
        aria-label="Input Rows pages"
      >
        <button
          type="button"
          className={secondaryButtonClasses}
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
          className={secondaryButtonClasses}
          disabled={!nextPageAvailable || loading}
          onClick={() => onPageChange(requestedPage + 1)}
        >
          Next page
        </button>
      </nav>
    </dialog>
  );
}
