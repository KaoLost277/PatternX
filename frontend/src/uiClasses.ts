export const primaryButtonClasses = [
  "inline-flex min-h-11 items-center justify-center rounded-control border",
  "border-action-primary bg-action-primary px-4 py-2 text-sm font-semibold text-white",
  "transition-colors hover:bg-action-primary-hover active:translate-y-px",
  "active:bg-action-primary-hover focus-visible:outline-3 focus-visible:outline-offset-2",
  "focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-60",
].join(" ");

export const secondaryButtonClasses = [
  "inline-flex min-h-10 items-center justify-center rounded-control border",
  "border-border-strong bg-action-secondary px-3 py-2 text-sm font-medium text-text-secondary",
  "transition-colors hover:bg-surface-muted active:translate-y-px active:bg-surface-accent",
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
  "disabled:cursor-not-allowed disabled:opacity-60",
].join(" ");

export const statusTextClasses = "m-0 min-w-0 break-words text-sm text-text-secondary";

export const hintTextClasses = "m-0 max-w-[90ch] break-words text-sm text-text-muted";

export const errorMessageClasses =
  "m-0 min-w-0 break-words rounded-control border border-error-border bg-error-surface px-4 py-3 text-sm text-error-text";

export const loadingSpinnerClasses =
  "inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent align-[-2px] motion-reduce:animate-none";

export const summaryTableFrameClasses = [
  "w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-control border",
  "border-border bg-surface shadow-card focus-visible:outline-3",
  "focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
].join(" ");

const summaryTableCellClasses = [
  "w-full text-left text-sm text-text-secondary",
  "[&_th]:max-w-72 [&_th]:[overflow-wrap:anywhere] [&_th]:border-b [&_th]:border-border",
  "[&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:align-top",
  "[&_td]:[overflow-wrap:anywhere] [&_td]:border-b [&_td]:border-border [&_td]:px-4",
  "[&_td]:py-3 [&_td]:align-top [&_thead]:bg-surface-muted",
  "[&_thead_th]:text-xs [&_thead_th]:font-semibold",
  "[&_tbody_th]:font-semibold [&_tbody_th]:text-text",
  "[&_tbody_tr:hover]:bg-surface-muted",
].join(" ");

export const summaryTableClasses = `${summaryTableCellClasses} border-collapse`;

export const separatedSummaryTableClasses = `${summaryTableCellClasses} border-separate border-spacing-0`;

export const dialogClasses = [
  "m-auto max-h-[calc(100dvh-2rem)] w-[min(96vw,90rem)] max-w-none",
  "flex-col gap-5 overflow-y-auto rounded-2xl border border-border",
  "bg-surface p-4 text-text shadow-dialog backdrop:bg-slate-900/55",
  "backdrop:backdrop-blur-sm open:flex sm:p-8",
].join(" ");

export const collapsibleSummaryClasses = [
  "grid min-h-16 cursor-pointer list-none",
  "grid-cols-[minmax(0,1fr)_minmax(0,auto)_0.75rem] items-center gap-x-4 gap-y-2",
  "rounded-panel px-4 py-3 focus-visible:outline-3 focus-visible:outline-offset-2",
  "focus-visible:outline-focus-ring max-sm:grid-cols-[minmax(0,1fr)_0.75rem]",
  "max-sm:px-3 [&::-webkit-details-marker]:hidden",
].join(" ");

export const sortableHeaderButtonClasses = [
  "flex min-h-10 min-w-0 items-center justify-start bg-transparent p-0",
  "text-left font-[inherit] text-inherit hover:text-accent focus-visible:rounded-sm",
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
].join(" ");

export const dialogHeadingClasses = "text-xl font-semibold tracking-tight text-text";

export const detailSummaryClasses = [
  "min-h-10 cursor-pointer list-none py-2 font-medium text-accent",
  "hover:text-accent-hover focus-visible:outline-3 focus-visible:outline-offset-2",
  "focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden",
].join(" ");

export const warningDetailSummaryClasses = [
  "min-h-10 cursor-pointer list-none py-2 font-medium",
  "hover:text-warning-text active:text-warning-text focus-visible:outline-3",
  "focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
  "[&::-webkit-details-marker]:hidden",
].join(" ");

export const fileColumnsSummaryClasses = [
  "min-h-10 cursor-pointer list-none py-2 text-sm font-semibold text-text",
  "hover:text-accent active:text-accent focus-visible:outline-3",
  "focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
  "[&::-webkit-details-marker]:hidden",
].join(" ");

export const missingValueSummaryClasses = [
  "flex min-h-10 cursor-pointer list-none flex-wrap items-center justify-between gap-2",
  "rounded-control text-sm font-semibold text-text hover:text-accent active:text-accent",
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
  "[&::-webkit-details-marker]:hidden",
].join(" ");

export const analysisOptionClasses = [
  "flex min-h-10 cursor-pointer items-center gap-2 break-words rounded-control border",
  "border-border bg-surface px-3 py-2 text-sm text-text-secondary",
  "has-[:checked]:border-accent has-[:checked]:bg-surface-accent has-[:checked]:text-text",
  "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2",
  "has-[:focus-visible]:outline-focus-ring has-[:disabled]:cursor-not-allowed",
  "has-[:disabled]:text-text-muted",
].join(" ");

export const identifierOptionClasses = [
  "flex min-h-10 cursor-not-allowed items-center gap-2 break-words rounded-control border",
  "border-dashed border-border-strong bg-surface-muted px-3 py-2 text-sm text-text-muted",
].join(" ");

export const dataAnalysisActionHeaderClasses = [
  "sticky left-0 top-0 z-20 min-w-32 bg-surface-muted",
  "shadow-[1px_0_0_var(--color-border)]",
].join(" ");

export const dataAnalysisSortableHeaderClasses =
  "sticky top-0 z-10 min-w-[9.5rem] bg-surface-muted";

export const dataAnalysisActionCellClasses =
  "sticky left-0 z-10 min-w-32 bg-surface shadow-[1px_0_0_var(--color-border)]";

export const rowDetailsTableHeaderClasses =
  "sticky top-0 z-10 min-w-32 max-w-72 bg-surface-muted [overflow-wrap:anywhere]";

export const rowDetailsTableCellClasses = "min-w-32";

export const missingValueTableClasses = [
  "w-full min-w-[34rem] border-collapse text-left text-sm text-text-secondary",
  "[&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2.5",
  "[&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2.5",
].join(" ");
