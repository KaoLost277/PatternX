import type { ColumnValueFilter } from "./columnFilters";

export type RowColumnFilter = ColumnValueFilter;

export type RowColumnFilters = Readonly<Record<string, RowColumnFilter>>;

export function serializeRowColumnFilters(filters: RowColumnFilters): string | null {
  if (Object.keys(filters).length === 0) {
    return null;
  }

  return JSON.stringify(filters);
}
