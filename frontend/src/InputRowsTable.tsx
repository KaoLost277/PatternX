import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent, SyntheticEvent } from "react";
import { describeRowColumnFilter } from "./rowFilters";
import type { RowColumnFilter, RowColumnFilters } from "./rowFilters";
import {
  hintTextClasses,
  primaryButtonClasses,
  rowDetailsTableCellClasses,
  rowDetailsTableHeaderClasses,
  secondaryButtonClasses,
  separatedSummaryTableClasses,
  statusTextClasses,
  summaryTableFrameClasses,
} from "./uiClasses";

type TextFilterMatch = "contains" | "exact";

type RowFilterDraft =
  | { kind: "text"; match: TextFilterMatch; value: string }
  | { kind: "missing" };

type FilterEditorState =
  | { kind: "closed" }
  | {
      kind: "editing";
      columnName: string;
      draft: RowFilterDraft;
      left: number;
      top: number;
    };

interface InputRowsTableProps {
  ariaLabel: string;
  columns: string[];
  rows: (string | null)[][];
  filters: RowColumnFilters;
  onFiltersChanged: (filters: RowColumnFilters) => void;
}

function draftForFilter(filter: RowColumnFilter | undefined): RowFilterDraft {
  if (filter === undefined) {
    return { kind: "text", match: "contains", value: "" };
  }
  if (filter.kind === "missing") {
    return { kind: "missing" };
  }
  return {
    kind: "text",
    match: filter.kind,
    value: filter.value,
  };
}

function displayColumnName(columnName: string, columnIndex: number): string {
  return columnName.length > 0 ? columnName : `Column ${columnIndex + 1}`;
}

function filterForColumn(
  filters: RowColumnFilters,
  columnName: string,
): RowColumnFilter | undefined {
  return Object.prototype.hasOwnProperty.call(filters, columnName)
    ? filters[columnName]
    : undefined;
}

