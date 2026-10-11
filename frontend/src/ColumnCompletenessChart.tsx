import { useState } from "react";
import { formatShare } from "./displayFormat";
import {
  hintTextClasses,
  secondaryButtonClasses,
  statusTextClasses,
} from "./uiClasses";

export interface ColumnCompleteness {
  name: string;
  present_count: number;
  present_share: number;
  missing_count: number;
  missing_share: number;
}

export type ColumnCompletenessChartOrder = "missing" | "present" | "source";
export type ColumnStatus = "present" | "missing";

interface ColumnCompletenessChartProps {
  columns: readonly ColumnCompleteness[];
  inputRows: number;
  onStatusSelected: (columnIndex: number, status: ColumnStatus) => void;
}

interface ColumnCompletenessChartViewProps extends ColumnCompletenessChartProps {
  columnOrder: ColumnCompletenessChartOrder;
  onColumnOrderChanged: (order: ColumnCompletenessChartOrder) => void;
}

interface IndexedColumn {
  column: ColumnCompleteness;
  sourceIndex: number;
}

function compareColumns(
  order: ColumnCompletenessChartOrder,
  left: IndexedColumn,
  right: IndexedColumn,
): number {
  if (order === "source") {
    return left.sourceIndex - right.sourceIndex;
  }

  const leftShare = order === "missing" ? left.column.missing_share : left.column.present_share;
  const rightShare = order === "missing" ? right.column.missing_share : right.column.present_share;
  const shareDifference = rightShare - leftShare;
  return shareDifference === 0 ? left.sourceIndex - right.sourceIndex : shareDifference;
}

function formatCount(count: number): string {
  return count.toLocaleString();
}

export function ColumnCompletenessChartView({
  columns,
  inputRows,
  columnOrder,
  onColumnOrderChanged,
  onStatusSelected,
}: ColumnCompletenessChartViewProps) {
  const orderedColumns = columns
    .map((column, sourceIndex) => ({ column, sourceIndex }))
    .sort((left, right) => compareColumns(columnOrder, left, right));

  function renderStatusSegment(
    column: ColumnCompleteness,
    status: ColumnStatus,
  ) {
    const isPresent = status === "present";
    const share = isPresent ? column.present_share : column.missing_share;

    return (
      <span
        className={[
          "block h-8 shrink-0",
          isPresent ? "rounded-l-full bg-accent" : "rounded-r-full bg-text-muted",
        ].join(" ")}
        style={{ width: `${Math.max(0, Math.min(share, 1)) * 100}%` }}
        aria-hidden="true"
      />
    );
  }

  return (
    <section className="grid min-w-0 gap-3" aria-labelledby="column-completeness-chart-heading">
      <div className="grid min-w-0 gap-2">
        <div className="grid min-w-0 gap-1">
          <h3
            className="m-0 text-base font-semibold text-text"
            id="column-completeness-chart-heading"
          >
            Column Completeness by column
          </h3>
          <p className={statusTextClasses}>
            {formatCount(inputRows)} Input Rows · present and missing shares use all Input Rows.
          </p>
        </div>
        <label className="grid w-full max-w-sm min-w-0 gap-1 text-sm font-medium text-text-secondary">
          <span>Order columns by</span>
          <select
            className="min-h-10 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-2 text-text hover:border-accent active:bg-surface-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            aria-label="Order columns by"
            value={columnOrder}
            onChange={(event) =>
              onColumnOrderChanged(event.target.value as ColumnCompletenessChartOrder)
            }
          >
            <option value="missing">Most missing first</option>
            <option value="present">Most present first</option>
            <option value="source">Source order</option>
          </select>
        </label>
      </div>

      {columns.length === 0 ? (
        <p className={hintTextClasses} role="status">
          No columns are available to chart.
        </p>
      ) : (
        <div
          className="grid max-h-[min(60vh,40rem)] min-w-0 gap-3 overflow-y-auto overscroll-contain rounded-control border border-border bg-surface p-3"
          role="region"
          aria-label="Column Completeness chart. Scroll to view all columns."
          tabIndex={0}
        >
          {orderedColumns.map(({ column, sourceIndex }) => (
            <div
              className="grid min-w-0 gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0"
              key={sourceIndex}
            >
              <h4 className="m-0 break-words text-sm font-semibold text-text">{column.name}</h4>
              <div
                className="flex min-w-0 rounded-full bg-surface-muted"
                role="img"
                aria-label={
                  `Present: ${formatCount(column.present_count)} (${formatShare(column.present_share)}). ` +
                  `Missing: ${formatCount(column.missing_count)} (${formatShare(column.missing_share)}).`
                }
              >
                {renderStatusSegment(column, "present")}
                {renderStatusSegment(column, "missing")}
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className={`${secondaryButtonClasses} w-full min-w-0 justify-start break-words`}
                  disabled={column.present_count === 0}
                  aria-label={
                    `View Input Rows with present values in ${column.name}. ` +
                    `${formatCount(column.present_count)} Input Rows, ` +
                    `${formatShare(column.present_share)} of all Input Rows.`
                  }
                  onClick={() => onStatusSelected(sourceIndex, "present")}
                >
                  Present: {formatCount(column.present_count)} ({formatShare(column.present_share)})
                  {" · View rows"}
                </button>
                <button
                  type="button"
                  className={`${secondaryButtonClasses} w-full min-w-0 justify-start break-words`}
                  disabled={column.missing_count === 0}
                  aria-label={
                    `View Input Rows with missing values in ${column.name}. ` +
                    `${formatCount(column.missing_count)} Input Rows, ` +
                    `${formatShare(column.missing_share)} of all Input Rows.`
                  }
                  onClick={() => onStatusSelected(sourceIndex, "missing")}
                >
                  Missing: {formatCount(column.missing_count)} ({formatShare(column.missing_share)})
                  {" · View rows"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ColumnCompletenessChart({
  columns,
  inputRows,
  onStatusSelected,
}: ColumnCompletenessChartProps) {
  const [columnOrder, setColumnOrder] = useState<ColumnCompletenessChartOrder>("missing");

  return (
    <ColumnCompletenessChartView
      columns={columns}
      inputRows={inputRows}
      columnOrder={columnOrder}
      onColumnOrderChanged={setColumnOrder}
      onStatusSelected={onStatusSelected}
    />
  );
}
