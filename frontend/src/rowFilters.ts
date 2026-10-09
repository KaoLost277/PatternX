export type RowColumnFilter =
  | { kind: "contains"; value: string }
  | { kind: "exact"; value: string }
  | { kind: "missing" };

export type RowColumnFilters = Readonly<Record<string, RowColumnFilter>>;

export function serializeRowColumnFilters(filters: RowColumnFilters): string | null {
  if (Object.keys(filters).length === 0) {
    return null;
  }

  return JSON.stringify(filters);
}

export function describeRowColumnFilter(filter: RowColumnFilter): string {
  if (filter.kind === "missing") {
    return "Missing Value";
  }
  if (filter.kind === "exact") {
    return `is exactly “${filter.value}”`;
  }
  return `contains “${filter.value}”`;
}
