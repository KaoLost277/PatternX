import type { RowColumnMode } from "./rowColumnMode";
import { serializeRowColumnFilters } from "./rowFilters";
import type { RowColumnFilters } from "./rowFilters";
import type { DataContractV1 } from "./dataContract";

export type DataAnalysisKind = "formal_terms" | "group_data" | "data_contract";
export type DataAnalysisPanelKind = Exclude<DataAnalysisKind, "data_contract">;
export type DataAnalysisState = "running" | "succeeded" | "failed" | "cancelled";
export type ColumnProfileJobState = DataAnalysisState;

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

export interface GroupDataKeyUniqueness {
  distinct_key_count: number;
  singleton_key_count: number;
  repeated_key_count: number;
  input_rows_in_repeated_key_groups: number;
  singleton_key_share: number;
}

export interface GroupDataSummary {
  kind: "group_data";
  input_rows: number;
  selected_columns: string[];
  groups: DataGroup[];
  key_uniqueness: GroupDataKeyUniqueness;
}

export interface DataContractRuleSummary {
  rule_index: number;
  missing_count: number;
  passing_count: number;
  failing_count: number;
}

export interface DataContractSummary {
  kind: "data_contract";
  input_rows: number;
  rules: DataContractRuleSummary[];
}

export type DataAnalysisSummary =
  | FormalTermsSummary
  | GroupDataSummary
  | DataContractSummary;

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

export interface InputRowsMetric {
  readonly count: number;
  readonly denominator: number;
  readonly denominatorKind: "input_rows";
}

export interface PresentValuesMetric {
  readonly count: number;
  readonly denominator: number;
  readonly denominatorKind: "present_values";
}

export interface ColumnProfile {
  readonly name: string;
  readonly present: InputRowsMetric;
  readonly missing: InputRowsMetric;
  readonly distinctTerms: PresentValuesMetric;
}

export interface ColumnProfileSummary {
  readonly kind: "column_profile";
  readonly inputRows: number;
  readonly columns: readonly ColumnProfile[];
}

export interface ColumnProfileProgress {
  readonly itemsDone: number;
  readonly itemsTotal: number;
}

interface ColumnProfileJobFields {
  readonly jobId: string;
  readonly analysisKind: "column_profile";
  readonly elapsedSeconds: number;
}

export type ColumnProfileJobStatus =
  | (ColumnProfileJobFields & {
      readonly state: "running";
      readonly stage: string;
      readonly progress: ColumnProfileProgress | null;
      readonly result: null;
      readonly error: null;
    })
  | (ColumnProfileJobFields & {
      readonly state: "succeeded";
      readonly stage: null;
      readonly progress: ColumnProfileProgress;
      readonly result: ColumnProfileSummary;
      readonly error: null;
    })
  | (ColumnProfileJobFields & {
      readonly state: "failed";
      readonly stage: null;
      readonly progress: ColumnProfileProgress | null;
      readonly result: null;
      readonly error: string;
    })
  | (ColumnProfileJobFields & {
      readonly state: "cancelled";
      readonly stage: null;
      readonly progress: ColumnProfileProgress | null;
      readonly result: null;
      readonly error: null;
    });

export function inputRowsMetricShare(metric: InputRowsMetric): number {
  return metric.count / metric.denominator;
}

export function presentValuesMetricShare(metric: PresentValuesMetric): number | null {
  if (metric.denominator === 0) {
    return null;
  }
  return metric.count / metric.denominator;
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

async function readColumnProfileResponse(
  response: Response,
  fallbackMessage: string,
): Promise<ColumnProfileJobStatus> {
  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new DataAnalysisRequestError(fallbackMessage);
  }

  if (isRecord(responseBody) && "detail" in responseBody) {
    const detail = responseBody.detail;
    throw new DataAnalysisRequestError(
      typeof detail === "string" && detail.length > 0 ? detail : fallbackMessage,
    );
  }
  if (!response.ok) {
    throw new DataAnalysisRequestError(fallbackMessage);
  }

  return parseColumnProfileJobStatus(responseBody);
}

