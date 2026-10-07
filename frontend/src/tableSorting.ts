import type { PatternStatus } from "./patternStatus";

export type SortDirection = "ascending" | "descending";

export interface SortState<Key extends string = string> {
  key: Key;
  direction: SortDirection;
}

export function cycleSort<Key extends string>(
  currentSort: SortState<Key> | null,
  key: Key,
): SortState<Key> | null {
  if (currentSort === null || currentSort.key !== key) {
    return { key, direction: "ascending" };
  }

  if (currentSort.direction === "ascending") {
    return { key, direction: "descending" };
  }

  return null;
}

export function sortRows<Row, Key extends string>(
  rows: readonly Row[],
  sortState: SortState<Key> | null,
  compareByKey: (key: Key, left: Row, right: Row) => number,
): Row[] {
  if (sortState === null) {
    return [...rows];
  }

  const directionMultiplier = sortState.direction === "ascending" ? 1 : -1;
  return rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((left, right) => {
      const comparison =
        compareByKey(sortState.key, left.row, right.row) * directionMultiplier;
      return comparison === 0 ? left.originalIndex - right.originalIndex : comparison;
    })
    .map(({ row }) => row);
}

export function compareNumbers(left: number, right: number): number {
  return left - right;
}

export function comparePatternStatus(left: PatternStatus, right: PatternStatus): number {
  const leftOrder = left === "missing" ? 0 : 1;
  const rightOrder = right === "missing" ? 0 : 1;
  return compareNumbers(leftOrder, rightOrder);
}

const localeTextCollator = new Intl.Collator(undefined, { sensitivity: "base" });

export function compareText(left: string, right: string): number {
  return localeTextCollator.compare(left, right);
}

export function compareNullableText(left: string | null, right: string | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return -1;
  }
  if (right === null) {
    return 1;
  }
  return compareText(left, right);
}
