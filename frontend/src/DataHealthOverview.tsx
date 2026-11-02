import {
  BarChartIcon,
  TableIcon,
  LayersIcon,
  ShieldCheckIcon,
  FileSpreadsheetIcon,
  RefreshCwIcon,
  ArrowRightIcon,
} from "./icons";
import { CompletenessBadge } from "./CompletenessBadge";
import type { ColumnCompleteness } from "./ColumnCompletenessChart";

export type AnalysisMode = "completeness" | "formal_terms" | "group_data" | "data_contract";

interface DataHealthOverviewProps {
  fileName: string;
  worksheetName: string;
  inputRows: number;
  columns: ColumnCompleteness[];
  onSelectMode: (mode: AnalysisMode) => void;
  onResetFile: () => void;
  activeMode: AnalysisMode | "choose";
}

export function DataHealthOverview({
  fileName,
  worksheetName,
  inputRows,
  columns,
  onSelectMode,
  onResetFile,
  activeMode,
}: DataHealthOverviewProps) {
  const columnCount = columns.length;
  const totalCells = inputRows * columnCount;

  const totalPresentCells = columns.reduce((acc, col) => acc + col.present_count, 0);
  const totalMissingCells = columns.reduce((acc, col) => acc + col.missing_count, 0);

  const overallCompletenessShare = totalCells > 0 ? totalPresentCells / totalCells : 1;
  const overallPercentage = Math.round(overallCompletenessShare * 100);

  const columnsWithMissing = columns.filter((col) => col.missing_count > 0);

  return (
    <section
      className="grid min-w-0 gap-5 rounded-panel border border-border bg-surface p-4 shadow-card sm:p-6"
      aria-label="Dataset health overview"
    >
      {/* File & Global Actions Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-accent text-accent">
            <FileSpreadsheetIcon className="size-5" />
          </span>
          <div className="grid min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-bold text-text sm:text-lg">
                {fileName}
              </h2>
              {worksheetName && (
                <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-text-secondary border border-border">
                  Sheet: {worksheetName}
                </span>
              )}
            </div>
            <p className="m-0 text-xs text-text-muted">
              {inputRows.toLocaleString()} rows · {columnCount} columns · Stored in local memory
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onResetFile}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-border-strong bg-action-secondary px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text active:translate-y-px focus-visible:outline-3 focus-visible:outline-focus-ring"
        >
          <RefreshCwIcon className="size-3.5" />
          Choose Another File
        </button>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="grid min-w-0 gap-1 rounded-control border border-border bg-surface-muted p-3.5">
          <span className="text-xs font-medium text-text-muted">Overall Completeness</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-text">
              {overallPercentage}%
            </span>
            <CompletenessBadge share={overallCompletenessShare} showIcon={false} />
          </div>
          <span className="text-xs text-text-muted">
            {totalPresentCells.toLocaleString()} of {totalCells.toLocaleString()} values
          </span>
        </div>

        <div className="grid min-w-0 gap-1 rounded-control border border-border bg-surface-muted p-3.5">
          <span className="text-xs font-medium text-text-muted">Total Input Rows</span>
          <p className="m-0 text-2xl font-bold tracking-tight text-text">
            {inputRows.toLocaleString()}
          </p>
          <span className="text-xs text-text-muted">Rows analyzed</span>
        </div>

        <div className="grid min-w-0 gap-1 rounded-control border border-border bg-surface-muted p-3.5">
          <span className="text-xs font-medium text-text-muted">Total Columns</span>
          <p className="m-0 text-2xl font-bold tracking-tight text-text">
            {columnCount}
          </p>
          <span className="text-xs text-text-muted">Fields in dataset</span>
        </div>

        <div className="grid min-w-0 gap-1 rounded-control border border-border bg-surface-muted p-3.5">
          <span className="text-xs font-medium text-text-muted">Columns with Missing Data</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-text">
              {columnsWithMissing.length}
            </span>
            <span className="text-xs font-semibold text-text-secondary">
              of {columnCount}
            </span>
          </div>
          <span className="text-xs text-text-muted">
            {totalMissingCells.toLocaleString()} empty/null cells
          </span>
        </div>
      </div>

      {/* 4 Quick Action Cards */}
      <div className="grid min-w-0 gap-3 pt-2">
        <div className="flex items-center justify-between">
          <p className="m-0 text-xs font-bold uppercase tracking-wider text-text-secondary">
            Select an analysis to dive deeper:
          </p>
          <span className="text-xs text-text-muted">Click to jump into mode</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Completeness Patterns */}
          <button
            type="button"
            onClick={() => onSelectMode("completeness")}
            className={`group grid min-h-36 min-w-0 content-between rounded-panel border p-4 text-left transition-all hover:border-accent hover:shadow-card focus-visible:outline-3 focus-visible:outline-focus-ring ${
              activeMode === "completeness"
                ? "border-accent bg-surface-accent/30 shadow-sm"
                : "border-border bg-surface"
            }`}
          >
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-control bg-accent/10 text-accent">
                  <BarChartIcon className="size-5" />
                </span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-text-secondary border border-border">
                  Core Profiler
                </span>
              </div>
              <div>
                <p className="m-0 text-sm font-bold text-text group-hover:text-accent">
                  Completeness Patterns
                </p>
                <p className="m-0 line-clamp-2 text-xs text-text-muted">
                  Discover combinations of present & missing columns across rows.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 pt-2 text-xs font-semibold text-accent">
              <span>View Patterns</span>
              <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>

          {/* Card 2: Formal Terms */}
          <button
            type="button"
            onClick={() => onSelectMode("formal_terms")}
            className={`group grid min-h-36 min-w-0 content-between rounded-panel border p-4 text-left transition-all hover:border-accent hover:shadow-card focus-visible:outline-3 focus-visible:outline-focus-ring ${
              activeMode === "formal_terms"
                ? "border-accent bg-surface-accent/30 shadow-sm"
                : "border-border bg-surface"
            }`}
          >
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-control bg-accent/10 text-accent">
                  <TableIcon className="size-5" />
                </span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-text-secondary border border-border">
                  Format Patterns
                </span>
              </div>
              <div>
                <p className="m-0 text-sm font-bold text-text group-hover:text-accent">
                  Formal Terms
                </p>
                <p className="m-0 line-clamp-2 text-xs text-text-muted">
                  Identify recurring exact terms, letter formats, and case styles.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 pt-2 text-xs font-semibold text-accent">
              <span>Explore Terms</span>
              <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>

          {/* Card 3: Group Data */}
          <button
            type="button"
            onClick={() => onSelectMode("group_data")}
            className={`group grid min-h-36 min-w-0 content-between rounded-panel border p-4 text-left transition-all hover:border-accent hover:shadow-card focus-visible:outline-3 focus-visible:outline-focus-ring ${
              activeMode === "group_data"
                ? "border-accent bg-surface-accent/30 shadow-sm"
                : "border-border bg-surface"
            }`}
          >
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-control bg-accent/10 text-accent">
                  <LayersIcon className="size-5" />
                </span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-text-secondary border border-border">
                  Uniqueness & Keys
                </span>
              </div>
              <div>
                <p className="m-0 text-sm font-bold text-text group-hover:text-accent">
                  Group Data
                </p>
                <p className="m-0 line-clamp-2 text-xs text-text-muted">
                  Observe value combinations, uniqueness summary, and counts.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 pt-2 text-xs font-semibold text-accent">
              <span>Analyze Groups</span>
              <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>

          {/* Card 4: Data Contracts */}
          <button
            type="button"
            onClick={() => onSelectMode("data_contract")}
            className={`group grid min-h-36 min-w-0 content-between rounded-panel border p-4 text-left transition-all hover:border-accent hover:shadow-card focus-visible:outline-3 focus-visible:outline-focus-ring ${
              activeMode === "data_contract"
                ? "border-accent bg-surface-accent/30 shadow-sm"
                : "border-border bg-surface"
            }`}
          >
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-control bg-accent/10 text-accent">
                  <ShieldCheckIcon className="size-5" />
                </span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-text-secondary border border-border">
                  Schema Validator
                </span>
              </div>
              <div>
                <p className="m-0 text-sm font-bold text-text group-hover:text-accent">
                  Data Contracts
                </p>
                <p className="m-0 line-clamp-2 text-xs text-text-muted">
                  Validate required fields, enums, numbers, and dates against rules.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 pt-2 text-xs font-semibold text-accent">
              <span>Check Contracts</span>
              <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
        </div>
      </div>
    </section>
  );
}
