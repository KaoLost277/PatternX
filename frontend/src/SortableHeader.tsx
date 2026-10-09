import type { SortState } from "./tableSorting";
import { sortableHeaderButtonClasses } from "./uiClasses";

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
  const ascendingOpacity = direction === "descending" ? "opacity-30" : "opacity-100";
  const descendingOpacity = direction === "ascending" ? "opacity-30" : "opacity-100";

  return (
    <th className={className} scope="col" aria-sort={direction ?? undefined}>
      <button
        type="button"
        className={sortableHeaderButtonClasses}
        aria-label={`Sort by ${label}`}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        <svg
          className={`size-4 shrink-0 fill-none stroke-current ${direction === null ? "text-text-muted" : "text-accent"}`}
          viewBox="0 0 12 16"
          aria-hidden="true"
        >
          <path
            className={ascendingOpacity}
            d="m2 6 4-4 4 4"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className={descendingOpacity}
            d="m2 10 4 4 4-4"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </th>
  );
}
