import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import "./App.css";

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

interface CompletenessPattern {
  statuses: string[];
  count: number;
  share: number;
}

interface PatternSummary {
  input_rows: number;
  identifier_column: string | null;
  analysis_columns: string[];
  patterns: CompletenessPattern[];
}

interface ImportResponse {
  columns: string[];
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

async function importColumnNames(file: File): Promise<string[]> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/imports", { method: "POST", body: formData });
  const responseBody = await readResponseBody<ImportResponse>(
    response,
    "The file could not be imported.",
  );

  return responseBody.columns;
}

async function fetchColumnCompleteness(
  file: File,
  missingValueMarkers: Record<string, string[]>,
): Promise<ColumnCompletenessSummary> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("missing_markers", JSON.stringify(missingValueMarkers));

  const response = await fetch("/api/column-completeness", { method: "POST", body: formData });
  return await readResponseBody<ColumnCompletenessSummary>(
    response,
    "The summary could not be computed.",
  );
}

async function fetchPatternSummary(
  file: File,
  missingValueMarkers: Record<string, string[]>,
  identifierColumn: string,
  analysisColumns: string[],
): Promise<PatternSummary> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("missing_markers", JSON.stringify(missingValueMarkers));
  if (identifierColumn.length > 0) {
    formData.append("identifier_column", identifierColumn);
  }
  formData.append("analysis_columns", JSON.stringify(analysisColumns));

  const response = await fetch("/api/pattern-summary", { method: "POST", body: formData });
  return await readResponseBody<PatternSummary>(
    response,
    "The pattern summary could not be computed.",
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
const PATTERN_STATUS_PRESENT = "present";
const PATTERN_STATUS_MISSING = "missing";
const MOST_COMMON_PATTERNS_SHOWN = 10;

function withoutIdentifierColumn(
  analysisColumns: string[],
  identifierColumn: string,
): string[] {
  // The Identifier Column never joins the pattern analysis, so it is dropped
  // wherever the columns to analyze are decided.
  return analysisColumns.filter((columnName) => columnName !== identifierColumn);
}

function patternStatusClass(status: string): string {
  if (status === PATTERN_STATUS_PRESENT) {
    return "pattern-status pattern-status-present";
  }
  return "pattern-status pattern-status-missing";
}

function patternStatusLabel(status: string): string {
  if (status === PATTERN_STATUS_PRESENT) {
    return "Present";
  }
  return "Missing";
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
): string {
  if (matchedCount === 0) {
    return `No observed Completeness Pattern matches the current filter. ${totalCount} patterns were observed in total.`;
  }
  if (filtersActive) {
    return `${matchedCount} of ${totalCount} observed Completeness Patterns match the filter. Showing ${shownCount} of them, most common first.`;
  }
  if (totalCount > shownCount) {
    return `Showing the ${shownCount} most common of ${totalCount} observed Completeness Patterns. Every observed pattern is counted with its exact count and share of Input Rows.`;
  }
  return `Showing all ${totalCount} observed Completeness Patterns with their exact counts and shares of Input Rows.`;
}

function formatCountAndShare(count: number, share: number, inputRows: number): string {
  return `${count} of ${inputRows} (${formatShare(share)})`;
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [columnNames, setColumnNames] = useState<string[]>([]);
  const [summary, setSummary] = useState<ColumnCompletenessSummary | null>(null);
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
  const [patternStatusFilters, setPatternStatusFilters] = useState<Record<string, string>>({});
  const [showAllPatterns, setShowAllPatterns] = useState<boolean>(false);
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

  function handleRequestFailure(error: unknown) {
    if (error instanceof ApiRequestError) {
      setErrorMessage(error.message);
    } else {
      setErrorMessage("The local API could not be reached. Start it and try again.");
    }
    setStatusMessage(null);
  }

  async function loadColumnCompleteness(file: File, missingValueMarkers: Record<string, string[]>) {
    setStatusMessage("Computing the column completeness summary...");

    const startedRequest = beginRequest();
    try {
      const completenessSummary = await fetchColumnCompleteness(file, missingValueMarkers);
      if (!isCurrentRequest(startedRequest)) {
        return;
      }
      setSummary(completenessSummary);
      setAppliedMissingValueMarkers(missingValueMarkers);
      setStatusMessage(null);
    } catch (error) {
      if (isCurrentRequest(startedRequest)) {
        handleRequestFailure(error);
      }
    }
  }

  async function loadPatternSummary(
    file: File,
    missingValueMarkers: Record<string, string[]>,
    identifierColumnToUse: string,
    analysisColumnsToUse: string[],
  ) {
    setStatusMessage("Computing the completeness summary...");

    const startedRequest = beginRequest();
    try {
      const computedPatternSummary = await fetchPatternSummary(
        file,
        missingValueMarkers,
        identifierColumnToUse,
        analysisColumnsToUse,
      );
      if (!isCurrentRequest(startedRequest)) {
        return;
      }
      setPatternSummary(computedPatternSummary);
      setPatternStatusFilters({});
      setShowAllPatterns(false);
      setStatusMessage(null);
    } catch (error) {
      if (isCurrentRequest(startedRequest)) {
        handleRequestFailure(error);
      }
    }
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow choosing the same file again after a failed or repeated import.
    event.target.value = "";
    if (!file) {
      return;
    }

    // A new import starts from a clean state: no selection, marker setting, or
    // result of a previous file may survive into this one.
    setSelectedFile(file);
    setSelectedFileName(file.name);
    setColumnNames([]);
    setSummary(null);
    setMissingMarkersText({});
    setAppliedMissingValueMarkers({});
    setIdentifierColumn("");
    setAnalysisColumns([]);
    setPatternSummary(null);
    setPatternStatusFilters({});
    setShowAllPatterns(false);
    setErrorMessage(null);

    setStatusMessage("Reading the file...");
    const startedRequest = beginRequest();
    try {
      const columns = await importColumnNames(file);
      if (!isCurrentRequest(startedRequest)) {
        return;
      }
      setColumnNames(columns);
    } catch (error) {
      if (isCurrentRequest(startedRequest)) {
        handleRequestFailure(error);
      }
      return;
    }

    await loadColumnCompleteness(file, {});
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
    await loadColumnCompleteness(selectedFile, parseMissingValueMarkers(missingMarkersText));
  }

  function handleIdentifierColumnChanged(event: ChangeEvent<HTMLSelectElement>) {
    const nextIdentifierColumn = event.target.value;
    setIdentifierColumn(nextIdentifierColumn);
    setAnalysisColumns((previousColumns) =>
      withoutIdentifierColumn(previousColumns, nextIdentifierColumn),
    );
    setPatternSummary(null);
  }

  function handleAnalysisColumnToggled(columnName: string) {
    setAnalysisColumns((previousColumns) => {
      if (previousColumns.includes(columnName)) {
        return previousColumns.filter((selectedName) => selectedName !== columnName);
      }
      return [...previousColumns, columnName];
    });
    setPatternSummary(null);
  }

  async function handlePatternSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      return;
    }

    setErrorMessage(null);
    await loadPatternSummary(
      selectedFile,
      appliedMissingValueMarkers,
      identifierColumn,
      columnsToAnalyze,
    );
  }

  function handlePatternFilterChanged(columnName: string, status: string) {
    setPatternStatusFilters((previousFilters) => {
      return { ...previousFilters, [columnName]: status };
    });
    setShowAllPatterns(false);
  }

  function handleClearPatternFilters() {
    setPatternStatusFilters({});
    setShowAllPatterns(false);
  }

  function handleShowAllPatternsToggled() {
    setShowAllPatterns((previousShowAll) => !previousShowAll);
  }

  const columnsToAnalyze = withoutIdentifierColumn(analysisColumns, identifierColumn);
  const matchedPatterns = patternSummary
    ? patternsMatchingFilters(
        patternSummary.patterns,
        patternSummary.analysis_columns,
        patternStatusFilters,
      )
    : [];
  const displayedPatterns = showAllPatterns
    ? matchedPatterns
    : matchedPatterns.slice(0, MOST_COMMON_PATTERNS_SHOWN);
  const patternFiltersActive = Object.values(patternStatusFilters).some(
    (status) => status !== PATTERN_FILTER_ANY,
  );

  return (
    <main className="page">
      <section className="card">
        <h1>Data Completeness Profiler</h1>
        <p className="lead">
          Import a CSV file to see how many of its rows hold a value in each column. Your file stays
          on this machine and is deleted after it has been read.
        </p>

        <label className="file-picker">
          <span>CSV file</span>
          <input type="file" accept=".csv" onChange={handleFileSelected} />
        </label>

        {selectedFileName && <p className="status-line">Selected file: {selectedFileName}</p>}
        {statusMessage && <p className="status-line">{statusMessage}</p>}
        {errorMessage && <p className="error-message">{errorMessage}</p>}

        {columnNames.length > 0 && (
          <div className="result-block">
            <h2>Columns in this file ({columnNames.length})</h2>
            <ul className="column-list">
              {columnNames.map((columnName, columnIndex) => (
                <li key={columnIndex} className="column-item">
                  {columnName}
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary && (
          <div className="result-block">
            <h2>Column Completeness Summary</h2>
            <p className="status-line">
              {summary.input_rows} Input Rows in this file. Null, empty, and whitespace-only values
              count as missing, and zero counts as present. List additional missing value markers per
              column, separated by commas; they match after trimming and without letter case.
            </p>

            <form className="summary-form" onSubmit={handleMissingRulesSubmit}>
              <div className="summary-table-frame">
                <table className="summary-table">
                  <thead>
                    <tr>
                      <th scope="col">Column</th>
                      <th scope="col">Input Rows with a value</th>
                      <th scope="col">Input Rows missing a value</th>
                      <th scope="col">Additional missing value markers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.columns.map((column, columnIndex) => (
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
                        <td>
                          <input
                            className="marker-input"
                            type="text"
                            value={missingMarkersText[column.name] ?? ""}
                            placeholder="N/A, -"
                            aria-label={`Additional missing value markers for ${column.name}`}
                            onChange={(event) =>
                              handleMissingMarkersChanged(column.name, event.target.value)
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
                  Update summary
                </button>
                <p className="hint-text">
                  The summary describes your file only. It reports counts and shares and flags no
                  value or pattern as a problem.
                </p>
              </div>
            </form>
          </div>
        )}

        {summary && (
          <div className="result-block">
            <h2>Completeness Summary</h2>
            <p className="status-line">
              Designate one optional Identifier Column to identify or display Input Rows, then
              select the columns to analyze. The Identifier Column never joins the pattern analysis
              and never changes row counts. Input Rows that share a Completeness Pattern are
              reported together with their exact count and share of Input Rows.
            </p>

            <form className="summary-form" onSubmit={handlePatternSubmit}>
              <div className="selection-panel">
                <label className="selection-field">
                  <span>Identifier Column (optional)</span>
                  <select value={identifierColumn} onChange={handleIdentifierColumnChanged}>
                    <option value="">No identifier column</option>
                    {summary.columns.map((column, columnIndex) => (
                      <option key={columnIndex} value={column.name}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className="analysis-fieldset">
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
                      ? `${identifierColumn} is the Identifier Column and stays out of the analysis.`
                      : "The selected columns define one Completeness Pattern per Input Row."}
                  </p>
                </fieldset>
              </div>

              <div className="summary-actions">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={statusMessage !== null || columnsToAnalyze.length === 0}
                >
                  Compute completeness summary
                </button>
                <p className="hint-text">
                  The results are descriptive only: they report what the file contains and flag no
                  pattern as a problem.
                </p>
              </div>
            </form>

            {patternSummary && (
              <div className="result-block">
                <p className="status-line">
                  {patternSummary.input_rows} Input Rows in this file.{" "}
                  {patternSummary.patterns.length} distinct Completeness Patterns across{" "}
                  {patternSummary.analysis_columns.length} analyzed columns. Identifier Column:{" "}
                  {patternSummary.identifier_column ?? "none"} (display only).
                </p>

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
                  )}
                </p>

                <div className="summary-table-frame">
                  <table className="summary-table">
                    <thead>
                      <tr>
                        {patternSummary.analysis_columns.map((columnName, columnIndex) => (
                          <th key={columnIndex} scope="col">
                            {columnName}
                          </th>
                        ))}
                        <th scope="col">Input Rows</th>
                        <th scope="col">Share of Input Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedPatterns.map((pattern, patternIndex) => (
                        <tr key={patternIndex}>
                          {pattern.statuses.map((status, statusIndex) => (
                            <td key={statusIndex}>
                              <span className={patternStatusClass(status)}>
                                {patternStatusLabel(status)}
                              </span>
                            </td>
                          ))}
                          <td>{pattern.count}</td>
                          <td>{formatShare(pattern.share)}</td>
                        </tr>
                      ))}
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
                      Every observed pattern is counted exactly; the table only limits how many
                      entries are displayed at once.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
