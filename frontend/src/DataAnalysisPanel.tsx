import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  DataAnalysisRequestError,
  downloadDataAnalysisRowsCsv,
  fetchDataAnalysisJobStatus,
  fetchDataAnalysisRowsPage,
  startDataAnalysisJob,
} from "./dataAnalysisApi";
import type {
  DataAnalysisDetailTarget,
  DataAnalysisJobStatus,
  DataAnalysisKind,
  DataAnalysisRowsPage,
  DataFormatPattern,
  DataGroup,
  FormalColumnTerms,
  FormalTermsSummary,
  GroupDataSummary,
} from "./dataAnalysisApi";
import { DataAnalysisRowsDialog } from "./DataAnalysisRowsDialog";
import type { RowColumnMode } from "./rowColumnMode";
import { CollapsibleSection } from "./CollapsibleSection";
import { formatShare } from "./displayFormat";
import {
  analysisOptionClasses,
  dataAnalysisActionCellClasses,
  dataAnalysisActionHeaderClasses,
  errorMessageClasses,
  hintTextClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  statusTextClasses,
  summaryTableClasses,
  summaryTableFrameClasses,
} from "./uiClasses";

interface DataAnalysisPanelProps {
  analysisKind: DataAnalysisKind;
  selectedFile: File;
  worksheetName: string;
  columnNames: string[];
  missingValueMarkers: Record<string, string[]>;
  hidden: boolean;
  onJobStatusChanged: (status: DataAnalysisJobStatus | null) => void;
  onAnalysisStartingChanged: (analysisKind: DataAnalysisKind, starting: boolean) => void;
  onError: (message: string | null) => void;
}

interface SelectedDetail {
  target: DataAnalysisDetailTarget;
  title: string;
  description: string;
  count: number;
}

const JOB_STATE_RUNNING = "running";
const JOB_STATE_SUCCEEDED = "succeeded";
const TERMS_SHOWN_BY_DEFAULT = 10;
const GROUPS_SHOWN_BY_DEFAULT = 10;
const JOB_POLL_INTERVAL_MILLISECONDS = 500;

function titleForAnalysis(analysisKind: DataAnalysisKind): string {
  return analysisKind === "formal_terms" ? "Formal Terms" : "Group Data";
}

function isFormalTermsSummary(
  result: FormalTermsSummary | GroupDataSummary,
): result is FormalTermsSummary {
  return result.kind === "formal_terms";
}

function formatTerm(value: string | null): string {
  return value === null ? "(blank)" : value;
}

function detailTargetForTerm(
  columnIndex: number,
  termIndex: number,
  termValue: string | null,
  count: number,
): SelectedDetail {
  return {
    target: { kind: "term", columnIndex, itemIndex: termIndex },
    title: "Input Rows for a Formal Term",
    description: `the term ${JSON.stringify(formatTerm(termValue))}`,
    count,
  };
}

function groupDescription(columns: string[], group: DataGroup): string {
  const groupValues = columns.map((columnName, columnIndex) => {
    return `${columnName}=${formatTerm(group.values[columnIndex] ?? null)}`;
  });
  return groupValues.join(", ");
}

