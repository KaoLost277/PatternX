import type { SortState } from "./tableSorting";
import { sortableHeaderButtonClasses } from "./uiClasses";

interface SortableHeaderProps<Key extends string> {
  label: string;
  sortKey: Key;
  sortState: SortState<Key> | null;
  onSort: (key: Key) => void;
  className?: string;
  filter?: {
    active: boolean;
    expanded: boolean;
    popoverId: string;
    onOpen: (trigger: HTMLButtonElement) => void;
  };
}

export function SortableHeader<Key extends string>({
  label,
  sortKey,
  sortState,
  onSort,
  className,
  filter,
}: SortableHeaderProps<Key>) {
  const direction = sortState?.key === sortKey ? sortState.direction : null;
  const ascendingOpacity = direction === "descending" ? "opacity-30" : "opacity-100";
  const descendingOpacity = direction === "ascending" ? "opacity-30" : "opacity-100";
  const sortIcon = (
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
  );
  const sortButton = (
    <button
      type="button"
      className={`${sortableHeaderButtonClasses} w-full min-w-0`}
      aria-label={`Sort by ${label}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      {sortIcon}
    </button>
  );
  const compactSortButton = (
    <button
      type="button"
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-text-muted hover:text-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      aria-label={`Sort by ${label}`}
      title={`Sort by ${label}`}
      onClick={() => onSort(sortKey)}
    >
      {sortIcon}
    </button>
  );
  const filterButton =
    filter === undefined ? null : (
      <button
        type="button"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-text-muted hover:text-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        aria-label={`Filter ${label}`}
        title={`Filter ${label}`}
        aria-controls={filter.popoverId}
        aria-haspopup="dialog"
        aria-expanded={filter.expanded}
        aria-pressed={filter.active}
        onClick={(event) => filter.onOpen(event.currentTarget)}
      >
        <svg
          className={`size-4 ${filter.active ? "text-accent" : "text-text-muted"}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 4h14l-5.2 6v5l-3.6 1.5V10L3 4Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    );

  return (
    <th className={className} scope="col" aria-sort={direction ?? undefined}>
      {filter === undefined ? (
        sortButton
      ) : (
        <div className="grid min-w-0 gap-1">
          <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
          <div className="flex min-w-0 gap-1">
            {compactSortButton}
            {filterButton}
          </div>
        </div>
      )}
    </th>
  );
}
