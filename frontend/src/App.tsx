import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import "./App.css";
import { CollapsibleSection } from "./CollapsibleSection";
import { ColumnVisibilityPicker } from "./ColumnVisibilityPicker";
import { PatternRowsDialog } from "./PatternRowsDialog";
import { PatternStatusLabel } from "./PatternPreview";
import { DataAnalysisPanel } from "./DataAnalysisPanel";
import { cancelDataAnalysisJob } from "./dataAnalysisApi";
import type { DataAnalysisJobStatus, DataAnalysisKind } from "./dataAnalysisApi";
import { SortableHeader } from "./SortableHeader";
import type { CompletenessPattern, PatternSummary } from "./PatternPreview";
import {
  downloadPatternRowsCsv,
  fetchPatternRowsPage,
  PatternRowsRequestError,
} from "./patternRows";
import type { PatternRowsPage } from "./patternRows";
import {
  compareNumbers,
  comparePatternStatus,
  compareText,
  cycleSort,
  sortRows,
} from "./tableSorting";
import type { SortState } from "./tableSorting";
import {
  csvExceedsBenchmarkSize,
  MAX_BENCHMARKED_FILE_SIZE_MIB,
  MAX_BENCHMARKED_SELECTED_COLUMNS,
  selectedColumnsExceedBenchmark,
} from "./benchmarkLimits";
import {
  PATTERN_STATUS_MISSING,
  PATTERN_STATUS_PRESENT,
} from "./patternStatus";

interface ColumnCompleteness {
  name: string;
  present_count: number;
  present_share: number;
  missing_count: number;
  missing_share: number;
}

interface ColumnCompletenessSummary {
  input_rows: number;
  columns: ColumnCompleteness[];
}

interface AnalysisJobProgress {
  rows_done: number;
  rows_total: number;
}

interface AnalysisJobStatus {
  job_id: string;
  state: string;
  stage: string | null;
  elapsed_seconds: number;
  progress: AnalysisJobProgress | null;
  result: PatternSummary | null;
  error: string | null;
}

interface ImportResponse {
  sheets: string[];
  columns: string[] | null;
  worksheet_row_limit: number | null;
}

interface ApiFailureResponse {
  detail: string;
}

/** Failure reported by the local API, already carrying a user-facing message. */
class ApiRequestError extends Error {}

async function readResponseBody<T extends object>(response: Response, fallbackMessage: string): Promise<T> {
  const responseBody = (await response.json()) as T | ApiFailureResponse;

  if ("detail" in responseBody) {
    const failure = responseBody as ApiFailureResponse;
    throw new ApiRequestError(failure.detail || fallbackMessage);
  }

  return responseBody as T;
}

async function importFile(file: File, worksheetName: string | null): Promise<ImportResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (worksheetName !== null) {
    formData.append("sheet", worksheetName);
  }

  const response = await fetch("/api/imports", { method: "POST", body: formData });
  return await readResponseBody<ImportResponse>(response, "The file could not be imported.");
}

async function fetchColumnCompleteness(
  file: File,
  missingValueMarkers: Record<string, string[]>,
  worksheetName: string,
  resetAnalysisResults: boolean,
): Promise<ColumnCompletenessSummary> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("missing_markers", JSON.stringify(missingValueMarkers));
  if (resetAnalysisResults) {
    formData.append("reset_analysis_results", "true");
  }
  if (worksheetName.length > 0) {
    formData.append("sheet", worksheetName);
  }

  const response = await fetch("/api/column-completeness", { method: "POST", body: formData });
  return await readResponseBody<ColumnCompletenessSummary>(
    response,
    "The summary could not be computed.",
  );
}

async function startAnalysisJob(
  file: File,
  missingValueMarkers: Record<string, string[]>,
  worksheetName: string,
  identifierColumn: string,
  analysisColumns: string[],
  highCardinalityAcknowledged: boolean,
): Promise<AnalysisJobStatus> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("missing_markers", JSON.stringify(missingValueMarkers));
  if (worksheetName.length > 0) {
    formData.append("sheet", worksheetName);
  }
  if (identifierColumn.length > 0) {
    formData.append("identifier_column", identifierColumn);
  }
  formData.append("analysis_columns", JSON.stringify(analysisColumns));
  if (highCardinalityAcknowledged) {
    formData.append("high_cardinality_acknowledged", "true");
  }

  const response = await fetch("/api/analysis-jobs", { method: "POST", body: formData });
  return await readResponseBody<AnalysisJobStatus>(response, "The analysis could not be started.");
}

async function fetchAnalysisJobStatus(jobId: string): Promise<AnalysisJobStatus> {
  const response = await fetch(`/api/analysis-jobs/${jobId}`);
  return await readResponseBody<AnalysisJobStatus>(
    response,
    "The analysis status could not be read.",
  );
}

async function cancelAnalysisJob(jobId: string): Promise<AnalysisJobStatus> {
  const response = await fetch(`/api/analysis-jobs/${jobId}/cancel`, { method: "POST" });
  return await readResponseBody<AnalysisJobStatus>(
    response,
    "The analysis could not be cancelled.",
  );
}

function parseMissingValueMarkers(missingMarkersText: Record<string, string>): Record<string, string[]> {
  const missingValueMarkers: Record<string, string[]> = {};

  for (const [columnName, markersText] of Object.entries(missingMarkersText)) {
    const markers = markersText
      .split(",")
      .map((marker) => marker.trim())
      .filter((marker) => marker.length > 0);

    if (markers.length > 0) {
      missingValueMarkers[columnName] = markers;
    }
  }

  return missingValueMarkers;
}

function formatShare(share: number): string {
  const percentage = share * 100;
  if (Number.isInteger(percentage)) {
    return `${percentage}%`;
  }
  return `${percentage.toFixed(2)}%`;
}

const PATTERN_FILTER_ANY = "any";
const MOST_COMMON_PATTERNS_SHOWN = 10;

const JOB_STATE_RUNNING = "running";
const JOB_STATE_SUCCEEDED = "succeeded";
const JOB_STATE_FAILED = "failed";
const JOB_STATE_CANCELLED = "cancelled";

// The API refuses to start an unacknowledged analysis at this column count,
// because 2^columns possible Completeness Patterns make it a very large job.
const HIGH_CARDINALITY_COLUMN_THRESHOLD = 20;

const JOB_POLL_INTERVAL_MILLISECONDS = 500;

type AppSectionId =
  | "source"
  | "missingValueSettings"
  | "columnCompleteness"
  | "analysisSetup"
  | "patternResults";
type ActiveAnalysisMode = "choose" | "completeness" | "formal_terms" | "group_data";
type ColumnCompletenessSortKey = "name" | "present_count" | "missing_count";
type PatternSortKey = "count" | "share" | `status:${number}`;

function expandedSectionsByDefault(): Record<AppSectionId, boolean> {
  return {
    source: true,
    missingValueSettings: true,
    columnCompleteness: true,
    analysisSetup: true,
    patternResults: true,
  };
}

type AnalysisNoticeMode = Exclude<ActiveAnalysisMode, "choose">;

interface AnalysisNotice {
  jobId: string;
  mode: AnalysisNoticeMode;
  outcome: "succeeded" | "failed";
  message: string | null;
}

interface SharedAnalysisJob {
  jobId: string;
  mode: AnalysisNoticeMode;
  stage: string;
  elapsedSeconds: number;
  progress: { itemsDone: number; itemsTotal: number; label: string } | null;
  cancelable: boolean;
}

function analysisModeLabel(mode: AnalysisNoticeMode): string {
  if (mode === "completeness") {
    return "Completeness Patterns";
  }
  if (mode === "formal_terms") {
    return "Formal Terms";
  }
  return "Group Data";
}

function withoutIdentifierColumn(
  analysisColumns: string[],
  identifierColumn: string,
): string[] {
  // The Identifier Column never joins the pattern analysis, so it is dropped
  // wherever the columns to analyze are decided.
  return analysisColumns.filter((columnName) => columnName !== identifierColumn);
}

