export type TransformType =
  | "date_truncate"
  | "delimiter_split"
  | "substring"
  | "regex_extract"
  | "case_trim";

export type TargetMode = "new_column" | "overwrite";

export interface TransformRule {
  id: string;
  source_column: string;
  target_mode: TargetMode;
  target_column: string;
  transform_type: TransformType;
  config: Record<string, any>;
}

export interface RuleMatchStats {
  matched_count: number;
  unmatched_count: number;
  empty_count: number;
  total_rows: number;
}

export interface TransformPreviewResponse {
  original_columns: string[];
  transformed_columns: string[];
  preview_rows: Array<{
    original: Record<string, string>;
    transformed: Record<string, string>;
  }>;
  stats: Record<string, RuleMatchStats>;
}

export interface TransformationV1File {
  version: 1;
  rules: TransformRule[];
}

export async function fetchTransformPreview(
  file: File,
  sheet: string,
  rules: TransformRule[],
): Promise<TransformPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (sheet) {
    formData.append("sheet", sheet);
  }
  formData.append("rules", JSON.stringify(rules));

  const response = await fetch("/api/transformations/preview", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "Failed to generate transformation preview.");
  }

  return await response.json();
}

export async function applyTransformationsApi(
  file: File,
  sheet: string,
  rules: TransformRule[],
): Promise<File> {
  const formData = new FormData();
  formData.append("file", file);
  if (sheet) {
    formData.append("sheet", sheet);
  }
  formData.append("rules", JSON.stringify(rules));

  const response = await fetch("/api/transformations/apply", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "Failed to apply transformations.");
  }

  const blob = await response.blob();
  const originalBaseName = file.name.replace(/\.[^/.]+$/, "");
  const transformedFileName = `${originalBaseName}_transformed.csv`;

  return new File([blob], transformedFileName, {
    type: "text/csv;charset=utf-8",
    lastModified: Date.now(),
  });
}

export function serializeTransformations(rules: TransformRule[]): string {
  const payload: TransformationV1File = {
    version: 1,
    rules,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseTransformationsJson(jsonText: string): TransformRule[] {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid transformations JSON format.");
  }
  const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
  return rules.map((r: any, idx: number) => ({
    id: r.id || `rule_${idx + 1}`,
    source_column: r.source_column || "",
    target_mode: r.target_mode === "overwrite" ? "overwrite" : "new_column",
    target_column: r.target_column || `${r.source_column}_transformed`,
    transform_type: r.transform_type || "delimiter_split",
    config: r.config || {},
  }));
}
