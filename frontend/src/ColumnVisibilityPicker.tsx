import { useState } from "react";
import type { ChangeEvent } from "react";
import { hintTextClasses, secondaryButtonClasses } from "./uiClasses";

interface ColumnVisibilityPickerProps {
  columns: string[];
  visibleColumns: string[];
  onVisibleColumnsChanged: (visibleColumns: string[]) => void;
}

export function ColumnVisibilityPicker({
  columns,
  visibleColumns,
  onVisibleColumnsChanged,
}: ColumnVisibilityPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const visibleColumnSet = new Set(visibleColumns);
  const normalizedSearchText = searchText.trim().toLocaleLowerCase();
  const filteredColumns = columns.filter((columnName) => {
    return columnName.toLocaleLowerCase().includes(normalizedSearchText);
  });

  function handleColumnVisibilityChanged(event: ChangeEvent<HTMLInputElement>) {
    const columnName = event.currentTarget.value;
    const nextVisibleColumnSet = new Set(visibleColumns);

    if (event.currentTarget.checked) {
      nextVisibleColumnSet.add(columnName);
    } else {
      nextVisibleColumnSet.delete(columnName);
    }

    onVisibleColumnsChanged(columns.filter((name) => nextVisibleColumnSet.has(name)));
  }

  return (
    <details
      className="group w-full max-w-[45rem]"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary
        className={`${secondaryButtonClasses} inline-flex w-fit list-none gap-3 [&::-webkit-details-marker]:hidden`}
      >
        <span>Columns shown</span>
        <span className="text-sm font-normal text-text-muted">
          {visibleColumns.length} of {columns.length}
        </span>
        <svg className="size-3 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 12 8" fill="none" aria-hidden="true">
          <path d="m1 1 5 5 5-5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </summary>

      {isOpen && (
        <div className="mt-3 grid min-w-0 gap-3 rounded-panel border border-border bg-surface-muted p-4">
          <p className={hintTextClasses}>
            Choose which analyzed columns to display. This does not change the analysis or the
            Pattern filters, which still use all analyzed columns.
          </p>

          <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-text-secondary">
            <span>Search columns</span>
            <input
              type="search"
              value={searchText}
              className="min-h-10 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-2 font-normal text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              aria-label="Search analyzed columns"
              onChange={(event) => setSearchText(event.currentTarget.value)}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButtonClasses}
              disabled={visibleColumns.length === columns.length}
              onClick={() => onVisibleColumnsChanged(columns)}
            >
              Show all
            </button>
            <button
              type="button"
              className={secondaryButtonClasses}
              disabled={visibleColumns.length === 0}
              onClick={() => onVisibleColumnsChanged([])}
            >
              Hide all
            </button>
          </div>

          {filteredColumns.length > 0 ? (
            <div
              className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(min(13.75rem,100%),1fr))] gap-2 overflow-y-auto p-0.5"
              role="group"
              aria-label="Analyzed columns"
            >
              {filteredColumns.map((columnName, columnIndex) => (
                <label
                  className="flex min-h-10 min-w-0 cursor-pointer items-start gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm text-text-secondary has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring"
                  key={columnIndex}
                >
                  <input
                    type="checkbox"
                    className="mt-1 shrink-0"
                    value={columnName}
                    checked={visibleColumnSet.has(columnName)}
                    onChange={handleColumnVisibilityChanged}
                  />
                  <span className="break-words">{columnName}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className={hintTextClasses}>No analyzed columns match this search.</p>
          )}
        </div>
      )}
    </details>
  );
}