function patternsMatchingFilters(
  patterns: CompletenessPattern[],
  analysisColumns: string[],
  statusFilters: Record<string, string>,
): CompletenessPattern[] {
  return patterns.filter((pattern) => {
    return analysisColumns.every((columnName, columnIndex) => {
      const filterStatus = statusFilters[columnName] ?? PATTERN_FILTER_ANY;
      if (filterStatus === PATTERN_FILTER_ANY) {
        return true;
      }
      return pattern.statuses[columnIndex] === filterStatus;
    });
  });
}

function describeDisplayedPatterns(
  matchedCount: number,
  shownCount: number,
  totalCount: number,
  filtersActive: boolean,
  sortDescription: string | null,
): string {
  if (matchedCount === 0) {
    return `No patterns match this filter. ${totalCount} patterns were observed in total.`;
  }
  if (sortDescription !== null) {
    return `Showing ${shownCount} of ${matchedCount} matching patterns, sorted by ${sortDescription}.`;
  }
  if (filtersActive) {
    return `${matchedCount} of ${totalCount} patterns match. Showing ${shownCount}, most common first.`;
  }
  if (totalCount > shownCount) {
    return `Showing the ${shownCount} most common of ${totalCount} patterns. Counts and shares are exact.`;
  }
  return `Showing all ${totalCount} observed patterns with exact counts and shares.`;
}

function formatCountAndShare(count: number, share: number, inputRows: number): string {
  return `${count} of ${inputRows} (${formatShare(share)})`;
}

function compareColumnCompletenessRows(
  sortKey: ColumnCompletenessSortKey,
  left: ColumnCompleteness,
  right: ColumnCompleteness,
): number {
  if (sortKey === "name") {
    return compareText(left.name, right.name);
  }
  if (sortKey === "present_count") {
    return compareNumbers(left.present_count, right.present_count);
  }
  return compareNumbers(left.missing_count, right.missing_count);
}

function comparePatternRows(
  sortKey: PatternSortKey,
  left: CompletenessPattern,
  right: CompletenessPattern,
): number {
  if (sortKey === "count") {
    return compareNumbers(left.count, right.count);
  }
  if (sortKey === "share") {
    return compareNumbers(left.share, right.share);
  }

  const columnIndex = Number(sortKey.slice("status:".length));
  return comparePatternStatus(left.statuses[columnIndex], right.statuses[columnIndex]);
}

