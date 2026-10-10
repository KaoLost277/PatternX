import type { ReactNode } from "react";
import { matchesColumnValue, type ColumnValueFilter } from "./columnFilters";
import { sortRows, type SortState } from "./tableSorting";

export type SummaryFilters<Key extends string> = ReadonlyMap<Key, ColumnValueFilter>;

export type SummaryFilterValue<Row> =
  | { kind: "text"; read: (row: Row) => string }
  | { kind: "nullable-text"; read: (row: Row) => string | null };

export interface SummaryTableColumn<Row, Key extends string> {
  key: Key;
  label: string;
  filterValue: SummaryFilterValue<Row>;
  compare: (left: Row, right: Row) => number;
  renderCell: (row: Row) => ReactNode;
  rowHeader?: boolean;
}

export interface SourceIndexedRow<Row> {
  row: Row;
  sourceIndex: number;
}

export interface SummaryRowProjection<Row> {
  rows: SourceIndexedRow<Row>[];
  matchedCount: number;
}

export function projectSummaryRows<Row, Key extends string>(
  rows: readonly Row[],
  columns: readonly SummaryTableColumn<Row, Key>[],
  filters: SummaryFilters<Key>,
  sortState: SortState<Key> | null,
  limit: number | null,
): SummaryRowProjection<Row> {
  const columnByKey = new Map(columns.map((column) => [column.key, column]));
  const indexedRows = rows.map((row, sourceIndex) => ({ row, sourceIndex }));
  const matchingRows = indexedRows.filter(({ row }) =>
    columns.every((column) => {
      const filter = filters.get(column.key);
      if (filter === undefined) {
        return true;
      }
      return matchesColumnValue(filter, column.filterValue.read(row));
    }),
  );
  const sortedRows = sortRows(matchingRows, sortState, (key, left, right) => {
    const column = columnByKey.get(key);
    return column === undefined ? 0 : column.compare(left.row, right.row);
  });

  return {
    rows: limit === null ? sortedRows : sortedRows.slice(0, limit),
    matchedCount: matchingRows.length,
  };
}