export function InputRowsTable({
  ariaLabel,
  columns,
  rows,
  filters,
  onFiltersChanged,
}: InputRowsTableProps) {
  const [filterEditor, setFilterEditor] = useState<FilterEditorState>({ kind: "closed" });
  const filterPopoverId = useId();
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterMatchSelectRef = useRef<HTMLSelectElement>(null);
  const filterValueInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (filterEditor.kind !== "editing") {
      return;
    }

    function closeFilterEditor() {
      const filterPopover = filterPopoverRef.current;
      if (filterPopover?.matches(":popover-open")) {
        filterPopover.hidePopover();
      }
      setFilterEditor({ kind: "closed" });
    }

    window.addEventListener("scroll", closeFilterEditor, true);
    window.addEventListener("resize", closeFilterEditor);
    return () => {
      window.removeEventListener("scroll", closeFilterEditor, true);
      window.removeEventListener("resize", closeFilterEditor);
    };
  }, [filterEditor.kind]);

  function openFilterEditor(columnName: string, trigger: HTMLButtonElement) {
    const currentPopover = filterPopoverRef.current;
    if (
      filterEditor.kind === "editing" &&
      filterEditor.columnName === columnName &&
      currentPopover?.matches(":popover-open")
    ) {
      currentPopover.hidePopover();
      setFilterEditor({ kind: "closed" });
      return;
    }

    if (currentPopover?.matches(":popover-open")) {
      currentPopover.hidePopover();
    }

    const triggerBounds = trigger.getBoundingClientRect();
    const popoverWidth = Math.min(320, window.innerWidth - 16);
    const left = Math.max(
      8,
      Math.min(triggerBounds.left, window.innerWidth - popoverWidth - 8),
    );
    const belowTrigger = triggerBounds.bottom + 8;
    const top =
      belowTrigger + 240 <= window.innerHeight - 8
        ? belowTrigger
        : Math.max(8, triggerBounds.top - 240);

    filterTriggerRef.current = trigger;
    setFilterEditor({
      kind: "editing",
      columnName,
      draft: draftForFilter(filterForColumn(filters, columnName)),
      left,
      top,
    });
    window.requestAnimationFrame(() => {
      const filterPopover = filterPopoverRef.current;
      if (filterPopover !== null && !filterPopover.matches(":popover-open")) {
        filterPopover.showPopover();
      }
      if (filterPopoverRef.current?.matches(":popover-open")) {
        const valueInput = filterValueInputRef.current;
        if (valueInput !== null) {
          valueInput.focus();
        } else {
          filterMatchSelectRef.current?.focus();
        }
      }
    });
  }

  function closeFilterEditor() {
    const filterPopover = filterPopoverRef.current;
    if (filterPopover?.matches(":popover-open")) {
      filterPopover.hidePopover();
    }
    setFilterEditor({ kind: "closed" });
  }

  function handleFilterPopoverToggled(event: SyntheticEvent<HTMLDivElement>) {
    const toggleEvent = event.nativeEvent;
    if (
      typeof ToggleEvent !== "undefined" &&
      toggleEvent instanceof ToggleEvent &&
      toggleEvent.newState === "closed"
    ) {
      setFilterEditor({ kind: "closed" });
    }
  }

  function handleFilterMatchChanged(event: ChangeEvent<HTMLSelectElement>) {
    const nextMatch = event.currentTarget.value;
    setFilterEditor((previousEditor) => {
      if (previousEditor.kind !== "editing") {
        return previousEditor;
      }
      if (nextMatch === "missing") {
        return { ...previousEditor, draft: { kind: "missing" } };
      }

      const match: TextFilterMatch = nextMatch === "exact" ? "exact" : "contains";
      const value =
        previousEditor.draft.kind === "text" ? previousEditor.draft.value : "";
      return {
        ...previousEditor,
        draft: { kind: "text", match, value },
      };
    });
  }

  function handleFilterValueChanged(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    setFilterEditor((previousEditor) => {
      if (previousEditor.kind !== "editing" || previousEditor.draft.kind !== "text") {
        return previousEditor;
      }
      return {
        ...previousEditor,
        draft: { ...previousEditor.draft, value },
      };
    });
  }

  function handleFilterApplied(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filterEditor.kind !== "editing") {
      return;
    }

    let nextFilter: RowColumnFilter;
    if (filterEditor.draft.kind === "missing") {
      nextFilter = { kind: "missing" };
    } else {
      if (filterEditor.draft.value.length === 0) {
        return;
      }
      nextFilter = {
        kind: filterEditor.draft.match,
        value: filterEditor.draft.value,
      };
    }

    onFiltersChanged({ ...filters, [filterEditor.columnName]: nextFilter });
    closeFilterEditor();
  }

  function handleColumnFilterCleared() {
    if (filterEditor.kind !== "editing") {
      return;
    }

    const nextFilters = Object.fromEntries(
      Object.entries(filters).filter(([columnName]) => columnName !== filterEditor.columnName),
    );
    onFiltersChanged(nextFilters);
    closeFilterEditor();
  }

  function handleAllFiltersCleared() {
    onFiltersChanged({});
  }

  function handleFilterEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      filterTriggerRef.current?.focus();
    }
  }

  const activeFilters = Object.entries(filters);
  const filterEditorColumnIndex =
    filterEditor.kind === "editing" ? columns.indexOf(filterEditor.columnName) : -1;
  let filterEditorColumnName = "column";
  let filterMatch = "contains";
  let filterValue = "";
  let filterValueInputHidden = false;
  if (filterEditor.kind === "editing") {
    if (filterEditorColumnIndex >= 0) {
      filterEditorColumnName = displayColumnName(
        filterEditor.columnName,
        filterEditorColumnIndex,
      );
    } else {
      filterEditorColumnName = filterEditor.columnName || "Unnamed column";
    }

    if (filterEditor.draft.kind === "missing") {
      filterMatch = "missing";
      filterValueInputHidden = true;
    } else {
      filterMatch = filterEditor.draft.match;
      filterValue = filterEditor.draft.value;
    }
  }

  return (
    <div className="grid min-w-0 gap-3">
      {activeFilters.length > 0 && (
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={statusTextClasses} role="status">
              {activeFilters.length} column {activeFilters.length === 1 ? "filter is" : "filters are"} active.
              {" "}Filters apply to all matching Input Rows and CSV exports.
            </p>
            <button
              type="button"
              className={secondaryButtonClasses}
              onClick={handleAllFiltersCleared}
            >
              Clear all filters
            </button>
          </div>
          <ul className="m-0 flex min-w-0 flex-wrap gap-2 p-0" aria-label="Active column filters">
            {activeFilters.map(([columnName, filter]) => {
              const visibleColumnIndex = columns.indexOf(columnName);
              const displayedColumnName =
                visibleColumnIndex >= 0
                  ? displayColumnName(columnName, visibleColumnIndex)
                  : columnName || "Unnamed column";
              return (
                <li
                  className="inline-flex min-h-10 max-w-full items-center gap-1 rounded-control border border-border-strong bg-surface px-2 text-sm text-text-secondary"
                  key={columnName}
                >
                  <button
                    type="button"
                    className="min-h-9 min-w-0 break-words rounded-sm px-1 text-left hover:text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    aria-label={`Edit filter for ${displayedColumnName}: ${describeRowColumnFilter(filter)}`}
                    aria-controls={filterPopoverId}
                    aria-haspopup="dialog"
                    onClick={(event) =>
                      openFilterEditor(columnName, event.currentTarget)
                    }
                  >
                    {displayedColumnName}: {describeRowColumnFilter(filter)}
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-base text-text-muted hover:text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    aria-label={`Remove filter for ${displayedColumnName}`}
                    onClick={() => {
                      const nextFilters = Object.fromEntries(
                        activeFilters.filter(([activeColumnName]) => activeColumnName !== columnName),
                      );
                      onFiltersChanged(nextFilters);
                    }}
                  >
                    <svg
                      className="size-4"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="m4 4 8 8m0-8-8 8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div
        className={`${summaryTableFrameClasses} max-h-[min(56vh,35rem)] overflow-auto overscroll-contain`}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
      >
        <table className={separatedSummaryTableClasses}>
          <thead>
            <tr>
              {columns.map((columnName, columnIndex) => {
                const displayedColumnName = displayColumnName(columnName, columnIndex);
                const columnFilterActive = filterForColumn(filters, columnName) !== undefined;
                const editorOpenForColumn =
                  filterEditor.kind === "editing" &&
                  filterEditor.columnName === columnName;

                return (
                  <th
                    className={rowDetailsTableHeaderClasses}
                    key={columnIndex}
                    scope="col"
                  >
                    <button
                      type="button"
                      className="flex min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-sm text-left font-[inherit] text-inherit hover:text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      aria-label={`Filter ${displayedColumnName}`}
                      aria-controls={filterPopoverId}
                      aria-haspopup="dialog"
                      aria-expanded={editorOpenForColumn}
                      aria-pressed={columnFilterActive}
                      onClick={(event) =>
                        openFilterEditor(columnName, event.currentTarget)
                      }
                    >
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        {displayedColumnName}
                      </span>
                      <svg
                        className={`size-4 shrink-0 ${columnFilterActive ? "text-accent" : "text-text-muted"}`}
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
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((_, columnIndex) => (
                  <td className={rowDetailsTableCellClasses} key={columnIndex}>
                    <span className="[overflow-wrap:anywhere]">
                      {row[columnIndex] ?? "Not set"}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        ref={filterPopoverRef}
        className={`fixed inset-auto z-20 w-[min(20rem,calc(100vw-1rem))] gap-3 rounded-panel border border-border bg-surface p-4 text-text shadow-dialog ${filterEditor.kind === "editing" ? "grid" : "hidden"}`}
        style={
          filterEditor.kind === "editing"
            ? { left: `${filterEditor.left}px`, top: `${filterEditor.top}px` }
            : undefined
        }
        popover="auto"
        role="dialog"
        aria-labelledby={`${filterPopoverId}-title`}
        onToggle={handleFilterPopoverToggled}
        onKeyDown={handleFilterEditorKeyDown}
      >
        <div className="grid min-w-0 gap-2">
          <h2 className="text-base font-semibold" id={`${filterPopoverId}-title`}>
            Filter {filterEditorColumnName}
          </h2>
          <label className="grid min-w-0 gap-1 text-sm font-medium text-text-secondary">
            <span>Match type</span>
            <select
              ref={filterMatchSelectRef}
              className="min-h-10 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              value={filterMatch}
              aria-label={`Match type for ${filterEditorColumnName}`}
              onChange={handleFilterMatchChanged}
            >
              <option value="contains">Contains</option>
              <option value="exact">Exactly matches</option>
              <option value="missing">Missing Value</option>
            </select>
          </label>
          {!filterValueInputHidden && (
            <label className="grid min-w-0 gap-1 text-sm font-medium text-text-secondary">
              <span>Value</span>
              <input
                ref={filterValueInputRef}
                type="search"
                value={filterValue}
                className="min-h-10 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                aria-label={`Value for ${filterEditorColumnName} filter`}
                onChange={handleFilterValueChanged}
              />
            </label>
          )}
          <p className={hintTextClasses}>
            Contains ignores letter case. Exact matches preserve case and spacing. Missing Value
            uses the configured rules.
          </p>
        </div>
        <form className="flex flex-wrap gap-2" onSubmit={handleFilterApplied}>
          <button
            type="submit"
            className={primaryButtonClasses}
            disabled={
              filterEditor.kind !== "editing" ||
              (filterEditor.draft.kind === "text" && filterEditor.draft.value.length === 0)
            }
          >
            Apply filter
          </button>
          {filterEditor.kind === "editing" &&
            filterForColumn(filters, filterEditor.columnName) !== undefined && (
            <button
              type="button"
              className={secondaryButtonClasses}
              onClick={handleColumnFilterCleared}
            >
              Clear this filter
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