function describePatternSort(
  sortState: SortState<PatternSortKey> | null,
  analysisColumns: string[],
): string | null {
  if (sortState === null) {
    return null;
  }

  let columnLabel: string;
  if (sortState.key === "count") {
    columnLabel = "Input Rows";
  } else if (sortState.key === "share") {
    columnLabel = "Share of Input Rows";
  } else {
    const columnIndex = Number(sortState.key.slice("status:".length));
    columnLabel = analysisColumns[columnIndex] ?? "column";
  }

  return `${columnLabel} (${sortState.direction})`;
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  // A workbook lists its worksheets; exactly one of them can be chosen for the
  // analysis. A CSV file has no worksheets and needs no choice.
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [worksheetRowLimit, setWorksheetRowLimit] = useState<number | null>(null);
  const [columnNames, setColumnNames] = useState<string[]>([]);
  const [summary, setSummary] = useState<ColumnCompletenessSummary | null>(null);
  const [columnCompletenessSort, setColumnCompletenessSort] =
    useState<SortState<ColumnCompletenessSortKey> | null>(null);
  // Marker text is keyed by the column name the API reported; the API reports
  // every file column under its own name.
  const [missingMarkersText, setMissingMarkersText] = useState<Record<string, string>>({});
  // The Missing Value rules behind the displayed Column Completeness Summary.
  // Later results must use these rules, not whatever the marker text currently
  // contains before it is submitted.
  const [appliedMissingValueMarkers, setAppliedMissingValueMarkers] = useState<
    Record<string, string[]>
  >({});
  // An empty Identifier Column means the user designated no identifier.
  const [identifierColumn, setIdentifierColumn] = useState<string>("");
  const [analysisColumns, setAnalysisColumns] = useState<string[]>([]);
  const [patternSummary, setPatternSummary] = useState<PatternSummary | null>(null);
  const [patternSort, setPatternSort] = useState<SortState<PatternSortKey> | null>(null);
  const [hiddenAnalysisColumns, setHiddenAnalysisColumns] = useState<string[]>([]);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJobStatus | null>(null);
  const [highCardinalityAcknowledged, setHighCardinalityAcknowledged] = useState<boolean>(false);
  const [patternStatusFilters, setPatternStatusFilters] = useState<Record<string, string>>({});
  const [selectedPatternIndex, setSelectedPatternIndex] = useState<number | null>(null);
  const [selectedPatternPage, setSelectedPatternPage] = useState<number>(1);
  const [patternRowsPage, setPatternRowsPage] = useState<PatternRowsPage | null>(null);
  const [patternRowsLoading, setPatternRowsLoading] = useState<boolean>(false);
  const [patternRowsError, setPatternRowsError] = useState<string | null>(null);
  const [patternRowsRetryNumber, setPatternRowsRetryNumber] = useState<number>(0);
  const [patternRowsExportLoading, setPatternRowsExportLoading] = useState<boolean>(false);
  const [patternRowsExportError, setPatternRowsExportError] = useState<string | null>(null);
  const [patternRowsExportSuccess, setPatternRowsExportSuccess] = useState<string | null>(null);
  const [showAllPatterns, setShowAllPatterns] = useState<boolean>(false);
  const [expandedSections, setExpandedSections] = useState<Record<AppSectionId, boolean>>(
    expandedSectionsByDefault,
  );
  const [activeAnalysisMode, setActiveAnalysisMode] = useState<ActiveAnalysisMode>("choose");
  const [analysisMenuOpen, setAnalysisMenuOpen] = useState<boolean>(false);
  const [datasetVersion, setDatasetVersion] = useState<number>(0);
  const [dataAnalysisJobs, setDataAnalysisJobs] = useState<
    Record<DataAnalysisKind, DataAnalysisJobStatus | null>
  >({ formal_terms: null, group_data: null });
  const dataAnalysisJobsRef = useRef<Record<DataAnalysisKind, DataAnalysisJobStatus | null>>({
    formal_terms: null,
    group_data: null,
  });
  const [analysisNotices, setAnalysisNotices] = useState<AnalysisNotice[]>([]);
  const [cancelingJobIds, setCancelingJobIds] = useState<Record<string, boolean>>({});
  const [cancelingCompletenessJob, setCancelingCompletenessJob] = useState<boolean>(false);
  const [startingCompletenessAnalysis, setStartingCompletenessAnalysis] = useState<boolean>(false);
  const [startingDataAnalyses, setStartingDataAnalyses] = useState<
    Record<DataAnalysisKind, boolean>
  >({ formal_terms: false, group_data: false });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestNumber = useRef(0);

  function beginRequest(): number {
    requestNumber.current = requestNumber.current + 1;
    return requestNumber.current;
  }

  function isCurrentRequest(startedRequest: number): boolean {
    return startedRequest === requestNumber.current;
  }

  const handleDataAnalysisJobStatusChanged = useCallback(
    (analysisKind: DataAnalysisKind, jobStatus: DataAnalysisJobStatus | null) => {
      const nextJobs = { ...dataAnalysisJobsRef.current, [analysisKind]: jobStatus };
      dataAnalysisJobsRef.current = nextJobs;
      setDataAnalysisJobs(nextJobs);

      if (jobStatus === null || jobStatus.state === JOB_STATE_RUNNING) {
        setAnalysisNotices((currentNotices) => {
          const remainingNotices = currentNotices.filter(
            (notice) => notice.mode !== analysisKind,
          );
          return remainingNotices.length === currentNotices.length
            ? currentNotices
            : remainingNotices;
        });
        return;
      }

      if (jobStatus.state !== JOB_STATE_SUCCEEDED && jobStatus.state !== JOB_STATE_FAILED) {
        return;
      }

      const noticeOutcome: AnalysisNotice["outcome"] = jobStatus.state;
      setAnalysisNotices((currentNotices) => {
        if (currentNotices.some((notice) => notice.jobId === jobStatus.job_id)) {
          return currentNotices;
        }
        return [
          ...currentNotices.filter((notice) => notice.mode !== analysisKind),
          {
            jobId: jobStatus.job_id,
            mode: analysisKind,
            outcome: noticeOutcome,
            message: jobStatus.error,
          },
        ];
      });
    },
    [],
  );

  const onFormalTermsJobStatusChanged = useCallback(
    (jobStatus: DataAnalysisJobStatus | null) =>
      handleDataAnalysisJobStatusChanged("formal_terms", jobStatus),
    [handleDataAnalysisJobStatusChanged],
  );

  const onGroupDataJobStatusChanged = useCallback(
    (jobStatus: DataAnalysisJobStatus | null) =>
      handleDataAnalysisJobStatusChanged("group_data", jobStatus),
    [handleDataAnalysisJobStatusChanged],
  );

  function handleDataAnalysisStartingChanged(
    analysisKind: DataAnalysisKind,
    starting: boolean,
  ) {
    setStartingDataAnalyses((currentAnalyses) => ({
      ...currentAnalyses,
      [analysisKind]: starting,
    }));
  }

  function handleCompletenessJobStatusChanged(jobStatus: AnalysisJobStatus) {
    setAnalysisJob(jobStatus);

    if (jobStatus.state === JOB_STATE_RUNNING || jobStatus.state === JOB_STATE_CANCELLED) {
      setAnalysisNotices((currentNotices) => {
        const remainingNotices = currentNotices.filter(
          (notice) => notice.mode !== "completeness",
        );
        return remainingNotices.length === currentNotices.length
          ? currentNotices
          : remainingNotices;
      });
      return;
    }

    if (jobStatus.state !== JOB_STATE_SUCCEEDED && jobStatus.state !== JOB_STATE_FAILED) {
      return;
    }

    const noticeOutcome: AnalysisNotice["outcome"] = jobStatus.state;
    setAnalysisNotices((currentNotices) => {
      if (currentNotices.some((notice) => notice.jobId === jobStatus.job_id)) {
        return currentNotices;
      }
      return [
        ...currentNotices.filter((notice) => notice.mode !== "completeness"),
        {
          jobId: jobStatus.job_id,
          mode: "completeness",
          outcome: noticeOutcome,
          message: jobStatus.error,
        },
      ];
    });
  }

  function handleSectionOpenChanged(sectionId: AppSectionId, open: boolean) {
    setExpandedSections((previousSections) => ({
      ...previousSections,
      [sectionId]: open,
    }));
  }

  function handleAnalysisModeSelected(mode: ActiveAnalysisMode) {
    setActiveAnalysisMode(mode);
    setAnalysisMenuOpen(false);
    const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    window.scrollTo({ top: 0, behavior: scrollBehavior });
    if (mode !== "completeness") {
      handlePatternPreviewClosed();
    }
  }

  function handleAnalysisNoticeOpened(notice: AnalysisNotice) {
    handleAnalysisModeSelected(notice.mode);
    if (notice.outcome === "failed") {
      setErrorMessage(null);
    }
    setAnalysisNotices((currentNotices) =>
      currentNotices.filter((currentNotice) => currentNotice.jobId !== notice.jobId),
    );
  }

  function handleAnalysisNoticeDismissed(jobId: string) {
    const dismissedNotice = analysisNotices.find((notice) => notice.jobId === jobId);
    if (dismissedNotice?.outcome === "failed") {
      setErrorMessage(null);
    }
    setAnalysisNotices((currentNotices) =>
      currentNotices.filter((notice) => notice.jobId !== jobId),
    );
  }

  function handleColumnCompletenessSortChanged(sortKey: ColumnCompletenessSortKey) {
    setColumnCompletenessSort((currentSort) => cycleSort(currentSort, sortKey));
  }

  function handlePatternSortChanged(sortKey: PatternSortKey) {
    setPatternSort((currentSort) => cycleSort(currentSort, sortKey));
    clearPatternDetails();
  }

  function handleRequestFailure(error: unknown) {
    if (error instanceof ApiRequestError) {
      setErrorMessage(error.message);
    } else {
      setErrorMessage("The local API could not be reached. Start it and try again.");
    }
    setStatusMessage(null);
  }

  async function loadColumnCompleteness(
    file: File,
    missingValueMarkers: Record<string, string[]>,
    worksheetName: string,
    resetAnalysisResults = false,
  ) {
    setStatusMessage("Computing the column completeness summary...");

    const startedRequest = beginRequest();
    try {
      const completenessSummary = await fetchColumnCompleteness(
        file,
        missingValueMarkers,
        worksheetName,
        resetAnalysisResults,
      );
      if (!isCurrentRequest(startedRequest)) {
        return;
      }
      setSummary(completenessSummary);
      setAppliedMissingValueMarkers(missingValueMarkers);
      if (resetAnalysisResults) {
        setAnalysisJob(null);
        setStartingCompletenessAnalysis(false);
        setPatternSummary(null);
        dataAnalysisJobsRef.current = { formal_terms: null, group_data: null };
        setDataAnalysisJobs({ formal_terms: null, group_data: null });
        setStartingDataAnalyses({ formal_terms: false, group_data: false });
        setAnalysisNotices([]);
        setCancelingJobIds({});
        setCancelingCompletenessJob(false);
      }
      setStatusMessage(null);
    } catch (error) {
      if (isCurrentRequest(startedRequest)) {
        handleRequestFailure(error);
      }
    }
  }

  function resetPatternViewState() {
    // What patterns are displayed decides which rows exist to click, so a
    // changed view closes any open preview and starts from the most common
    // patterns again.
    clearPatternDetails();
    setShowAllPatterns(false);
  }

  function clearPatternDetails() {
    setSelectedPatternIndex(null);
    setSelectedPatternPage(1);
    setPatternRowsPage(null);
    setPatternRowsLoading(false);
    setPatternRowsError(null);
    setPatternRowsExportLoading(false);
    setPatternRowsExportError(null);
    setPatternRowsExportSuccess(null);
  }

  function applyFinishedAnalysis(jobStatus: AnalysisJobStatus) {
    if (jobStatus.state === JOB_STATE_SUCCEEDED && jobStatus.result !== null) {
      setPatternSummary(jobStatus.result);
      setPatternStatusFilters({});
      setPatternSort(null);
      resetPatternViewState();
      setExpandedSections(expandedSectionsByDefault());
      setStatusMessage(null);
      return;
    }
    if (jobStatus.state === JOB_STATE_FAILED) {
      setErrorMessage(jobStatus.error ?? "The analysis failed.");
      setStatusMessage(null);
      return;
    }
    if (jobStatus.state === JOB_STATE_CANCELLED) {
      setStatusMessage("The analysis was cancelled. No results were kept.");
    }
  }

  async function startPatternAnalysis(
    file: File,
    missingValueMarkers: Record<string, string[]>,
    worksheetName: string,
    identifierColumnToUse: string,
    analysisColumnsToUse: string[],
  ) {
    setStatusMessage("Starting the analysis...");
    setStartingCompletenessAnalysis(true);

    const startedRequest = beginRequest();
    try {
      const jobStatus = await startAnalysisJob(
        file,
        missingValueMarkers,
        worksheetName,
        identifierColumnToUse,
        analysisColumnsToUse,
        highCardinalityAcknowledged,
      );
      if (!isCurrentRequest(startedRequest)) {
        return;
      }
      // Results of an earlier analysis never survive into a newer one.
      setPatternSummary(null);
      setPatternSort(null);
      setPatternStatusFilters({});
      setShowAllPatterns(false);
      handleCompletenessJobStatusChanged(jobStatus);
      if (jobStatus.state !== JOB_STATE_RUNNING) {
        applyFinishedAnalysis(jobStatus);
      }
      setStatusMessage(null);
    } catch (error) {
      if (isCurrentRequest(startedRequest)) {
        handleRequestFailure(error);
      }
    } finally {
      setStartingCompletenessAnalysis(false);
    }
  }

  function resetImportedFileState() {
    // A new import or worksheet starts from a clean state: no selection,
    // marker setting, or result of a previous dataset may survive into it.
    setColumnNames([]);
    setSummary(null);
    setColumnCompletenessSort(null);
    setMissingMarkersText({});
    setAppliedMissingValueMarkers({});
    setIdentifierColumn("");
    setAnalysisColumns([]);
    setPatternSummary(null);
    setPatternSort(null);
    setHiddenAnalysisColumns([]);
    setAnalysisJob(null);
    dataAnalysisJobsRef.current = { formal_terms: null, group_data: null };
    setDataAnalysisJobs({ formal_terms: null, group_data: null });
    setStartingDataAnalyses({ formal_terms: false, group_data: false });
    setAnalysisNotices([]);
    setCancelingJobIds({});
    setCancelingCompletenessJob(false);
    setStartingCompletenessAnalysis(false);
    setHighCardinalityAcknowledged(false);
    setPatternStatusFilters({});
    setExpandedSections(expandedSectionsByDefault());
    setActiveAnalysisMode("choose");
    setAnalysisMenuOpen(false);
    resetPatternViewState();
    setErrorMessage(null);
  }

  async function loadImportedColumns(file: File, worksheetName: string | null): Promise<boolean> {
    setStatusMessage(worksheetName === null ? "Reading the file..." : "Reading the worksheet...");

    const startedRequest = beginRequest();
    try {
      const importResponse = await importFile(file, worksheetName);
      if (!isCurrentRequest(startedRequest)) {
        return false;
      }
      setSheetNames(importResponse.sheets);
      setWorksheetRowLimit(importResponse.worksheet_row_limit);
      if (importResponse.columns === null) {
        // A workbook is analyzed through exactly one worksheet, chosen next.
        setStatusMessage("Choose one worksheet of this workbook to analyze.");
        return false;
      }
      setColumnNames(importResponse.columns);
      setAnalysisMenuOpen(true);
      return true;
    } catch (error) {
      if (isCurrentRequest(startedRequest)) {
        handleRequestFailure(error);
      }
      return false;
    }
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow choosing the same file again after a failed or repeated import.
    event.target.value = "";
    if (!file) {
      return;
    }

    setSelectedFile(file);
    setSelectedFileName(file.name);
    setDatasetVersion((previousVersion) => previousVersion + 1);
    setSheetNames([]);
    setSelectedSheet("");
    setWorksheetRowLimit(null);
    resetImportedFileState();

    const columnsReady = await loadImportedColumns(file, null);
    if (!columnsReady) {
      return;
    }

    await loadColumnCompleteness(file, {}, "");
  }

  async function handleWorksheetSelected(event: ChangeEvent<HTMLSelectElement>) {
    const worksheetName = event.target.value;
    setSelectedSheet(worksheetName);
    setDatasetVersion((previousVersion) => previousVersion + 1);
    if (!selectedFile || worksheetName.length === 0) {
      return;
    }

    resetImportedFileState();

    const columnsReady = await loadImportedColumns(selectedFile, worksheetName);
    if (!columnsReady) {
      return;
    }

    await loadColumnCompleteness(selectedFile, {}, worksheetName);
  }

  function handleMissingMarkersChanged(columnName: string, markersText: string) {
    setMissingMarkersText((previousText) => {
      return { ...previousText, [columnName]: markersText };
    });
  }

  async function handleMissingRulesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      return;
    }

    setErrorMessage(null);
    // The Missing Value rules changed, so any earlier pattern summary no
    // longer describes the current rules.
    setPatternSummary(null);
    const missingValueMarkers = parseMissingValueMarkers(missingMarkersText);
    const resetAnalysisResults =
      JSON.stringify(missingValueMarkers) !== JSON.stringify(appliedMissingValueMarkers);
    await loadColumnCompleteness(
      selectedFile,
      missingValueMarkers,
      selectedSheet,
      resetAnalysisResults,
    );
  }

  function handleIdentifierColumnChanged(event: ChangeEvent<HTMLSelectElement>) {
    const nextIdentifierColumn = event.target.value;
    setIdentifierColumn(nextIdentifierColumn);
    setAnalysisColumns((previousColumns) =>
      withoutIdentifierColumn(previousColumns, nextIdentifierColumn),
    );
    setPatternSummary(null);
    setAnalysisNotices((currentNotices) =>
      currentNotices.filter((notice) => notice.mode !== "completeness"),
    );
  }

  function handleAnalysisColumnToggled(columnName: string) {
    setAnalysisColumns((previousColumns) => {
      if (previousColumns.includes(columnName)) {
        return previousColumns.filter((selectedName) => selectedName !== columnName);
      }
      return [...previousColumns, columnName];
    });
    setPatternSummary(null);
    setAnalysisNotices((currentNotices) =>
      currentNotices.filter((notice) => notice.mode !== "completeness"),
    );
  }

  async function handlePatternSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      return;
    }

    setErrorMessage(null);
    await startPatternAnalysis(
      selectedFile,
      appliedMissingValueMarkers,
      selectedSheet,
      identifierColumn,
      columnsToAnalyze,
    );
  }

  function handleHighCardinalityAcknowledgementChanged(event: ChangeEvent<HTMLInputElement>) {
    setHighCardinalityAcknowledged(event.target.checked);
  }

  async function handleCancelAnalysis() {
    if (analysisJob === null) {
      return;
    }

    setCancelingCompletenessJob(true);
    try {
      const jobStatus = await cancelAnalysisJob(analysisJob.job_id);
      handleCompletenessJobStatusChanged(jobStatus);
      applyFinishedAnalysis(jobStatus);
    } catch (error) {
      handleRequestFailure(error);
    } finally {
      setCancelingCompletenessJob(false);
    }
  }

  async function handleCancelDataAnalysis(
    analysisKind: DataAnalysisKind,
    jobId: string,
  ) {
    setCancelingJobIds((currentJobs) => ({ ...currentJobs, [jobId]: true }));
    try {
      const jobStatus = await cancelDataAnalysisJob(jobId);
      handleDataAnalysisJobStatusChanged(analysisKind, jobStatus);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The analysis could not be cancelled. Check the local API and retry.",
      );
    } finally {
      setCancelingJobIds((currentJobs) => {
        const nextJobs = { ...currentJobs };
        delete nextJobs[jobId];
        return nextJobs;
      });
    }
  }

  function handlePatternFilterChanged(columnName: string, status: string) {
    setPatternStatusFilters((previousFilters) => {
      return { ...previousFilters, [columnName]: status };
    });
    resetPatternViewState();
  }

  function handleClearPatternFilters() {
    setPatternStatusFilters({});
    resetPatternViewState();
  }

  function handleShowAllPatternsToggled() {
    clearPatternDetails();
    setShowAllPatterns((previousShowAll) => !previousShowAll);
  }

  function handlePatternPreviewOpened(patternIndex: number) {
    setSelectedPatternPage(1);
    setPatternRowsPage(null);
    setPatternRowsLoading(true);
    setPatternRowsError(null);
    setPatternRowsExportLoading(false);
    setPatternRowsExportError(null);
    setPatternRowsExportSuccess(null);
    setSelectedPatternIndex(patternIndex);
  }

  function handlePatternPreviewClosed() {
    clearPatternDetails();
  }

  function handlePatternRowsPageChanged(page: number) {
    setSelectedPatternPage(page);
    setPatternRowsPage(null);
    setPatternRowsLoading(true);
    setPatternRowsError(null);
  }

  function handlePatternRowsRetry() {
    setPatternRowsRetryNumber((previousRetryNumber) => previousRetryNumber + 1);
    setPatternRowsPage(null);
    setPatternRowsLoading(true);
    setPatternRowsError(null);
  }

  async function handlePatternRowsExport() {
    if (analysisJob === null || selectedPatternIndex === null) {
      setPatternRowsExportError(
        "The analysis job is no longer available. Run the analysis again to export these rows.",
      );
      return;
    }

    setPatternRowsExportLoading(true);
    setPatternRowsExportError(null);
    setPatternRowsExportSuccess(null);
    try {
      await downloadPatternRowsCsv(analysisJob.job_id, selectedPatternIndex);
      setPatternRowsExportSuccess("CSV download started.");
    } catch (error: unknown) {
      setPatternRowsExportSuccess(null);
      setPatternRowsExportError(
        error instanceof PatternRowsRequestError
          ? error.message
          : "The CSV could not be downloaded. Check that the local API is running and retry.",
      );
    } finally {
      setPatternRowsExportLoading(false);
    }
  }

  function handleVisibleAnalysisColumnsChanged(visibleColumns: string[]) {
    if (patternSummary === null) {
      return;
    }

    const visibleColumnSet = new Set(visibleColumns);
    const currentAnalysisColumnSet = new Set(patternSummary.analysis_columns);

    setPatternSort((currentSort) => {
      if (currentSort === null || !currentSort.key.startsWith("status:")) {
        return currentSort;
      }

      const sortedColumnIndex = Number(currentSort.key.slice("status:".length));
      const sortedColumnName = patternSummary.analysis_columns[sortedColumnIndex];
      return sortedColumnName !== undefined && !visibleColumnSet.has(sortedColumnName)
        ? null
        : currentSort;
    });

    setHiddenAnalysisColumns((previousHiddenColumns) => {
      const hiddenColumnsFromOtherAnalyses = previousHiddenColumns.filter(
        (columnName) => !currentAnalysisColumnSet.has(columnName),
      );
      const hiddenColumnsInCurrentAnalysis = patternSummary.analysis_columns.filter(
        (columnName) => !visibleColumnSet.has(columnName),
      );

      return [...hiddenColumnsFromOtherAnalyses, ...hiddenColumnsInCurrentAnalysis];
    });
  }

  // While an analysis runs, keep reading its status so the user sees progress
  // and the finished summary without refreshing. The poll follows the job
  // identity and its running state only; changes inside the job arrive through
  // the polling itself.
  const runningAnalysisJobId = analysisJob?.job_id ?? null;
  const analysisRunning = analysisJob !== null && analysisJob.state === JOB_STATE_RUNNING;
  const selectedJobId = analysisJob?.job_id ?? null;
  const selectedPattern =
    selectedPatternIndex !== null ? (patternSummary?.patterns[selectedPatternIndex] ?? null) : null;
  const patternRowsDisplayError =
    selectedPatternIndex !== null && selectedJobId === null
      ? "The analysis job is no longer available. Run the analysis again to view its Input Rows."
      : patternRowsError;
  const patternRowsDisplayLoading = selectedJobId !== null && patternRowsLoading;

  useEffect(() => {
    if (runningAnalysisJobId === null || !analysisRunning) {
      return;
    }

    const pollTimer = window.setInterval(async () => {
      try {
        const jobStatus = await fetchAnalysisJobStatus(runningAnalysisJobId);
        handleCompletenessJobStatusChanged(jobStatus);
        applyFinishedAnalysis(jobStatus);
      } catch (error) {
        handleRequestFailure(error);
      }
    }, JOB_POLL_INTERVAL_MILLISECONDS);

    return () => window.clearInterval(pollTimer);
  }, [runningAnalysisJobId, analysisRunning]);

  useEffect(() => {
    if (selectedPatternIndex === null || selectedPattern === null) {
      return;
    }

    if (selectedJobId === null) {
      return;
    }

    const controller = new AbortController();

    void fetchPatternRowsPage(
      selectedJobId,
      selectedPatternIndex,
      selectedPatternPage,
      controller.signal,
    )
      .then((rowsPage) => {
        if (controller.signal.aborted) {
          return;
        }
        setPatternRowsPage(rowsPage);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setPatternRowsError(
          error instanceof PatternRowsRequestError
            ? error.message
            : "The local API could not retrieve these Input Rows. Check that it is running and retry.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPatternRowsLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    selectedJobId,
    selectedPatternIndex,
    selectedPattern,
    selectedPatternPage,
    patternRowsRetryNumber,
  ]);

  const columnsToAnalyze = withoutIdentifierColumn(analysisColumns, identifierColumn);
  const highCardinalityWarningRequired =
    columnsToAnalyze.length >= HIGH_CARDINALITY_COLUMN_THRESHOLD;
  const selectedFileIsCsv = selectedFile?.name.toLowerCase().endsWith(".csv") ?? false;
  const selectedFileSizeMib = selectedFile ? selectedFile.size / (1024 * 1024) : 0;
  const csvUploadExceedsBenchmarkSize =
    selectedFileIsCsv && selectedFile !== null && csvExceedsBenchmarkSize(selectedFile.size);
  const selectedColumnCountExceedsBenchmark = selectedColumnsExceedBenchmark(
    columnsToAnalyze.length,
  );
  const computeButtonDisabled =
    statusMessage !== null ||
    columnsToAnalyze.length === 0 ||
    analysisRunning ||
    (highCardinalityWarningRequired && !highCardinalityAcknowledged);
  const matchedPatterns = useMemo(() => {
    if (patternSummary === null) {
      return [];
    }
    return patternsMatchingFilters(
      patternSummary.patterns,
      patternSummary.analysis_columns,
      patternStatusFilters,
    );
  }, [patternSummary, patternStatusFilters]);
  const sortedMatchedPatterns = useMemo(
    () => sortRows(matchedPatterns, patternSort, comparePatternRows),
    [matchedPatterns, patternSort],
  );
  const displayedPatterns = useMemo(
    () =>
      showAllPatterns
        ? sortedMatchedPatterns
        : sortedMatchedPatterns.slice(0, MOST_COMMON_PATTERNS_SHOWN),
    [showAllPatterns, sortedMatchedPatterns],
  );
  const canonicalPatternIndexes = useMemo(() => {
    const patternIndexes = new Map<CompletenessPattern, number>();
    patternSummary?.patterns.forEach((pattern, patternIndex) => {
      patternIndexes.set(pattern, patternIndex);
    });
    return patternIndexes;
  }, [patternSummary]);
  const displayedColumnCompletenessRows = useMemo(() => {
    if (summary === null) {
      return [];
    }
    return sortRows(summary.columns, columnCompletenessSort, compareColumnCompletenessRows);
  }, [columnCompletenessSort, summary]);
  const hiddenAnalysisColumnSet = new Set(hiddenAnalysisColumns);
  const visibleAnalysisColumnSet = new Set(
    patternSummary?.analysis_columns.filter(
      (columnName) => !hiddenAnalysisColumnSet.has(columnName),
    ) ?? [],
  );
  const visibleAnalysisColumns =
    patternSummary?.analysis_columns.filter((columnName) => visibleAnalysisColumnSet.has(columnName)) ??
    [];
  const visiblePatternColumns =
    patternSummary?.analysis_columns
      .map((columnName, columnIndex) => ({ columnName, columnIndex }))
      .filter(({ columnName }) => visibleAnalysisColumnSet.has(columnName)) ?? [];
  const patternFiltersActive = Object.values(patternStatusFilters).some(
    (status) => status !== PATTERN_FILTER_ANY,
  );
  const patternSortDescription = describePatternSort(
    patternSort,
    patternSummary?.analysis_columns ?? [],
  );
  const sourceSectionSummary = selectedFileName
    ? `${selectedFileName}${selectedSheet ? ` · ${selectedSheet}` : ""} · ${columnNames.length} columns`
    : "Choose a CSV or XLSX file";
  const columnCompletenessSectionSummary = summary
    ? `${summary.input_rows.toLocaleString()} rows · ${summary.columns.length} columns`
    : "";
  const analysisSetupSectionSummary = `${identifierColumn || "No identifier"} · ${columnsToAnalyze.length} columns selected`;
  const patternResultsSectionSummary = patternSummary
    ? `${patternSummary.patterns.length} patterns · ${patternSummary.input_rows.toLocaleString()} rows`
    : "";
  const currentModeLabel =
    activeAnalysisMode === "choose"
      ? columnNames.length > 0
        ? "Choose analysis"
        : "No file loaded"
      : analysisModeLabel(activeAnalysisMode);
  const sharedAnalysisJobs: SharedAnalysisJob[] = [];

  if (analysisJob?.state === JOB_STATE_RUNNING) {
    sharedAnalysisJobs.push({
      jobId: analysisJob.job_id,
      mode: "completeness",
      stage: analysisJob.stage ?? "Analyzing input rows",
      elapsedSeconds: analysisJob.elapsed_seconds,
      progress:
        analysisJob.progress === null
          ? null
          : {
              itemsDone: analysisJob.progress.rows_done,
              itemsTotal: analysisJob.progress.rows_total,
              label: "Input Rows",
            },
      cancelable: true,
    });
  } else if (startingCompletenessAnalysis) {
    sharedAnalysisJobs.push({
      jobId: "starting-completeness",
      mode: "completeness",
      stage: "Starting analysis",
      elapsedSeconds: 0,
      progress: null,
      cancelable: false,
    });
  }

  for (const analysisKind of ["formal_terms", "group_data"] as const) {
    const job = dataAnalysisJobs[analysisKind];
    if (job?.state === JOB_STATE_RUNNING) {
      sharedAnalysisJobs.push({
        jobId: job.job_id,
        mode: analysisKind,
        stage: job.stage ?? "Analyzing selected data",
        elapsedSeconds: job.elapsed_seconds,
        progress:
          job.progress === null
            ? null
            : {
                itemsDone: job.progress.items_done,
                itemsTotal: job.progress.items_total,
                label: analysisKind === "formal_terms" ? "selected values" : "Input Rows",
              },
        cancelable: true,
      });
    } else if (startingDataAnalyses[analysisKind]) {
      sharedAnalysisJobs.push({
        jobId: `starting-${analysisKind}`,
        mode: analysisKind,
        stage: "Uploading the file and starting analysis",
        elapsedSeconds: 0,
        progress: null,
        cancelable: false,
      });
    }
  }

  return (
    <main className="page">
      <section className="card">
        <header className="top-navbar">
          <div className="navbar-start">
            <div className="analysis-navigation">
              <button
                type="button"
                className="secondary-button analysis-menu-button"
                aria-label="Analysis menu"
                aria-expanded={analysisMenuOpen}
                aria-controls="analysis-mode-navigation"
                disabled={columnNames.length === 0}
                onClick={() => setAnalysisMenuOpen((isOpen) => !isOpen)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <nav
                id="analysis-mode-navigation"
                className="analysis-mode-navigation"
                aria-label="Analysis modes"
                hidden={!analysisMenuOpen}
              >
                <button
                  type="button"
                  aria-current={activeAnalysisMode === "completeness" ? "page" : undefined}
                  onClick={() => handleAnalysisModeSelected("completeness")}
                >
                  Completeness Patterns
                </button>
                <button
                  type="button"
                  aria-current={activeAnalysisMode === "formal_terms" ? "page" : undefined}
                  onClick={() => handleAnalysisModeSelected("formal_terms")}
                >
                  Formal Terms
                </button>
                <button
                  type="button"
                  aria-current={activeAnalysisMode === "group_data" ? "page" : undefined}
                  onClick={() => handleAnalysisModeSelected("group_data")}
                >
                  Group Data
                </button>
              </nav>
            </div>
            <div className="navbar-brand">
              <h1 className="navbar-app-name">PatternX Data Profiler</h1>
              <span className="navbar-current-mode">{currentModeLabel}</span>
            </div>
          </div>
        </header>

        {sharedAnalysisJobs.length > 0 || analysisNotices.length > 0 ? (
          <section className="global-analysis-status" aria-label="Analysis status">
            {sharedAnalysisJobs.map((job) => {
              const canceling =
                job.mode === "completeness"
                  ? cancelingCompletenessJob
                  : cancelingJobIds[job.jobId] === true;

              return (
                <article className="global-job-entry" key={job.jobId}>
                  <div className="global-job-heading">
                    <div className="global-job-copy">
                      <p className="global-job-mode">{analysisModeLabel(job.mode)}</p>
                      <p className="status-line">
                        <span className="loading-spinner" aria-hidden="true" />
                        {job.stage} · {job.elapsedSeconds.toFixed(1)} seconds elapsed.
                      </p>
                    </div>
                    {job.cancelable && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={canceling}
                        onClick={() => {
                          if (job.mode === "completeness") {
                            void handleCancelAnalysis();
                          } else {
                            void handleCancelDataAnalysis(job.mode, job.jobId);
                          }
                        }}
                      >
                        {canceling ? "Cancelling..." : "Cancel"}
                      </button>
                    )}
                  </div>
                  {job.progress !== null && (
                    <div className="progress-track">
                      <progress
                        className="analysis-progress"
                        value={job.progress.itemsDone}
                        max={job.progress.itemsTotal}
                      />
                      <p className="hint-text">
                        {job.progress.itemsDone.toLocaleString()} of{" "}
                        {job.progress.itemsTotal.toLocaleString()} {job.progress.label} processed.
                      </p>
                    </div>
                  )}
                </article>
              );
            })}
            {analysisNotices.map((notice) => (
              <article
                className={`global-analysis-notice global-analysis-notice-${notice.outcome}`}
                key={notice.jobId}
                role={notice.outcome === "failed" ? "alert" : "status"}
              >
                <p>
                  <strong>{analysisModeLabel(notice.mode)}:</strong>{" "}
                  {notice.outcome === "succeeded"
                    ? "analysis completed."
                    : `analysis failed. ${notice.message ?? "Review the error and try again."}`}
                </p>
                <div className="global-notice-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => handleAnalysisNoticeOpened(notice)}
                  >
                    {notice.outcome === "succeeded" ? "View results" : "Open analysis"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    aria-label={`Dismiss ${analysisModeLabel(notice.mode)} notice`}
                    onClick={() => handleAnalysisNoticeDismissed(notice.jobId)}
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {statusMessage && statusMessage !== "Starting the analysis..." && (
          <p className="status-line" role="status">
            {statusMessage.startsWith("Reading") ||
            statusMessage.startsWith("Computing") ||
            statusMessage.startsWith("Starting") ? (
              <span className="loading-spinner" aria-hidden="true" />
            ) : null}
            {statusMessage}
          </p>
        )}
        {errorMessage && <p className="error-message" role="alert">{errorMessage}</p>}

        <p className="lead app-introduction">
          Profile a CSV or XLSX file locally. Your file stays on this machine and is deleted after it
          has been read.
        </p>

        <CollapsibleSection
          title="File and Worksheet"
          summary={sourceSectionSummary}
          open={expandedSections.source}
          onOpenChange={(open) => handleSectionOpenChanged("source", open)}
        >
          <div className="section-stack">
            <label className="file-picker">
              <span>CSV or XLSX file</span>
              <input type="file" accept=".csv,.xlsx" onChange={handleFileSelected} />
            </label>

            {sheetNames.length > 0 && (
              <label className="file-picker">
                <span>Worksheet</span>
                <select value={selectedSheet} onChange={handleWorksheetSelected}>
                  <option value="">Choose one worksheet</option>
                  {sheetNames.map((sheetName, sheetIndex) => (
                    <option key={sheetIndex} value={sheetName}>
                      {sheetName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {worksheetRowLimit !== null && (
              <details className="help-details">
                <summary>More details</summary>
                <p className="hint-text">
                  Excel&apos;s file format allows at most {worksheetRowLimit.toLocaleString()} worksheet
                  rows, including the header. Every row of the chosen worksheet is read; nothing is
                  truncated.
                </p>
              </details>
            )}
            {csvUploadExceedsBenchmarkSize && (
              <div className="warning-panel" role="note">
                <p className="warning-heading">File size is outside the measured range</p>
                <p className="hint-text">
                  This file is {selectedFileSizeMib.toFixed(2)} MiB. Runtime beyond measured workloads
                  is unmeasured; this warning does not limit the analysis.
                </p>
                <details className="help-details">
                  <summary>More details</summary>
                  <p className="hint-text">
                    The largest recorded synthetic CSV benchmark was{" "}
                    {MAX_BENCHMARKED_FILE_SIZE_MIB.toFixed(2)} MiB (2,000,000 rows, 24 columns, and 21
                    analyzed columns). Files are not truncated.
                  </p>
                </details>
              </div>
            )}

            {columnNames.length > 0 && (
              <div className="source-columns">
                <h3>Columns in this file ({columnNames.length})</h3>
                <ul className="column-list">
                  {columnNames.map((columnName, columnIndex) => (
                    <li key={columnIndex} className="column-item">
                      {columnName}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {summary && (
          <CollapsibleSection
            title="Missing Value Settings"
            summary={`${Object.values(appliedMissingValueMarkers).reduce(
              (markerCount, markers) => markerCount + markers.length,
              0,
            )} additional markers`}
            open={expandedSections.missingValueSettings}
            onOpenChange={(open) => handleSectionOpenChanged("missingValueSettings", open)}
          >
            <p className="status-line">
              Set optional missing-value markers once for all three analysis modes. Null, empty, and
              whitespace-only values are missing by default; zero is present.
            </p>
            <details className="help-details">
              <summary>More details</summary>
              <p className="hint-text">
                Additional markers are matched after trimming surrounding spaces and without regard
                to letter case. Changing these rules clears existing results so every mode uses the
                same rules.
              </p>
            </details>

            <form className="summary-form" onSubmit={handleMissingRulesSubmit}>
              <div className="summary-table-frame">
                <table className="summary-table missing-value-settings-table">
                  <thead>
                    <tr>
                      <th scope="col">Column</th>
                      <th scope="col">Additional missing value markers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columnNames.map((columnName, columnIndex) => (
                      <tr key={columnIndex}>
                        <th scope="row">{columnName}</th>
                        <td>
                          <input
                            className="marker-input"
                            type="text"
                            value={missingMarkersText[columnName] ?? ""}
                            placeholder="N/A, -"
                            aria-label={`Additional missing value markers for ${columnName}`}
                            onChange={(event) =>
                              handleMissingMarkersChanged(columnName, event.target.value)
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="summary-actions">
                <button type="submit" className="primary-button" disabled={statusMessage !== null}>
                  Apply Missing Value rules
                </button>
              </div>
            </form>
          </CollapsibleSection>
        )}

        {columnNames.length > 0 && activeAnalysisMode === "choose" && (
          <section className="analysis-mode-chooser" aria-labelledby="analysis-mode-chooser-title">
            <h2 id="analysis-mode-chooser-title">Choose an analysis</h2>
            <p className="lead">Choose a mode from the analysis menu in the top navigation.</p>
          </section>
        )}

        <div
          className="analysis-mode-content completeness-mode-content"
          hidden={activeAnalysisMode !== "completeness"}
        >
        {summary && (
          <CollapsibleSection
            title="Column Completeness Summary"
            summary={columnCompletenessSectionSummary}
            open={expandedSections.columnCompleteness}
            onOpenChange={(open) => handleSectionOpenChanged("columnCompleteness", open)}
          >
            <p className="status-line">
              {summary.input_rows.toLocaleString()} Input Rows. Null, empty, and whitespace-only
              values count as missing; zero counts as present.
            </p>
            <p className="hint-text">
              This descriptive summary flags no value as a problem. Missing Value rules can be
              reviewed and updated in the shared settings above.
            </p>
            <div
              className="summary-table-frame"
              role="region"
              aria-label="Column Completeness Summary. Scroll to view all columns."
              tabIndex={0}
            >
              <table className="summary-table">
                <thead>
                  <tr>
                    <SortableHeader
                      label="Column"
                      sortKey="name"
                      sortState={columnCompletenessSort}
                      onSort={handleColumnCompletenessSortChanged}
                    />
                    <SortableHeader
                      label="Input Rows with a value"
                      sortKey="present_count"
                      sortState={columnCompletenessSort}
                      onSort={handleColumnCompletenessSortChanged}
                    />
                    <SortableHeader
                      label="Input Rows missing a value"
                      sortKey="missing_count"
                      sortState={columnCompletenessSort}
                      onSort={handleColumnCompletenessSortChanged}
                    />
                  </tr>
                </thead>
                <tbody>
                  {displayedColumnCompletenessRows.map((column, columnIndex) => (
                    <tr key={columnIndex}>
                      <th scope="row">{column.name}</th>
                      <td>
                        {formatCountAndShare(
                          column.present_count,
                          column.present_share,
                          summary.input_rows,
                        )}
                      </td>
                      <td>
                        {formatCountAndShare(
                          column.missing_count,
                          column.missing_share,
                          summary.input_rows,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        )}

        {summary && (
          <>
            <CollapsibleSection
              title="Completeness Patterns Setup"
              summary={analysisSetupSectionSummary}
              open={expandedSections.analysisSetup}
              onOpenChange={(open) => handleSectionOpenChanged("analysisSetup", open)}
            >
            <p className="status-line">
              Choose an optional Identifier Column and select which columns to analyze.
            </p>
            <details className="help-details">
              <summary>More details</summary>
              <p className="hint-text">
                The Identifier Column is for display only. It does not affect Input Row counts or
                join the analysis. Rows with the same Completeness Pattern are grouped with their
                exact count and share.
              </p>
            </details>

            <form className="summary-form" onSubmit={handlePatternSubmit}>
              <div className="selection-panel">
                <label className="selection-field">
                  <span>Identifier Column (optional)</span>
                    <select
                      value={identifierColumn}
                      disabled={analysisRunning}
                      onChange={handleIdentifierColumnChanged}
                    >
                    <option value="">No identifier column</option>
                    {summary.columns.map((column, columnIndex) => (
                      <option key={columnIndex} value={column.name}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className="analysis-fieldset" disabled={analysisRunning}>
                  <legend>Columns to analyze</legend>
                  <div className="analysis-options">
                    {summary.columns.map((column, columnIndex) => (
                      <label
                        key={columnIndex}
                        className={
                          column.name === identifierColumn
                            ? "analysis-option analysis-option-identifier"
                            : "analysis-option"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={analysisColumns.includes(column.name)}
                          disabled={column.name === identifierColumn}
                          onChange={() => handleAnalysisColumnToggled(column.name)}
                        />
                        <span>{column.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="hint-text">
                    {identifierColumn.length > 0
                      ? `${identifierColumn} is used only to display Input Rows.`
                      : "The selected columns define one Completeness Pattern per Input Row."}
                  </p>
                  {selectedColumnCountExceedsBenchmark && (
                    <p className="hint-text">
                      This selection uses {columnsToAnalyze.length} columns; the largest recorded
                      benchmark used {MAX_BENCHMARKED_SELECTED_COLUMNS}. Runtime and memory use for
                      wider selections are unmeasured. This warning does not limit or truncate the
                      exact results.
                    </p>
                  )}
                </fieldset>
              </div>

              {highCardinalityWarningRequired && (
                <div className="warning-panel">
                  <p className="warning-heading">This analysis has a very large pattern space</p>
                  <p className="hint-text">
                    Selecting {columnsToAnalyze.length} columns allows up to{" "}
                    {(2n ** BigInt(columnsToAnalyze.length)).toLocaleString()} distinct Completeness
                    Patterns. Review your selection, then acknowledge this warning before the
                    analysis starts.
                  </p>
                  <label className="acknowledgement-option">
                    <input
                      type="checkbox"
                      checked={highCardinalityAcknowledged}
                      disabled={analysisRunning}
                      onChange={handleHighCardinalityAcknowledgementChanged}
                    />
                    <span>I understand the size of this analysis and want to start it.</span>
                  </label>
                </div>
              )}

              <div className="summary-actions">
                <button type="submit" className="primary-button" disabled={computeButtonDisabled}>
                  Compute Completeness Patterns
                </button>
              </div>
            </form>
            </CollapsibleSection>

            {patternSummary && (
              <CollapsibleSection
                title="Completeness Patterns Results"
                summary={patternResultsSectionSummary}
                open={expandedSections.patternResults}
                onOpenChange={(open) => handleSectionOpenChanged("patternResults", open)}
              >
                <p className="status-line">
                  {patternSummary.input_rows.toLocaleString()} Input Rows ·{" "}
                  {patternSummary.patterns.length} Completeness Patterns ·{" "}
                  {patternSummary.analysis_columns.length} analyzed columns.
                </p>

                <div className="pattern-display-controls">
                  <details className="help-details">
                    <summary>More details</summary>
                    <p className="hint-text">
                      Choose which analyzed columns appear in the pattern summary table. Column
                      visibility only changes the display; filters and analysis use every analyzed
                      column. Pattern details always show all source columns. The Identifier Column
                      is for display only.
                    </p>
                  </details>
                  <ColumnVisibilityPicker
                    columns={patternSummary.analysis_columns}
                    visibleColumns={visibleAnalysisColumns}
                    onVisibleColumnsChanged={handleVisibleAnalysisColumnsChanged}
                  />
                </div>

                <div className="pattern-filters">
                  <p className="filter-heading">Filter the displayed patterns</p>
                  <div className="filter-fields">
                    {patternSummary.analysis_columns.map((columnName, columnIndex) => (
                      <label key={columnIndex} className="filter-field">
                        <span>{columnName}</span>
                        <select
                          value={patternStatusFilters[columnName] ?? PATTERN_FILTER_ANY}
                          aria-label={`Pattern filter for ${columnName}`}
                          onChange={(event) =>
                            handlePatternFilterChanged(columnName, event.target.value)
                          }
                        >
                          <option value={PATTERN_FILTER_ANY}>Any status</option>
                          <option value={PATTERN_STATUS_PRESENT}>Present</option>
                          <option value={PATTERN_STATUS_MISSING}>Missing</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleClearPatternFilters}
                  >
                    Clear filters
                  </button>
                </div>

                <p className="status-line">
                  {describeDisplayedPatterns(
                    matchedPatterns.length,
                    displayedPatterns.length,
                    patternSummary.patterns.length,
                    patternFiltersActive,
                    patternSortDescription,
                  )}
                </p>

                <div
                  className="summary-table-frame pattern-results-frame"
                  role="region"
                  aria-label="Completeness Pattern results table. Scroll to view additional columns."
                  tabIndex={0}
                >
                  <table
                    className="summary-table pattern-results-table"
                    aria-label="Completeness Pattern results"
                  >
                    <thead>
                      <tr>
                        <th className="pattern-action-header" scope="col">
                          Input Row details
                        </th>
                        {visiblePatternColumns.map(({ columnName, columnIndex }) => (
                          <SortableHeader
                            key={columnIndex}
                            label={columnName}
                            sortKey={`status:${columnIndex}`}
                            sortState={patternSort}
                            onSort={handlePatternSortChanged}
                          />
                        ))}
                        <SortableHeader
                          label="Input Rows"
                          sortKey="count"
                          sortState={patternSort}
                          onSort={handlePatternSortChanged}
                        />
                        <SortableHeader
                          label="Share of Input Rows"
                          sortKey="share"
                          sortState={patternSort}
                          onSort={handlePatternSortChanged}
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {displayedPatterns.map((pattern, displayedPatternIndex) => {
                        const canonicalPatternIndex =
                          canonicalPatternIndexes.get(pattern) ?? displayedPatternIndex;

                        return (
                          <tr key={canonicalPatternIndex}>
                            <td className="pattern-action-cell">
                              <button
                                type="button"
                                className="secondary-button"
                                aria-haspopup="dialog"
                                aria-label={`View Input Rows for pattern ${canonicalPatternIndex + 1}`}
                                onClick={() => handlePatternPreviewOpened(canonicalPatternIndex)}
                              >
                                View rows
                              </button>
                            </td>
                            {visiblePatternColumns.map(({ columnIndex }) => (
                              <td key={columnIndex}>
                                <PatternStatusLabel status={pattern.statuses[columnIndex]} />
                              </td>
                            ))}
                            <td>{pattern.count}</td>
                            <td>{formatShare(pattern.share)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {matchedPatterns.length > MOST_COMMON_PATTERNS_SHOWN && (
                  <div className="summary-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleShowAllPatternsToggled}
                    >
                      {showAllPatterns ? "Show the most common patterns only" : "Show all patterns"}
                    </button>
                    <p className="hint-text">
                      Counts remain exact; this control changes only how many patterns are shown.
                    </p>
                  </div>
                )}

                {analysisJob !== null && analysisJob.state === JOB_STATE_SUCCEEDED && (
                  <div className="summary-actions">
                    <a
                      className="download-link"
                      href={`/api/analysis-jobs/${analysisJob.job_id}/exports/column_completeness.csv`}
                      download
                    >
                      Download column_completeness.csv
                    </a>
                    <a
                      className="download-link"
                      href={`/api/analysis-jobs/${analysisJob.job_id}/exports/pattern_summary.csv`}
                      download
                    >
                      Download pattern_summary.csv
                    </a>
                    <p className="hint-text">
                      Both downloads contain aggregate counts only, not Input Rows or row-level
                      details.
                    </p>
                  </div>
                )}
              </CollapsibleSection>
            )}
          </>
        )}
        </div>

        {selectedFile !== null && columnNames.length > 0 && (
          <DataAnalysisPanel
            key={`formal-terms-${datasetVersion}-${JSON.stringify(appliedMissingValueMarkers)}`}
            analysisKind="formal_terms"
            selectedFile={selectedFile}
            worksheetName={selectedSheet}
            columnNames={columnNames}
            missingValueMarkers={appliedMissingValueMarkers}
            hidden={activeAnalysisMode !== "formal_terms"}
            onJobStatusChanged={onFormalTermsJobStatusChanged}
            onAnalysisStartingChanged={handleDataAnalysisStartingChanged}
            onError={setErrorMessage}
          />
        )}

        {selectedFile !== null && columnNames.length > 0 && (
          <DataAnalysisPanel
            key={`group-data-${datasetVersion}-${JSON.stringify(appliedMissingValueMarkers)}`}
            analysisKind="group_data"
            selectedFile={selectedFile}
            worksheetName={selectedSheet}
            columnNames={columnNames}
            missingValueMarkers={appliedMissingValueMarkers}
            hidden={activeAnalysisMode !== "group_data"}
            onJobStatusChanged={onGroupDataJobStatusChanged}
            onAnalysisStartingChanged={handleDataAnalysisStartingChanged}
            onError={setErrorMessage}
          />
        )}

        {activeAnalysisMode === "completeness" && patternSummary !== null && selectedPattern !== null && (
          <PatternRowsDialog
            patternCount={selectedPattern.count}
            page={patternRowsPage}
            requestedPage={selectedPatternPage}
            loading={patternRowsDisplayLoading}
            error={patternRowsDisplayError}
            onPageChange={handlePatternRowsPageChanged}
            onRetry={handlePatternRowsRetry}
            exportLoading={patternRowsExportLoading}
            exportError={patternRowsExportError}
            exportSuccess={patternRowsExportSuccess}
            onExport={handlePatternRowsExport}
            onClose={handlePatternPreviewClosed}
          />
        )}
      </section>
    </main>
  );
}

export default App;
