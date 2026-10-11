import { serializeRowColumnFilters } from "./rowFilters";
import type { RowColumnFilters } from "./rowFilters";

export type ColumnStatus = "present" | "missing";

export interface ColumnStatusRowsPage {
  columns: string[];
  rows: (string | null)[][];
  page: number;
  page_size: number;
  total_rows: number;
}

interface ApiFailureResponse {
  detail: string;
}

export class ColumnStatusRowsRequestError extends Error {}

export async function fetchColumnStatusRowsPage(
  jobId: string,
  columnIndex: number,
  status: ColumnStatus,
  page: number,
  signal: AbortSignal,
  filters: RowColumnFilters = {},
): Promise<ColumnStatusRowsPage> {
  const encodedJobId = encodeURIComponent(jobId);
  const queryParameters = new URLSearchParams({ status, page: String(page) });
  const serializedFilters = serializeRowColumnFilters(filters);
  if (serializedFilters !== null) {
    queryParameters.set("filters", serializedFilters);
  }
  const rowsUrl =
    `/api/column-completeness-jobs/${encodedJobId}/columns/${columnIndex}/rows?` +
    queryParameters.toString();

  let response: Response;
  try {
    response = await fetch(rowsUrl, { signal });
  } catch {
    throw new ColumnStatusRowsRequestError(
      "The local API could not retrieve these Input Rows. Check that it is running and retry.",
    );
  }

  let responseBody: ColumnStatusRowsPage | ApiFailureResponse | null;
  try {
    responseBody = (await response.json()) as ColumnStatusRowsPage | ApiFailureResponse;
  } catch {
    throw new ColumnStatusRowsRequestError(
      "The Input Rows response could not be read. Retry the request.",
    );
  }

  if (responseBody !== null && "detail" in responseBody) {
    throw new ColumnStatusRowsRequestError(
      responseBody.detail || "The Input Rows could not be retrieved.",
    );
  }

  if (!response.ok || responseBody === null) {
    throw new ColumnStatusRowsRequestError("The Input Rows could not be retrieved. Try again.");
  }

  return responseBody;
}

export async function downloadColumnStatusRowsCsv(
  jobId: string,
  columnIndex: number,
  status: ColumnStatus,
  filters: RowColumnFilters = {},
): Promise<void> {
  const encodedJobId = encodeURIComponent(jobId);
  const queryParameters = new URLSearchParams({ status });
  const serializedFilters = serializeRowColumnFilters(filters);
  if (serializedFilters !== null) {
    queryParameters.set("filters", serializedFilters);
  }
  const exportUrl =
    `/api/column-completeness-jobs/${encodedJobId}/columns/${columnIndex}/exports/rows.csv?` +
    queryParameters.toString();

  let response: Response;
  try {
    response = await fetch(exportUrl);
  } catch {
    throw new ColumnStatusRowsRequestError(
      "The CSV could not be downloaded. Check that the local API is running and retry.",
    );
  }

  if (!response.ok) {
    let failureResponse: ApiFailureResponse | null = null;
    try {
      failureResponse = (await response.json()) as ApiFailureResponse;
    } catch {
      // Keep the local fallback when the API did not return readable JSON.
    }
    throw new ColumnStatusRowsRequestError(
      failureResponse?.detail || "The CSV could not be downloaded. Retry the export.",
    );
  }

  let csvFile: Blob;
  try {
    csvFile = await response.blob();
  } catch {
    throw new ColumnStatusRowsRequestError(
      "The CSV download was interrupted. Check the local API and retry.",
    );
  }

  const downloadUrl = URL.createObjectURL(csvFile);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = `column_${columnIndex + 1}_${status}_rows.csv`;
  downloadLink.hidden = true;

  try {
    document.body.append(downloadLink);
    downloadLink.click();
  } finally {
    downloadLink.remove();
    URL.revokeObjectURL(downloadUrl);
  }
}
