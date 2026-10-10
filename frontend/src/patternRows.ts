import type { RowColumnMode } from "./rowColumnMode";
import { serializeRowColumnFilters } from "./rowFilters";
import type { RowColumnFilters } from "./rowFilters";

export interface PatternRowsPage {
  columns: string[];
  rows: (string | null)[][];
  page: number;
  page_size: 50;
  total_rows: number;
}

interface ApiFailureResponse {
  detail: string;
}

export class PatternRowsRequestError extends Error {}

export async function fetchPatternRowsPage(
  jobId: string,
  patternIndex: number,
  page: number,
  signal: AbortSignal,
  filters: RowColumnFilters = {},
): Promise<PatternRowsPage> {
  const encodedJobId = encodeURIComponent(jobId);
  const queryParameters = new URLSearchParams({ page: String(page) });
  const serializedFilters = serializeRowColumnFilters(filters);
  if (serializedFilters !== null) {
    queryParameters.set("filters", serializedFilters);
  }
  const rowsUrl =
    `/api/analysis-jobs/${encodedJobId}/patterns/${patternIndex}/rows?` +
    queryParameters.toString();
  const response = await fetch(rowsUrl, { signal });
  let responseBody: PatternRowsPage | ApiFailureResponse | null;
  try {
    responseBody = (await response.json()) as PatternRowsPage | ApiFailureResponse;
  } catch {
    throw new PatternRowsRequestError(
      "The Input Rows response could not be read. Retry the request.",
    );
  }

  if (responseBody !== null && "detail" in responseBody) {
    throw new PatternRowsRequestError(
      responseBody.detail || "The Input Rows could not be retrieved.",
    );
  }

  if (!response.ok) {
    throw new PatternRowsRequestError("The Input Rows could not be retrieved. Try again.");
  }

  if (responseBody === null) {
    throw new PatternRowsRequestError(
      "The Input Rows response could not be read. Retry the request.",
    );
  }

  return responseBody;
}

export async function downloadPatternRowsCsv(
  jobId: string,
  patternIndex: number,
  columnMode: RowColumnMode = "all",
  filters: RowColumnFilters = {},
): Promise<void> {
  const encodedJobId = encodeURIComponent(jobId);
  const queryParameters = new URLSearchParams();
  if (columnMode === "analysis") {
    queryParameters.set("column_mode", "analysis");
  }
  const serializedFilters = serializeRowColumnFilters(filters);
  if (serializedFilters !== null) {
    queryParameters.set("filters", serializedFilters);
  }
  const query = queryParameters.toString();
  const exportPath =
    `/api/analysis-jobs/${encodedJobId}/patterns/${patternIndex}/exports/rows.csv`;
  const exportUrl = query.length > 0 ? `${exportPath}?${query}` : exportPath;

  let response: Response;
  try {
    response = await fetch(exportUrl);
  } catch {
    throw new PatternRowsRequestError(
      "The CSV could not be downloaded. Check that the local API is running and retry.",
    );
  }

  if (!response.ok) {
    let failureResponse: ApiFailureResponse | null = null;
    try {
      failureResponse = (await response.json()) as ApiFailureResponse;
    } catch {
      // Use the local fallback message when the API did not return readable JSON.
    }

    throw new PatternRowsRequestError(
      failureResponse?.detail || "The CSV could not be downloaded. Retry the export.",
    );
  }

  let csvFile: Blob;
  try {
    csvFile = await response.blob();
  } catch {
    throw new PatternRowsRequestError(
      "The CSV download was interrupted. Check the local API and retry.",
    );
  }

  const downloadUrl = URL.createObjectURL(csvFile);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = `pattern_rows_${patternIndex + 1}.csv`;
  downloadLink.hidden = true;

  try {
    document.body.append(downloadLink);
    downloadLink.click();
  } finally {
    downloadLink.remove();
    URL.revokeObjectURL(downloadUrl);
  }
}