export function DataAnalysisPanel({
  analysisKind,
  selectedFile,
  worksheetName,
  columnNames,
  missingValueMarkers,
  hidden,
  onJobStatusChanged,
  onAnalysisStartingChanged,
  onError,
}: DataAnalysisPanelProps) {
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [job, setJob] = useState<DataAnalysisJobStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<SelectedDetail | null>(null);
  const [detailColumnMode, setDetailColumnMode] = useState<RowColumnMode>("all");
  const [detailPage, setDetailPage] = useState<DataAnalysisRowsPage | null>(null);
  const [detailPageNumber, setDetailPageNumber] = useState(1);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRetryNumber, setDetailRetryNumber] = useState(0);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [showAllTerms, setShowAllTerms] = useState<Record<string, boolean>>({});
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [setupExpanded, setSetupExpanded] = useState(true);
  const [resultsExpanded, setResultsExpanded] = useState(true);
  const columnSelectionRef = useRef<HTMLFieldSetElement>(null);
  const analysisRunning = job?.state === JOB_STATE_RUNNING;
  const runningJobId = job?.state === JOB_STATE_RUNNING ? job.job_id : null;
  const requestStarting = statusMessage === "Starting the analysis...";
  const analysisBusy = analysisRunning || requestStarting;

  const applyJobStatus = useCallback((nextJob: DataAnalysisJobStatus) => {
    setJob(nextJob);
    onJobStatusChanged(nextJob);
    if (nextJob.state === JOB_STATE_SUCCEEDED) {
      setErrorMessage(null);
      onError(null);
      setStatusMessage(null);
    } else if (nextJob.state === "failed") {
      const message = nextJob.error ?? "The analysis failed.";
      setErrorMessage(message);
      onError(message);
      setStatusMessage(null);
    } else if (nextJob.state === "cancelled") {
      setErrorMessage(null);
      onError(null);
        setStatusMessage("The analysis was cancelled. No summary was kept.");
    } else {
      setErrorMessage(null);
      onError(null);
      setStatusMessage(null);
    }
  }, [onError, onJobStatusChanged]);

  useEffect(() => {
    if (runningJobId === null) {
      return;
    }

    const pollTimer = window.setInterval(async () => {
      try {
        const nextJob = await fetchDataAnalysisJobStatus(runningJobId);
        applyJobStatus(nextJob);
      } catch (error: unknown) {
        const message =
          error instanceof DataAnalysisRequestError
            ? error.message
            : "The local API could not read the analysis status. Try again.";
        setErrorMessage(message);
        onError(message);
        setStatusMessage(null);
      }
    }, JOB_POLL_INTERVAL_MILLISECONDS);

    return () => window.clearInterval(pollTimer);
  }, [applyJobStatus, onError, runningJobId]);

  useEffect(() => {
    if (detail === null || job?.state !== JOB_STATE_SUCCEEDED) {
      return;
    }

    const controller = new AbortController();
    const jobId = job.job_id;
    const detailTarget = detail.target;

    void fetchDataAnalysisRowsPage(
      jobId,
      detailTarget,
      detailPageNumber,
      controller.signal,
    )
      .then((page) => {
        if (!controller.signal.aborted) {
          setDetailPage(page);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof DataAnalysisRequestError
            ? error.message
            : "The matching rows could not be retrieved. Check the local API and retry.";
        setDetailError(message);
        onError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [job, detail, detailPageNumber, detailRetryNumber, onError]);

  function resetCurrentResult() {
    setJob(null);
    onJobStatusChanged(null);
    setErrorMessage(null);
    onError(null);
    setStatusMessage(null);
    setDetail(null);
    setDetailPage(null);
    setShowAllTerms({});
    setShowAllGroups(false);
  }

  function focusColumnSelection() {
    setSetupExpanded(true);
    window.setTimeout(() => {
      const columnSelection = columnSelectionRef.current;
      if (columnSelection === null) {
        return;
      }
      const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
      columnSelection.scrollIntoView({ behavior: scrollBehavior, block: "center" });
      columnSelection.focus({ preventScroll: true });
    }, 0);
  }

  function handleColumnToggled(columnName: string) {
    setSelectedColumns((previousColumns) => {
      if (previousColumns.includes(columnName)) {
        return previousColumns.filter((selectedName) => selectedName !== columnName);
      }
      return [...previousColumns, columnName];
    });
    resetCurrentResult();
  }

  function handleSelectAllColumns() {
    setSelectedColumns(columnNames);
    resetCurrentResult();
  }

  function handleClearColumns() {
    setSelectedColumns([]);
    resetCurrentResult();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedColumns.length === 0) {
      setErrorMessage("Select at least one column to analyze.");
      return;
    }

    setErrorMessage(null);
    onError(null);
    setStatusMessage("Starting the analysis...");
    setJob(null);
    onJobStatusChanged(null);
    onAnalysisStartingChanged(analysisKind, true);
    setDetail(null);
    setDetailPage(null);
    try {
      const startedJob = await startDataAnalysisJob(
        selectedFile,
        worksheetName,
        missingValueMarkers,
        selectedColumns,
        analysisKind,
      );
      applyJobStatus(startedJob);
    } catch (error: unknown) {
      const message =
        error instanceof DataAnalysisRequestError
          ? error.message
          : "The data analysis could not be started. Check the local API and try again.";
      setErrorMessage(message);
      onError(message);
      setStatusMessage(null);
    } finally {
      onAnalysisStartingChanged(analysisKind, false);
    }
  }

  function handleDetailOpened(nextDetail: SelectedDetail) {
    setDetail(nextDetail);
    setDetailColumnMode("all");
    setDetailPage(null);
    setDetailPageNumber(1);
    setDetailLoading(true);
    setDetailError(null);
    onError(null);
    setExportError(null);
    setExportSuccess(null);
  }

  function handleDetailPageChanged(nextPage: number) {
    setDetailPageNumber(nextPage);
    setDetailPage(null);
    setDetailLoading(true);
    setDetailError(null);
    onError(null);
  }

  function handleDetailRetry() {
    setDetailRetryNumber((previousNumber) => previousNumber + 1);
    setDetailPage(null);
    setDetailLoading(true);
    setDetailError(null);
    onError(null);
    onError(null);
  }

  async function handleDetailExport(columnMode: RowColumnMode) {
    if (job === null || detail === null) {
      return;
    }

    setExportLoading(true);
    setExportError(null);
    setExportSuccess(null);
    try {
      await downloadDataAnalysisRowsCsv(
        job.job_id,
        analysisKind,
        detail.target,
        columnMode,
      );
      setExportSuccess("CSV download started.");
    } catch (error: unknown) {
      const message =
        error instanceof DataAnalysisRequestError
          ? error.message
          : "The CSV could not be downloaded. Check the local API and retry.";
      setExportError(message);
      onError(message);
    } finally {
      setExportLoading(false);
    }
  }

  function handleDetailClosed() {
    setDetail(null);
    setDetailPage(null);
    setDetailColumnMode("all");
  }

  function handleShowAllTerms(columnName: string) {
    setShowAllTerms((previousValues) => ({
      ...previousValues,
      [columnName]: !previousValues[columnName],
    }));
  }

  function handleShowAllGroups() {
    setShowAllGroups((previousValue) => !previousValue);
  }

  const completedSummary =
    job?.state === JOB_STATE_SUCCEEDED && job.result !== null ? job.result : null;
  const formalTermsSummary =
    completedSummary !== null && isFormalTermsSummary(completedSummary)
      ? completedSummary
      : null;
  const groupDataSummary =
    completedSummary !== null && !isFormalTermsSummary(completedSummary)
      ? completedSummary
      : null;
  return (
    <>
      <div className="grid min-w-0 gap-4" hidden={hidden}>
        <CollapsibleSection
          title={`${titleForAnalysis(analysisKind)} Setup`}
          summary={`${selectedColumns.length} columns selected`}
          open={setupExpanded}
          onOpenChange={setSetupExpanded}
        >
          <div className="grid min-w-0 gap-4">
            <p className="m-0 max-w-4xl text-sm leading-6 text-text-secondary">
              {analysisKind === "formal_terms"
                ? "Review exact terms and repeated structural formats in the columns you select."
                : "Every Input Row is grouped by the exact values in the columns you select."}
            </p>
          <form className="grid min-w-0 gap-5" onSubmit={handleSubmit}>
            <fieldset
              ref={columnSelectionRef}
              className="grid min-w-0 gap-3 border-0 p-0"
              tabIndex={-1}
              disabled={analysisBusy}
            >
              <legend>Columns to analyze</legend>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryButtonClasses}
                  disabled={analysisBusy || selectedColumns.length === columnNames.length}
                  onClick={handleSelectAllColumns}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className={secondaryButtonClasses}
                  disabled={analysisBusy || selectedColumns.length === 0}
                  onClick={handleClearColumns}
                >
                  Clear selection
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {columnNames.map((columnName, columnIndex) => (
                  <label className={analysisOptionClasses} key={columnIndex}>
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={selectedColumns.includes(columnName)}
                      onChange={() => handleColumnToggled(columnName)}
                    />
                    <span>{columnName}</span>
                  </label>
                ))}
              </div>
              <p className={hintTextClasses}>
                {analysisKind === "formal_terms"
                  ? "Each selected column is analyzed separately. Missing values use the configured column rules."
                  : "Every Input Row is grouped by the observed combination of selected values. Repeated rows still count separately."}
              </p>
            </fieldset>

            {errorMessage !== null && <p className={errorMessageClasses} role="alert">{errorMessage}</p>}
            {statusMessage !== null && !requestStarting && (
              <p className={statusTextClasses} role="status">
                {statusMessage}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className={primaryButtonClasses}
                disabled={selectedColumns.length === 0 || analysisBusy}
              >
                {analysisKind === "formal_terms" ? "Analyze Formal Terms" : "Analyze Group Data"}
              </button>
            </div>
          </form>
          </div>
        </CollapsibleSection>

        {completedSummary !== null && (
          <CollapsibleSection
            title={titleForAnalysis(analysisKind)}
            summary={
              analysisKind === "formal_terms" && formalTermsSummary !== null
                ? `${formalTermsSummary.input_rows.toLocaleString()} rows · ${formalTermsSummary.columns.length} columns`
                : groupDataSummary !== null
                  ? `${groupDataSummary.input_rows.toLocaleString()} rows · ${groupDataSummary.groups.length.toLocaleString()} groups`
                  : ""
            }
            open={resultsExpanded}
            onOpenChange={setResultsExpanded}
          >
          {formalTermsSummary !== null && (
            <FormalTermsResults
              summary={formalTermsSummary}
              showAllTerms={showAllTerms}
              onShowAllTerms={handleShowAllTerms}
              onDetailOpened={handleDetailOpened}
              onChangeColumns={focusColumnSelection}
            />
          )}
          {groupDataSummary !== null && (
            <GroupDataResults
              summary={groupDataSummary}
              showAllGroups={showAllGroups}
              onShowAllGroups={handleShowAllGroups}
              onDetailOpened={handleDetailOpened}
              onChangeColumns={focusColumnSelection}
            />
          )}
          </CollapsibleSection>
        )}
      </div>

      {!hidden && detail !== null && job !== null && (
        <DataAnalysisRowsDialog
          title={detail.title}
          targetDescription={detail.description}
          matchingRowCount={detail.count}
          analysisColumns={
            job.state === JOB_STATE_SUCCEEDED && job.result !== null
              ? job.result.selected_columns
              : []
          }
          columnMode={detailColumnMode}
          onColumnModeChange={setDetailColumnMode}
          page={detailPage}
          requestedPage={detailPageNumber}
          loading={detailLoading}
          error={detailError}
          onPageChange={handleDetailPageChanged}
          onRetry={handleDetailRetry}
          exportLoading={exportLoading}
          exportError={exportError}
          exportSuccess={exportSuccess}
          onExport={handleDetailExport}
          onClose={handleDetailClosed}
        />
      )}
    </>
  );
}

interface FormalTermsResultsProps {
  summary: FormalTermsSummary;
  showAllTerms: Record<string, boolean>;
  onShowAllTerms: (columnName: string) => void;
  onDetailOpened: (detail: SelectedDetail) => void;
  onChangeColumns: () => void;
}

export function FormalTermsResults({
  summary,
  showAllTerms,
  onShowAllTerms,
  onDetailOpened,
  onChangeColumns,
}: FormalTermsResultsProps) {
  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="formal-terms-summary-heading">
      <div className="grid min-w-0 gap-2">
        <h3 className="text-lg font-semibold" id="formal-terms-summary-heading">Formal Terms Summary</h3>
        <p className={statusTextClasses}>
          {summary.input_rows.toLocaleString()} Input Rows · {summary.columns.length} selected columns.
        </p>
        <p className={hintTextClasses}>
          Structural formats keep literal text and digit-run widths, for example{" "}
          <code>EMP-&lt;5 digits&gt;</code>. Configure Missing Value markers in the shared settings
          section.
        </p>
      </div>

      {summary.columns.map((column, columnIndex) => (
        <FormalColumnResults
          key={`${columnIndex}-${column.name}`}
          column={column}
          columnIndex={columnIndex}
          inputRows={summary.input_rows}
          showAllTerms={showAllTerms[column.name] ?? false}
          onShowAllTerms={() => onShowAllTerms(column.name)}
          onDetailOpened={onDetailOpened}
          onChangeColumns={onChangeColumns}
        />
      ))}
    </section>
  );
}

interface FormalColumnResultsProps {
  column: FormalColumnTerms;
  columnIndex: number;
  inputRows: number;
  showAllTerms: boolean;
  onShowAllTerms: () => void;
  onDetailOpened: (detail: SelectedDetail) => void;
  onChangeColumns: () => void;
}

function FormalColumnResults({
  column,
  columnIndex,
  inputRows,
  showAllTerms,
  onShowAllTerms,
  onDetailOpened,
  onChangeColumns,
}: FormalColumnResultsProps) {
  const displayedTerms = showAllTerms
    ? column.terms
    : column.terms.slice(0, TERMS_SHOWN_BY_DEFAULT);

  function openTermDetail(termIndex: number) {
    const term = column.terms[termIndex];
    if (term === undefined) {
      return;
    }
    const detail = detailTargetForTerm(columnIndex, termIndex, term.value, term.count);
    onDetailOpened(detail);
  }

  function openFormatDetail(patternIndex: number, pattern: DataFormatPattern) {
    onDetailOpened({
      target: { kind: "format", columnIndex, itemIndex: patternIndex },
      title: "Input Rows for a Structural Format",
      description: `the format ${JSON.stringify(pattern.pattern)}`,
      count: pattern.occurrence_count,
    });
  }

  return (
    <section className="grid min-w-0 gap-4 border-t border-border pt-4" aria-labelledby={`formal-column-${columnIndex}`}>
      <h4 className="text-base font-semibold" id={`formal-column-${columnIndex}`}>{column.name}</h4>
      <p className={statusTextClasses}>
        {column.terms.length.toLocaleString()} distinct terms in {inputRows.toLocaleString()} Input Rows.
      </p>

      <h5 className="text-sm font-semibold text-text-secondary">Terms</h5>
      {column.terms.length === 0 ? (
        <div className="grid justify-items-start gap-3">
          <p className={hintTextClasses}>No terms were found in this column.</p>
          <button type="button" className={secondaryButtonClasses} onClick={onChangeColumns}>
            Change selected columns
          </button>
        </div>
      ) : (
        <div
          className={`${summaryTableFrameClasses} max-h-[min(60vh,40rem)] overflow-auto overscroll-contain`}
          role="region"
          aria-label={`Terms in ${column.name}. Scroll to view additional columns.`}
          tabIndex={0}
        >
          <table className={`${summaryTableClasses} min-w-full`}>
            <thead>
              <tr>
                <th className={dataAnalysisActionHeaderClasses} scope="col">
                  Input Row details
                </th>
                <th scope="col">Term</th>
                <th scope="col">Input Rows</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {displayedTerms.map((term, termIndex) => (
                <tr key={termIndex}>
                  <td className={dataAnalysisActionCellClasses}>
                    <button
                      type="button"
                      className={secondaryButtonClasses}
                      aria-haspopup="dialog"
                      aria-label={`View Input Rows for the term ${JSON.stringify(formatTerm(term.value))}`}
                      onClick={() => openTermDetail(termIndex)}
                    >
                      View rows
                    </button>
                  </td>
                  <th scope="row">
                    <span className="[overflow-wrap:anywhere]">{formatTerm(term.value)}</span>
                  </th>
                  <td>{term.count.toLocaleString()}</td>
                  <td>{formatShare(term.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {column.terms.length > TERMS_SHOWN_BY_DEFAULT && (
        <button type="button" className={secondaryButtonClasses} onClick={onShowAllTerms}>
          {showAllTerms ? "Show the most common terms only" : "Show all terms"}
        </button>
      )}

      <h5 className="text-sm font-semibold text-text-secondary">Structural Format Patterns</h5>
      {column.format_patterns.length === 0 ? (
        <div className="grid justify-items-start gap-3">
          <p className={hintTextClasses}>No repeated structural format patterns were found.</p>
          <button type="button" className={secondaryButtonClasses} onClick={onChangeColumns}>
            Change selected columns
          </button>
        </div>
      ) : (
        <div
          className={`${summaryTableFrameClasses} max-h-[min(60vh,40rem)] overflow-auto overscroll-contain`}
          role="region"
          aria-label={`Structural formats in ${column.name}. Scroll to view additional columns.`}
          tabIndex={0}
        >
          <table className={`${summaryTableClasses} min-w-full`}>
            <thead>
              <tr>
                <th className={dataAnalysisActionHeaderClasses} scope="col">
                  Input Row details
                </th>
                <th scope="col">Format</th>
                <th scope="col">Occurrences</th>
                <th scope="col">Distinct terms</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {column.format_patterns.map((pattern, patternIndex) => (
                <tr key={patternIndex}>
                  <td className={dataAnalysisActionCellClasses}>
                    <button
                      type="button"
                      className={secondaryButtonClasses}
                      aria-haspopup="dialog"
                      aria-label={`View Input Rows for the format ${JSON.stringify(pattern.pattern)}`}
                      onClick={() => openFormatDetail(patternIndex, pattern)}
                    >
                      View rows
                    </button>
                  </td>
                  <th scope="row">
                    <span className="[overflow-wrap:anywhere]">{pattern.pattern}</span>
                  </th>
                  <td>{pattern.occurrence_count.toLocaleString()}</td>
                  <td>{pattern.distinct_term_count.toLocaleString()}</td>
                  <td>{formatShare(pattern.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface GroupDataResultsProps {
  summary: GroupDataSummary;
  showAllGroups: boolean;
  onShowAllGroups: () => void;
  onDetailOpened: (detail: SelectedDetail) => void;
  onChangeColumns: () => void;
}

export function GroupDataResults({
  summary,
  showAllGroups,
  onShowAllGroups,
  onDetailOpened,
  onChangeColumns,
}: GroupDataResultsProps) {
  const displayedGroups = showAllGroups
    ? summary.groups
    : summary.groups.slice(0, GROUPS_SHOWN_BY_DEFAULT);

  function openGroupDetail(groupIndex: number, group: DataGroup) {
    onDetailOpened({
      target: { kind: "group", itemIndex: groupIndex },
      title: "Input Rows for a Group Data Key",
      description: `the group ${JSON.stringify(groupDescription(summary.selected_columns, group))}`,
      count: group.count,
    });
  }

  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="group-data-summary-heading">
      <div className="grid min-w-0 gap-2">
        <h3 className="text-lg font-semibold" id="group-data-summary-heading">Group Data Summary</h3>
        <p className={statusTextClasses}>
          {summary.input_rows.toLocaleString()} Input Rows · {summary.groups.length.toLocaleString()} observed groups.
        </p>
        <p className={hintTextClasses}>
          Groups are defined by values in these selected columns:{" "}
          <strong className="font-semibold text-text-secondary">
            {summary.selected_columns.join(", ")}
          </strong>
          .
        </p>
      </div>

      {summary.groups.length === 0 ? (
        <div className="grid justify-items-start gap-3">
          <p className={hintTextClasses}>No observed groups were found.</p>
          <button type="button" className={secondaryButtonClasses} onClick={onChangeColumns}>
            Change selected columns
          </button>
        </div>
      ) : (
        <div
          className={`${summaryTableFrameClasses} max-h-[min(60vh,40rem)] overflow-auto overscroll-contain`}
          role="region"
          aria-label="Group Data Summary table. Scroll to view additional columns."
          tabIndex={0}
        >
          <table className={`${summaryTableClasses} min-w-full`}>
            <thead>
              <tr>
                <th className={dataAnalysisActionHeaderClasses} scope="col">
                  Input Row details
                </th>
                {summary.selected_columns.map((columnName, columnIndex) => (
                  <th key={columnIndex} scope="col">{columnName}</th>
                ))}
                <th scope="col">Input Rows</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {displayedGroups.map((group, groupIndex) => (
                <tr key={groupIndex}>
                  <td className={dataAnalysisActionCellClasses}>
                    <button
                      type="button"
                      className={secondaryButtonClasses}
                      aria-haspopup="dialog"
                      aria-label={`View Input Rows for the group ${groupDescription(summary.selected_columns, group)}`}
                      onClick={() => openGroupDetail(groupIndex, group)}
                    >
                      View rows
                    </button>
                  </td>
                  {group.values.map((value, valueIndex) => (
                    <td key={valueIndex}>
                      <span className="[overflow-wrap:anywhere]">{formatTerm(value)}</span>
                    </td>
                  ))}
                  <td>{group.count.toLocaleString()}</td>
                  <td>{formatShare(group.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary.groups.length > GROUPS_SHOWN_BY_DEFAULT && (
        <button type="button" className={secondaryButtonClasses} onClick={onShowAllGroups}>
          {showAllGroups ? "Show the most common groups only" : "Show all groups"}
        </button>
      )}
    </section>
  );
}
