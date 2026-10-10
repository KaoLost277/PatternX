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
  const sortButton = (
    <button
      type="button"
      className={`${sortableHeaderButtonClasses} ${filter === undefined ? "w-full" : "min-w-0 flex-1"} ${direction === null ? "" : "text-accent"}`}
      aria-label={`Sort by ${label}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="min-w-0 break-words">{label}</span>
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
        <div className="flex min-w-0 items-center gap-1">
          {sortButton}
          {filterButton}
        </div>
      )}
    </th>
  );
}
