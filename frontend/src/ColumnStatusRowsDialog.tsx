import { useEffect, useId, useRef, useState } from "react";
import type { ColumnStatusRowsPage } from "./columnStatusRows";
import {
  ColumnStatusRowsRequestError,
  downloadColumnStatusRowsCsv,
  fetchColumnStatusRowsPage,
} from "./columnStatusRows";
import { InputRowsTable } from "./InputRowsTable";
import type { ColumnStatus } from "./columnStatusRows";
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

interface ColumnStatusRowsDialogProps {
  jobId: string;
  columnIndex: number;
  columnName: string;
  status: ColumnStatus;
  matchingRowCount: number;
  onClose: () => void;
}

interface ColumnStatusRowsDialogViewProps {
  columnName: string;
  status: ColumnStatus;
  matchingRowCount: number;
  page: ColumnStatusRowsPage | null;
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

const COLUMN_STATUS_COPY: Record<ColumnStatus, { heading: string; countDescription: string }> = {
  present: {
    heading: "has a value",
    countDescription: "have a value in",
  },
  missing: {
    heading: "is missing a value",
    countDescription: "have a Missing Value in",
  },
};

export function ColumnStatusRowsDialogView({
  columnName,
  status,
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
}: ColumnStatusRowsDialogViewProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const pageCount = Math.max(1, Math.ceil((page?.total_rows ?? matchingRowCount) / (page?.page_size ?? 50)));
  const statusCopy = COLUMN_STATUS_COPY[status];
  const description =
    `${matchingRowCount.toLocaleString()} Input Rows ` +
    `${statusCopy.countDescription} ${columnName}.`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  function handleCloseButtonClicked() {
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      className={dialogClasses}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      onClose={onClose}
    >
      <div className="flex min-w-0 items-start justify-between gap-5 max-sm:gap-3">
        <div className="grid min-w-0 gap-2">
          <h2
            className={`${dialogHeadingClasses} break-words [overflow-wrap:anywhere]`}
            id={headingId}
          >
            Input Rows where {columnName} {statusCopy.heading}
          </h2>
          <p id={descriptionId} className={statusTextClasses}>
            {description}
          </p>
        </div>
        <button
          type="button"
          className={secondaryButtonClasses}
          aria-label="Close column status details"
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
            Preparing the matching Input Rows export...
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
        <div className="grid justify-items-start gap-3">
          <p className={hintTextClasses} role="status">
            No Input Rows were found for this column status.
          </p>
        </div>
      )}

      {!loading && error === null && page !== null && page.total_rows > 0 && (
        <div className="grid min-w-0 gap-4">
          <p className={statusTextClasses}>
            Page {page.page} of {pageCount} · {page.total_rows.toLocaleString()} matching Input Rows.{" "}
            Source columns and rows are shown in their original order.
          </p>
          <InputRowsTable
            ariaLabel="Input Rows table. Scroll to view additional columns or rows."
            columns={page.columns}
            rows={page.rows}
            filters={{}}
            onFiltersChanged={() => {}}
            enableFilters={false}
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

export function ColumnStatusRowsDialog({
  jobId,
  columnIndex,
  columnName,
  status,
  matchingRowCount,
  onClose,
}: ColumnStatusRowsDialogProps) {
  const [requestedPage, setRequestedPage] = useState(1);
  const [page, setPage] = useState<ColumnStatusRowsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNumber, setRetryNumber] = useState(0);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetchColumnStatusRowsPage(
      jobId,
      columnIndex,
      status,
      requestedPage,
      controller.signal,
    )
      .then((rowsPage) => {
        if (!controller.signal.aborted) {
          setPage(rowsPage);
        }
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          requestError instanceof ColumnStatusRowsRequestError
            ? requestError.message
            : "The local API could not retrieve these Input Rows. Check that it is running and retry.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [jobId, columnIndex, status, requestedPage, retryNumber]);

  async function handleExport() {
    setExportLoading(true);
    setExportError(null);
    setExportSuccess(null);
    try {
      await downloadColumnStatusRowsCsv(jobId, columnIndex, status);
      setExportSuccess("CSV download started.");
    } catch (exportRequestError: unknown) {
      setExportError(
        exportRequestError instanceof ColumnStatusRowsRequestError
          ? exportRequestError.message
          : "The CSV could not be downloaded. Check the local API and retry.",
      );
    } finally {
      setExportLoading(false);
    }
  }

  function handlePageChanged(nextPage: number) {
    setRequestedPage(nextPage);
    setPage(null);
    setLoading(true);
    setError(null);
  }

  function handleRetry() {
    setRetryNumber((previousRetryNumber) => previousRetryNumber + 1);
    setPage(null);
    setLoading(true);
    setError(null);
  }

  return (
    <ColumnStatusRowsDialogView
      columnName={columnName}
      status={status}
      matchingRowCount={matchingRowCount}
      page={page}
      requestedPage={requestedPage}
      loading={loading}
      error={error}
      onPageChange={handlePageChanged}
      onRetry={handleRetry}
      exportLoading={exportLoading}
      exportError={exportError}
      exportSuccess={exportSuccess}
      onExport={() => void handleExport()}
      onClose={onClose}
    />
  );
}
