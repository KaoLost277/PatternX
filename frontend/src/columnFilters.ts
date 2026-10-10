export type ColumnValueFilter =
  | { kind: "contains"; value: string }
  | { kind: "exact"; value: string }
  | { kind: "missing" };

export function describeColumnValueFilter(filter: ColumnValueFilter): string {
  if (filter.kind === "missing") {
    return "Missing Value";
  }
  if (filter.kind === "exact") {
    return `is exactly “${filter.value}”`;
  }
  return `contains “${filter.value}”`;
}

export function matchesColumnValue(
  filter: ColumnValueFilter,
  value: string | null,
): boolean {
  if (filter.kind === "missing") {
    return value === null;
  }
  if (value === null) {
    return false;
  }
  if (filter.kind === "exact") {
    return value === filter.value;
  }
  return value.toLowerCase().includes(filter.value.toLowerCase());
}
