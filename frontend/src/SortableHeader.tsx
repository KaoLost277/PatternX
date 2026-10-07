import type { SortState } from "./tableSorting";

interface SortableHeaderProps<Key extends string> {
  label: string;
  sortKey: Key;
  sortState: SortState<Key> | null;
  onSort: (key: Key) => void;
  className?: string;
}

export function SortableHeader<Key extends string>({
  label,
  sortKey,
  sortState,
  onSort,
  className,
}: SortableHeaderProps<Key>) {
  const direction = sortState?.key === sortKey ? sortState.direction : null;
  const directionClass = direction === null ? "" : ` sort-indicator-${direction}`;

  return (
    <th className={className} scope="col" aria-sort={direction ?? undefined}>
      <button
        type="button"
        className="sortable-header-button"
        aria-label={`Sort by ${label}`}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        <span className={`sort-indicator${directionClass}`} aria-hidden="true" />
      </button>
    </th>
  );
}
