export type DataContractDateFormat = "YYYY-MM-DD" | "YYYY-MM-DD HH:MM:SS";
export type DataContractValueType = "integer" | "number" | "date";

export interface RequiredContractRule {
  column: string;
  kind: "required";
}

export interface EnumContractRule {
  column: string;
  kind: "enum";
  values: string[];
}

export interface IntegerContractRule {
  column: string;
  kind: "type";
  value_type: "integer";
}

export interface NumberContractRule {
  column: string;
  kind: "type";
  value_type: "number";
}

export interface DateContractRule {
  column: string;
  kind: "type";
  value_type: "date";
  date_format: DataContractDateFormat;
}

export type DataContractRule =
  | RequiredContractRule
  | EnumContractRule
  | IntegerContractRule
  | NumberContractRule
  | DateContractRule;

export interface DataContractV1 {
  version: 1;
  rules: DataContractRule[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFields(
  record: Record<string, unknown>,
  expectedFields: readonly string[],
  description: string,
): void {
  const unknownFields = Object.keys(record).filter((field) => !expectedFields.includes(field));
  if (unknownFields.length > 0) {
    throw new Error(`${description} has unsupported field(s): ${unknownFields.join(", ")}.`);
  }

  const missingFields = expectedFields.filter(
    (field) => !Object.prototype.hasOwnProperty.call(record, field),
  );
  if (missingFields.length > 0) {
    throw new Error(`${description} is missing field(s): ${missingFields.join(", ")}.`);
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`The ${field} field must be a string.`);
  }
  return value;
}

function parseContractRule(value: unknown): DataContractRule {
  if (!isRecord(value)) {
    throw new Error("Every contract rule must be an object.");
  }

  const kind = value.kind;
  if (typeof kind !== "string") {
    throw new Error("Every contract rule must have a string kind.");
  }

  if (kind === "required") {
    requireFields(value, ["column", "kind"], "Required rule");
    return { column: requireString(value.column, "column"), kind };
  }

  if (kind === "enum") {
    requireFields(value, ["column", "kind", "values"], "Enum rule");
    if (!Array.isArray(value.values) || value.values.length === 0) {
      throw new Error("Enum rule values must be a non-empty array.");
    }
    if (!value.values.every((entry): entry is string => typeof entry === "string")) {
      throw new Error("Every enum rule value must be a string.");
    }
    if (value.values.some((entry) => entry.trim().length === 0)) {
      throw new Error("Enum rule values cannot be empty or whitespace-only.");
    }
    if (new Set(value.values).size !== value.values.length) {
      throw new Error("Enum rule values must be distinct.");
    }
    return {
      column: requireString(value.column, "column"),
      kind,
      values: value.values,
    };
  }

  if (kind === "type") {
    const valueType = value.value_type;
    if (typeof valueType !== "string") {
      throw new Error("Type rules must have a string value_type.");
    }
    if (valueType === "integer" || valueType === "number") {
      requireFields(value, ["column", "kind", "value_type"], `${valueType} rule`);
      return {
        column: requireString(value.column, "column"),
        kind,
        value_type: valueType,
      };
    }
    if (valueType === "date") {
      requireFields(
        value,
        ["column", "kind", "value_type", "date_format"],
        "Date rule",
      );
      if (
        value.date_format !== "YYYY-MM-DD" &&
        value.date_format !== "YYYY-MM-DD HH:MM:SS"
      ) {
        throw new Error("The date rule format is not supported.");
      }
      return {
        column: requireString(value.column, "column"),
        kind,
        value_type: valueType,
        date_format: value.date_format,
      };
    }
    throw new Error(`Type ${JSON.stringify(valueType)} is not supported.`);
  }

  throw new Error(`Rule kind ${JSON.stringify(kind)} is not supported.`);
}

export function parseDataContractJson(rawJson: string): DataContractV1 {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawJson);
  } catch {
    throw new Error("The contract must be valid JSON.");
  }

  if (!isRecord(decoded)) {
    throw new Error("The contract must be a JSON object.");
  }
  requireFields(decoded, ["version", "rules"], "Contract");
  if (decoded.version !== 1) {
    throw new Error("Only contract version 1 is supported.");
  }
  if (!Array.isArray(decoded.rules) || decoded.rules.length === 0) {
    throw new Error("The contract must contain at least one rule.");
  }

  return {
    version: 1,
    rules: decoded.rules.map(parseContractRule),
  };
}

export function serializeDataContract(contract: DataContractV1): string {
  return JSON.stringify(contract, null, 2);
}

export function getDataContractColumnIssues(
  contract: DataContractV1,
  columnNames: readonly string[],
): string[] {
  const columnCounts = new Map<string, number>();
  for (const columnName of columnNames) {
    columnCounts.set(columnName, (columnCounts.get(columnName) ?? 0) + 1);
  }

  const issues: string[] = [];
  const reportedColumns = new Set<string>();
  for (const rule of contract.rules) {
    if (reportedColumns.has(rule.column)) {
      continue;
    }
    reportedColumns.add(rule.column);

    const matchingColumns = columnCounts.get(rule.column) ?? 0;
    if (matchingColumns === 0) {
      issues.push(`Column ${JSON.stringify(rule.column)} is not present in the selected file.`);
    } else if (matchingColumns > 1) {
      issues.push(
        `Column ${JSON.stringify(rule.column)} matches more than one column in the selected file.`,
      );
    }
  }

  return issues;
}
