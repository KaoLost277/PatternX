import { useEffect, useId, useRef } from "react";
import type { DataAnalysisRowsPage } from "./dataAnalysisApi";
import { InputRowsTable } from "./InputRowsTable";
import { RowColumnModeSelector } from "./RowColumnModeSelector";
import { projectVisibleRows } from "./rowColumnMode";
import type { RowColumnMode } from "./rowColumnMode";
import type { RowColumnFilters } from "./rowFilters";
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

interface DataAnalysisRowsDialogProps {
  title: string;
  targetDescription: string;
  matchingRowCount: number;
  analysisColumns: string[];
  columnMode: RowColumnMode;
  onColumnModeChange: (mode: RowColumnMode) => void;
  filters: RowColumnFilters;
  onFiltersChanged: (filters: RowColumnFilters) => void;
  page: DataAnalysisRowsPage | null;
  requestedPage: number;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  exportLoading: boolean;
  exportError: string | null;
  exportSuccess: string | null;
  onExport: (mode: RowColumnMode) => void;
  onClose: () => void;
}

export function DataAnalysisRowsDialog({
  title,
  targetDescription,
  matchingRowCount,
  analysisColumns,
  columnMode,
  onColumnModeChange,
  filters,
  onFiltersChanged,
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
  const filtersActive = Object.keys(filters).length > 0;
  let exportButtonLabel = "Download all matching rows as CSV";
  let exportButtonAriaLabel = "Download all matching Input Rows as CSV";
  if (exportLoading) {
    exportButtonLabel = "Preparing CSV download...";
    exportButtonAriaLabel = "Preparing CSV download";
  } else if (filtersActive) {
    exportButtonLabel = "Download filtered rows as CSV";
    exportButtonAriaLabel = "Download all Input Rows matching the current filters as CSV";
  }
  const visibleRows = projectVisibleRows(
    page?.columns ?? [],
    page?.rows ?? [],
    analysisColumns,
    columnMode,
  );

  return (
    <dialog
      ref={dialogRef}
      className={dialogClasses}
      aria-labelledby={`${dialogId}-title`}
      aria-describedby={`${dialogId}-description`}
      onClose={onClose}
    >
      <div className="flex min-w-0 items-start justify-between gap-5 max-sm:gap-3">
        <div className="grid min-w-0 gap-2">
          <h2 className={dialogHeadingClasses} id={`${dialogId}-title`}>
            {title}
          </h2>
          <p id={`${dialogId}-description`} className={statusTextClasses}>
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
          aria-label={exportButtonAriaLabel}
          disabled={exportLoading}
          onClick={() => onExport(columnMode)}
        >
          {exportButtonLabel}
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

      <RowColumnModeSelector mode={columnMode} onChange={onColumnModeChange} />

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
        <div className="grid justify-items-start gap-3">
          <p className={hintTextClasses} role="status">
            {filtersActive
              ? `No Input Rows match the current filters for ${targetDescription}.`
              : `No Input Rows match ${targetDescription}.`}
          </p>
          {filtersActive ? (
            <button
              type="button"
              className={secondaryButtonClasses}
              onClick={() => onFiltersChanged({})}
            >
              Clear all filters
            </button>
          ) : (
            <button
              type="button"
              className={secondaryButtonClasses}
              onClick={handleCloseButtonClicked}
            >
              Return to summary
            </button>
          )}
        </div>
      )}

      {!loading && error === null && page !== null && page.total_rows > 0 && (
        <div className="grid min-w-0 gap-4">
          <p className={statusTextClasses}>
            Page {page.page} of {pageCount} · {page.total_rows.toLocaleString()}{" "}
            {filtersActive
              ? `of ${matchingRowCount.toLocaleString()} Input Rows match the current filters.`
              : "matching Input Rows."}
            {" "}Source columns and rows are shown in their original order.
          </p>
          <InputRowsTable
            ariaLabel="Matching Input Rows. Scroll to view additional columns or rows."
            columns={visibleRows.columns}
            rows={visibleRows.rows}
            filters={filters}
            onFiltersChanged={onFiltersChanged}
          />
        </div>
      )}

      <nav
        className="flex flex-wrap items-center justify-between gap-3 max-sm:justify-center"
        aria-label="Matching Input Rows pages"
      >
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
