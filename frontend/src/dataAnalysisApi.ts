import type { RowColumnMode } from "./rowColumnMode";
import { serializeRowColumnFilters } from "./rowFilters";
import type { RowColumnFilters } from "./rowFilters";

export type DataAnalysisKind = "formal_terms" | "group_data";
export type DataAnalysisState = "running" | "succeeded" | "failed" | "cancelled";

export interface AnalysisProgress {
  items_done: number;
  items_total: number;
}

export interface DataTerm {
  value: string | null;
  count: number;
  share: number;
}

export interface DataFormatPattern {
  pattern: string;
  occurrence_count: number;
  distinct_term_count: number;
  share: number;
}

export interface FormalColumnTerms {
  name: string;
  terms: DataTerm[];
  format_patterns: DataFormatPattern[];
}

export interface FormalTermsSummary {
  kind: "formal_terms";
  input_rows: number;
  selected_columns: string[];
  columns: FormalColumnTerms[];
}

export interface DataGroup {
  values: (string | null)[];
  count: number;
  share: number;
}

export interface GroupDataSummary {
  kind: "group_data";
  input_rows: number;
  selected_columns: string[];
  groups: DataGroup[];
}

export type DataAnalysisSummary = FormalTermsSummary | GroupDataSummary;

export interface DataAnalysisJobStatus {
  job_id: string;
  analysis_kind: DataAnalysisKind;
  state: DataAnalysisState;
  stage: string | null;
  elapsed_seconds: number;
  progress: AnalysisProgress | null;
  result: DataAnalysisSummary | null;
  error: string | null;
}

export interface DataAnalysisRowsPage {
  columns: string[];
  rows: (string | null)[][];
  page: number;
  page_size: number;
  total_rows: number;
}

export type DataAnalysisDetailTarget =
  | { kind: "group"; itemIndex: number; columnIndex?: never }
  | { kind: "term" | "format"; itemIndex: number; columnIndex: number };

interface ApiFailureResponse {
  detail: string;
}

export class DataAnalysisRequestError extends Error {}

async function readResponseBody<T extends object>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  let responseBody: T | ApiFailureResponse | null;
  try {
    responseBody = (await response.json()) as T | ApiFailureResponse;
  } catch {
    throw new DataAnalysisRequestError(fallbackMessage);
  }

  if (responseBody === null || typeof responseBody !== "object") {
    throw new DataAnalysisRequestError(fallbackMessage);
  }
  if ("detail" in responseBody) {
    throw new DataAnalysisRequestError(responseBody.detail || fallbackMessage);
  }
  if (!response.ok) {
    throw new DataAnalysisRequestError(fallbackMessage);
  }

  return responseBody as T;
}

export async function startDataAnalysisJob(
  file: File,
  worksheetName: string,
  missingValueMarkers: Record<string, string[]>,
  selectedColumns: string[],
  analysisKind: DataAnalysisKind,
): Promise<DataAnalysisJobStatus> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("analysis_kind", analysisKind);
  formData.append("missing_markers", JSON.stringify(missingValueMarkers));
  formData.append("selected_columns", JSON.stringify(selectedColumns));
  if (worksheetName.length > 0) {
    formData.append("sheet", worksheetName);
  }

  let response: Response;
  try {
    response = await fetch("/api/data-analysis-jobs", {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new DataAnalysisRequestError(
      "The local API could not be reached. Start it and try again.",
    );
  }

  return await readResponseBody(
    response,
    "The data analysis could not be started.",
  );
}

export async function fetchDataAnalysisJobStatus(
  jobId: string,
  signal?: AbortSignal,
): Promise<DataAnalysisJobStatus> {
  let response: Response;
  try {
    response = await fetch(`/api/data-analysis-jobs/${encodeURIComponent(jobId)}`, { signal });
  } catch {
    throw new DataAnalysisRequestError(
      "The local API could not be reached. Start it and try again.",
    );
  }

  return await readResponseBody(response, "The data analysis status could not be read.");
}

export async function cancelDataAnalysisJob(jobId: string): Promise<DataAnalysisJobStatus> {
  let response: Response;
  try {
    response = await fetch(`/api/data-analysis-jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
    });
  } catch {
    throw new DataAnalysisRequestError(
      "The local API could not be reached. Start it and try again.",
    );
  }

  return await readResponseBody(response, "The data analysis could not be cancelled.");
}

function detailQuery(target: DataAnalysisDetailTarget, filters: RowColumnFilters): string {
  const parameters = new URLSearchParams({
    target_kind: target.kind,
    item_index: String(target.itemIndex),
  });
  if (target.columnIndex !== undefined) {
    parameters.set("column_index", String(target.columnIndex));
  }
  const serializedFilters = serializeRowColumnFilters(filters);
  if (serializedFilters !== null) {
    parameters.set("filters", serializedFilters);
  }
  return parameters.toString();
}

export async function fetchDataAnalysisRowsPage(
  jobId: string,
  target: DataAnalysisDetailTarget,
  page: number,
  signal: AbortSignal,
  filters: RowColumnFilters = {},
): Promise<DataAnalysisRowsPage> {
  let response: Response;
  try {
    const rowsUrl =
      `/api/data-analysis-jobs/${encodeURIComponent(jobId)}/rows?` +
      `${detailQuery(target, filters)}&page=${page}`;
    response = await fetch(rowsUrl, { signal });
  } catch {
    if (signal.aborted) {
      throw new DOMException("The request was aborted.", "AbortError");
    }
    throw new DataAnalysisRequestError(
      "The matching rows could not be retrieved. Check the local API and retry.",
    );
  }
  return await readResponseBody(
    response,
    "The matching rows could not be retrieved. Retry the request.",
  );
}

export async function downloadDataAnalysisRowsCsv(
  jobId: string,
  analysisKind: DataAnalysisKind,
  target: DataAnalysisDetailTarget,
  columnMode: RowColumnMode = "all",
  filters: RowColumnFilters = {},
): Promise<void> {
  const queryParameters = new URLSearchParams(detailQuery(target, filters));
  if (columnMode === "analysis") {
    queryParameters.set("column_mode", "analysis");
  }
  const exportPath = `/api/data-analysis-jobs/${encodeURIComponent(jobId)}/exports/rows.csv`;
  const exportUrl = `${exportPath}?${queryParameters.toString()}`;

  let response: Response;
  try {
    response = await fetch(exportUrl);
  } catch {
    throw new DataAnalysisRequestError(
      "The CSV could not be downloaded. Check that the local API is running and retry.",
    );
  }

  if (!response.ok) {
    let failureResponse: ApiFailureResponse | null = null;
    try {
      failureResponse = (await response.json()) as ApiFailureResponse;
    } catch {
      // Keep the local fallback when the server response is not readable JSON.
    }
    throw new DataAnalysisRequestError(
      failureResponse?.detail || "The CSV could not be downloaded. Retry the export.",
    );
  }

  let csvFile: Blob;
  try {
    csvFile = await response.blob();
  } catch {
    throw new DataAnalysisRequestError(
      "The CSV download was interrupted. Check the local API and retry.",
    );
  }

  const downloadUrl = URL.createObjectURL(csvFile);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = `${analysisKind}_${target.kind}_rows.csv`;
  downloadLink.hidden = true;

  try {
    document.body.append(downloadLink);
    downloadLink.click();
  } finally {
    downloadLink.remove();
    URL.revokeObjectURL(downloadUrl);
  }
}