export function parseColumnProfileJobStatus(value: unknown): ColumnProfileJobStatus {
  const status = requireRecord(value);
  requireExactKeys(status, [
    "job_id",
    "analysis_kind",
    "state",
    "stage",
    "elapsed_seconds",
    "progress",
    "result",
    "error",
  ]);

  if (status.analysis_kind !== "column_profile") {
    throw invalidColumnProfileResponse();
  }
  const state = parseColumnProfileState(status.state);
  const stage = parseNullableString(status.stage);
  const elapsedSeconds = parseNonNegativeNumber(status.elapsed_seconds);
  const progress = parseProfileProgress(status.progress);
  const result = status.result === null ? null : parseColumnProfileSummary(status.result);
  const error = parseNullableString(status.error);
  const jobFields = {
    jobId: parseString(status.job_id),
    analysisKind: "column_profile" as const,
    elapsedSeconds,
  };

  if (state === "running") {
    if (stage === null || result !== null || error !== null) {
      throw invalidColumnProfileResponse();
    }
    return { ...jobFields, state, stage, progress, result: null, error: null };
  } else if (state === "succeeded") {
    if (
      stage !== null ||
      result === null ||
      error !== null ||
      progress === null ||
      progress.itemsDone !== progress.itemsTotal ||
      progress.itemsTotal !== result.columns.length
    ) {
      throw invalidColumnProfileResponse();
    }
    return { ...jobFields, state, stage: null, progress, result, error: null };
  } else if (state === "failed") {
    if (stage !== null || result !== null || error === null) {
      throw invalidColumnProfileResponse();
    }
    return { ...jobFields, state, stage: null, progress, result: null, error };
  }

  if (stage !== null || result !== null || error !== null) {
    throw invalidColumnProfileResponse();
  }
  return { ...jobFields, state, stage: null, progress, result: null, error: null };
}

function parseColumnProfileState(value: unknown): ColumnProfileJobState {
  if (
    value === "running" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }
  throw invalidColumnProfileResponse();
}

function parseColumnProfileSummary(value: unknown): ColumnProfileSummary {
  const summary = requireRecord(value);
  requireExactKeys(summary, ["kind", "input_rows", "columns"]);
  if (summary.kind !== "column_profile" || !Array.isArray(summary.columns)) {
    throw invalidColumnProfileResponse();
  }

  const inputRows = parsePositiveInteger(summary.input_rows);
  const seenNames = new Set<string>();
  const columns = summary.columns.map((columnValue) => {
    const column = parseColumnProfile(columnValue, inputRows);
    if (seenNames.has(column.name)) {
      throw invalidColumnProfileResponse();
    }
    seenNames.add(column.name);
    return column;
  });
  if (columns.length === 0) {
    throw invalidColumnProfileResponse();
  }

  return { kind: "column_profile", inputRows, columns };
}

function parseColumnProfile(value: unknown, inputRows: number): ColumnProfile {
  const column = requireRecord(value);
  requireExactKeys(column, ["name", "present", "missing", "distinct_terms"]);
  const present = parseInputRowsMetric(column.present, inputRows);
  const missing = parseInputRowsMetric(column.missing, inputRows);
  const distinctTerms = parsePresentValuesMetric(column.distinct_terms, present.count);
  if (present.count + missing.count !== inputRows) {
    throw invalidColumnProfileResponse();
  }

  return {
    name: parseString(column.name),
    present,
    missing,
    distinctTerms,
  };
}

function parseInputRowsMetric(value: unknown, inputRows: number): InputRowsMetric {
  const metric = requireRecord(value);
  requireExactKeys(metric, ["count", "denominator", "denominator_kind", "share"]);
  const count = parseNonNegativeInteger(metric.count);
  const denominator = parsePositiveInteger(metric.denominator);
  parseShare(metric.share, count, denominator);
  if (
    metric.denominator_kind !== "input_rows" ||
    denominator !== inputRows ||
    count > denominator
  ) {
    throw invalidColumnProfileResponse();
  }

  return { count, denominator, denominatorKind: "input_rows" };
}

function parsePresentValuesMetric(
  value: unknown,
  presentValues: number,
): PresentValuesMetric {
  const metric = requireRecord(value);
  requireExactKeys(metric, ["count", "denominator", "denominator_kind", "share"]);
  const count = parseNonNegativeInteger(metric.count);
  const denominator = parseNonNegativeInteger(metric.denominator);
  if (
    metric.denominator_kind !== "present_values" ||
    denominator !== presentValues ||
    count > denominator
  ) {
    throw invalidColumnProfileResponse();
  }

  if (denominator === 0) {
    if (metric.share !== null || count !== 0) {
      throw invalidColumnProfileResponse();
    }
    return { count, denominator, denominatorKind: "present_values" };
  }

  parseShare(metric.share, count, denominator);
  return { count, denominator, denominatorKind: "present_values" };
}

function parseProfileProgress(value: unknown): ColumnProfileProgress | null {
  if (value === null) {
    return null;
  }

  const progress = requireRecord(value);
  requireExactKeys(progress, ["items_done", "items_total"]);
  const itemsDone = parseNonNegativeInteger(progress.items_done);
  const itemsTotal = parsePositiveInteger(progress.items_total);
  if (itemsDone > itemsTotal) {
    throw invalidColumnProfileResponse();
  }
  return { itemsDone, itemsTotal };
}

