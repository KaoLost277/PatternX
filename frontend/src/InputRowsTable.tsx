import { useCallback, useId, useState } from "react";
import { ColumnFilterEditor } from "./ColumnFilterEditor";
import type { ColumnFilterEditorTarget } from "./ColumnFilterEditor";
import { describeColumnValueFilter } from "./columnFilters";
import type { RowColumnFilter, RowColumnFilters } from "./rowFilters";
import {
  rowDetailsTableCellClasses,
  rowDetailsTableHeaderClasses,
  secondaryButtonClasses,
  separatedSummaryTableClasses,
  statusTextClasses,
  summaryTableFrameClasses,
} from "./uiClasses";

interface InputRowsTableProps {
  ariaLabel: string;
  columns: string[];
  rows: (string | null)[][];
  filters: RowColumnFilters;
  onFiltersChanged: (filters: RowColumnFilters) => void;
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
  const [filterEditorTarget, setFilterEditorTarget] =
    useState<ColumnFilterEditorTarget<string> | null>(null);
  const filterPopoverId = useId();
  const closeFilterEditor = useCallback(() => setFilterEditorTarget(null), []);

  function openFilterEditor(columnName: string, trigger: HTMLButtonElement) {
    if (filterEditorTarget?.key === columnName) {
      setFilterEditorTarget(null);
      return;
    }

    const columnIndex = columns.indexOf(columnName);
    setFilterEditorTarget({
      key: columnName,
      label: displayColumnName(columnName, columnIndex),
      trigger,
      filter: filterForColumn(filters, columnName),
      allowsMissing: true,
    });
  }

  function handleFilterApplied(columnName: string, filter: RowColumnFilter) {
    onFiltersChanged({ ...filters, [columnName]: filter });
  }

  function handleColumnFilterCleared(columnName: string) {
    const nextFilters = Object.fromEntries(
      Object.entries(filters).filter(([activeColumnName]) => activeColumnName !== columnName),
    );
    onFiltersChanged(nextFilters);
  }

  function handleAllFiltersCleared() {
    onFiltersChanged({});
  }

  const activeFilters = Object.entries(filters);

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
                    aria-label={`Edit filter for ${displayedColumnName}: ${describeColumnValueFilter(filter)}`}
                    aria-controls={filterPopoverId}
                    aria-haspopup="dialog"
                    onClick={(event) =>
                      openFilterEditor(columnName, event.currentTarget)
                    }
                  >
                    {displayedColumnName}: {describeColumnValueFilter(filter)}
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
                      aria-expanded={filterEditorTarget?.key === columnName}
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

      <ColumnFilterEditor
        key={filterEditorTarget === null ? "closed" : `editing:${filterEditorTarget.key}`}
        popoverId={filterPopoverId}
        target={filterEditorTarget}
        onApply={handleFilterApplied}
        onClear={handleColumnFilterCleared}
        onClose={closeFilterEditor}
      />
    </div>
  );
}
