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
    await loadColumnCompleteness(selectedFile, parseMissingValueMarkers(missingMarkersText));
  }

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
                  The summary describes your file only. No value or pattern is labeled as anomalous.
                </p>
              </div>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;