function parseShare(value: unknown, count: number, denominator: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidColumnProfileResponse();
  }
  if (Math.abs(value - count / denominator) > 1e-12) {
    throw invalidColumnProfileResponse();
  }
  return value;
}

function parseNullableString(value: unknown): string | null {
  if (value === null || typeof value === "string") {
    return value;
  }
  throw invalidColumnProfileResponse();
}

function parseString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  throw invalidColumnProfileResponse();
}

function parseNonNegativeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  throw invalidColumnProfileResponse();
}

function parsePositiveInteger(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  throw invalidColumnProfileResponse();
}

function parseNonNegativeInteger(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  throw invalidColumnProfileResponse();
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalidColumnProfileResponse();
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Record<string, unknown>, expectedKeys: string[]): void {
  const actualKeys = Object.keys(record);
  if (
    actualKeys.length !== expectedKeys.length ||
    expectedKeys.some((expectedKey) => !(expectedKey in record))
  ) {
    throw invalidColumnProfileResponse();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidColumnProfileResponse(): DataAnalysisRequestError {
  return new DataAnalysisRequestError("The local API returned an invalid column profile.");
}

export async function startDataAnalysisJob(
  file: File,
  worksheetName: string,
  missingValueMarkers: Record<string, string[]>,
  selectedColumns: string[],
  analysisKind: DataAnalysisPanelKind,
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

export async function startDataContractJob(
  file: File,
  worksheetName: string,
  missingValueMarkers: Record<string, string[]>,
  contract: DataContractV1,
): Promise<DataAnalysisJobStatus> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("contract_json", JSON.stringify(contract));
  formData.append("missing_markers", JSON.stringify(missingValueMarkers));
  if (worksheetName.length > 0) {
    formData.append("sheet", worksheetName);
  }

  let response: Response;
  try {
    response = await fetch("/api/data-contract-jobs", {
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
    "The data contract job could not be started.",
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

export async function fetchDataContractJobStatus(
  jobId: string,
  signal?: AbortSignal,
): Promise<DataAnalysisJobStatus> {
  let response: Response;
  try {
    response = await fetch(
      `/api/data-contract-jobs/${encodeURIComponent(jobId)}`,
      { signal },
    );
  } catch {
    throw new DataAnalysisRequestError(
      "The local API could not be reached. Start it and try again.",
    );
  }

  return await readResponseBody(response, "The data contract status could not be read.");
}

export async function cancelDataContractJob(jobId: string): Promise<DataAnalysisJobStatus> {
  let response: Response;
  try {
    response = await fetch(
      `/api/data-contract-jobs/${encodeURIComponent(jobId)}/cancel`,
      { method: "POST" },
    );
  } catch {
    throw new DataAnalysisRequestError(
      "The local API could not be reached. Start it and try again.",
    );
  }

  return await readResponseBody(response, "The data contract job could not be cancelled.");
}

export async function startColumnProfileJob(
  file: File,
  worksheetName: string,
  missingValueMarkers: Record<string, string[]>,
): Promise<ColumnProfileJobStatus> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("missing_markers", JSON.stringify(missingValueMarkers));
  if (worksheetName.length > 0) {
    formData.append("sheet", worksheetName);
  }

  let response: Response;
  try {
    response = await fetch("/api/column-profile-jobs", {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new DataAnalysisRequestError(
      "The local API could not be reached. Start it and try again.",
    );
  }

  return await readColumnProfileResponse(
    response,
    "The column profile could not be started.",
  );
}

export async function fetchColumnProfileJobStatus(
  jobId: string,
  signal?: AbortSignal,
): Promise<ColumnProfileJobStatus> {
  let response: Response;
  try {
    response = await fetch(
      `/api/column-profile-jobs/${encodeURIComponent(jobId)}`,
      { signal },
    );
  } catch {
    throw new DataAnalysisRequestError(
      "The local API could not be reached. Start it and try again.",
    );
  }

  return await readColumnProfileResponse(
    response,
    "The column profile status could not be read.",
  );
}

export async function cancelColumnProfileJob(
  jobId: string,
): Promise<ColumnProfileJobStatus> {
  let response: Response;
  try {
    response = await fetch(
      `/api/column-profile-jobs/${encodeURIComponent(jobId)}/cancel`,
      { method: "POST" },
    );
  } catch {
    throw new DataAnalysisRequestError(
      "The local API could not be reached. Start it and try again.",
    );
  }

  return await readColumnProfileResponse(
    response,
    "The column profile job could not be cancelled.",
  );
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
