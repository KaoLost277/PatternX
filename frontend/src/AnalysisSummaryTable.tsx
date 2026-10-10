import { useCallback, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ColumnFilterEditor } from "./ColumnFilterEditor";
import type { ColumnFilterEditorTarget } from "./ColumnFilterEditor";
import { describeColumnValueFilter } from "./columnFilters";
import type { ColumnValueFilter } from "./columnFilters";
import { SortableHeader } from "./SortableHeader";
import { cycleSort } from "./tableSorting";
import type { SortState } from "./tableSorting";
import {
  dataAnalysisActionCellClasses,
  dataAnalysisActionHeaderClasses,
  dataAnalysisSortableHeaderClasses,
  secondaryButtonClasses,
  separatedSummaryTableClasses,
  statusTextClasses,
  summaryTableFrameClasses,
} from "./uiClasses";
import { projectSummaryRows } from "./summaryTable";
import type { SummaryFilters, SummaryTableColumn } from "./summaryTable";

interface AnalysisSummaryTableProps<Row, Key extends string> {
  ariaLabel: string;
  rows: readonly Row[];
  columns: readonly SummaryTableColumn<Row, Key>[];
  renderAction: (row: Row, sourceIndex: number) => ReactNode;
  previewLimit: number | null;
  previewLabel: string;
}

export function AnalysisSummaryTable<Row, Key extends string>({
  ariaLabel,
  rows,
  columns,
  renderAction,
  previewLimit,
  previewLabel,
}: AnalysisSummaryTableProps<Row, Key>) {
  const [filters, setFilters] = useState<SummaryFilters<Key>>(() => new Map());
  const [sortState, setSortState] = useState<SortState<Key> | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [filterEditorTarget, setFilterEditorTarget] =
    useState<ColumnFilterEditorTarget<Key> | null>(null);
  const filterPopoverId = useId();
  const closeFilterEditor = useCallback(() => setFilterEditorTarget(null), []);
  const effectiveLimit = showAll ? null : previewLimit;
  const { rows: visibleRows, matchedCount } = useMemo(
    () => projectSummaryRows(rows, columns, filters, sortState, effectiveLimit),
    [columns, effectiveLimit, filters, rows, sortState],
  );
  const activeFilters = columns.flatMap((column) => {
    const filter = filters.get(column.key);
    return filter === undefined ? [] : [{ column, filter }];
  });

  function openFilterEditor(
    key: Key,
    label: string,
    allowsMissing: boolean,
    trigger: HTMLButtonElement,
  ) {
    if (filterEditorTarget?.key === key) {
      setFilterEditorTarget(null);
      return;
    }

    setFilterEditorTarget({
      key,
      label,
      trigger,
      filter: filters.get(key),
      allowsMissing,
    });
  }

  function handleFilterApplied(key: Key, filter: ColumnValueFilter) {
    setFilters((currentFilters) => new Map(currentFilters).set(key, filter));
  }

  function handleColumnFilterCleared(key: Key) {
    setFilters((currentFilters) => {
      const nextFilters = new Map(currentFilters);
      nextFilters.delete(key);
      return nextFilters;
    });
  }

  function handleAllFiltersCleared() {
    setFilters(new Map());
  }

  function handleSortChanged(key: Key) {
    setSortState((currentSort) => cycleSort(currentSort, key));
  }

  const hasMoreRows = previewLimit !== null && matchedCount > previewLimit;

  return (
    <div className="grid min-w-0 gap-3">
      {activeFilters.length > 0 && (
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={statusTextClasses} role="status">
              {activeFilters.length} column filter{activeFilters.length === 1 ? " is" : "s are"} active.
              {" "}These filters only affect the rows displayed in this summary.
              {" "}{matchedCount} matching summary entries.
            </p>
            <button
              type="button"
              className={secondaryButtonClasses}
              onClick={handleAllFiltersCleared}
            >
              Clear all filters
            </button>
          </div>
          <ul className="m-0 flex min-w-0 flex-wrap gap-2 p-0" aria-label="Active summary filters">
            {activeFilters.map(({ column, filter }) => (
              <li
                className="inline-flex min-h-10 max-w-full items-center gap-1 rounded-control border border-border-strong bg-surface px-2 text-sm text-text-secondary"
                key={column.key}
              >
                <button
                  type="button"
                  className="min-h-9 min-w-0 break-words rounded-sm px-1 text-left hover:text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  aria-label={`Edit filter for ${column.label}: ${describeColumnValueFilter(filter)}`}
                  aria-controls={filterPopoverId}
                  aria-haspopup="dialog"
                  onClick={(event) =>
                    openFilterEditor(
                      column.key,
                      column.label,
                      column.filterValue.kind === "nullable-text",
                      event.currentTarget,
                    )
                  }
                >
                  {column.label}: {describeColumnValueFilter(filter)}
                </button>
                <button
                  type="button"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-base text-text-muted hover:text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  aria-label={`Remove filter for ${column.label}`}
                  onClick={() => handleColumnFilterCleared(column.key)}
                >
                  <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="m4 4 8 8m0-8-8 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className={`${summaryTableFrameClasses} max-h-[min(60vh,40rem)] overflow-auto overscroll-contain`}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
      >
        <table className={separatedSummaryTableClasses}>
          <thead>
            <tr>
              <th className={dataAnalysisActionHeaderClasses} scope="col">
                Input Row details
              </th>
              {columns.map((column) => (
                <SortableHeader
                  key={column.key}
                  className={dataAnalysisSortableHeaderClasses}
                  label={column.label}
                  sortKey={column.key}
                  sortState={sortState}
                  onSort={handleSortChanged}
                  filter={{
                    active: filters.has(column.key),
                    expanded: filterEditorTarget?.key === column.key,
                    popoverId: filterPopoverId,
                    onOpen: (trigger) =>
                      openFilterEditor(
                        column.key,
                        column.label,
                        column.filterValue.kind === "nullable-text",
                        trigger,
                      ),
                  }}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1}>
                  {activeFilters.length > 0
                    ? "No summary entries match the current filters."
                    : "No summary entries are available."}
                </td>
              </tr>
            ) : (
              visibleRows.map(({ row, sourceIndex }) => (
                <tr key={sourceIndex}>
                  <td className={dataAnalysisActionCellClasses}>
                    {renderAction(row, sourceIndex)}
                  </td>
                  {columns.map((column) => {
                    const cell = column.renderCell(row);
                    if (column.rowHeader === true) {
                      return (
                        <th scope="row" key={column.key}>
                          {cell}
                        </th>
                      );
                    }
                    return <td key={column.key}>{cell}</td>;
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasMoreRows && (
        <button
          type="button"
          className={secondaryButtonClasses}
          onClick={() => setShowAll((currentShowAll) => !currentShowAll)}
        >
          {showAll
            ? `Show first ${previewLimit} ${previewLabel}`
            : `Show all ${previewLabel}`}
        </button>
      )}

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
