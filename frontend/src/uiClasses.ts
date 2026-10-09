export const primaryButtonClasses =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-action-primary bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover active:translate-y-px active:bg-action-primary-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClasses =
  "inline-flex min-h-10 items-center justify-center rounded-control border border-border-strong bg-action-secondary px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted active:translate-y-px active:bg-surface-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-60";

export const statusTextClasses = "m-0 min-w-0 break-words text-sm text-text-secondary";

export const hintTextClasses = "m-0 max-w-[90ch] break-words text-sm text-text-muted";

export const errorMessageClasses =
  "m-0 min-w-0 break-words rounded-control border border-error-border bg-error-surface px-4 py-3 text-sm text-error-text";

export const loadingSpinnerClasses =
  "inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent align-[-2px] motion-reduce:animate-none";

export const summaryTableFrameClasses =
  "w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-control border border-border bg-surface shadow-card focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

const summaryTableCellClasses =
  "w-full text-left text-sm text-text-secondary [&_th]:max-w-72 [&_th]:break-words [&_th]:border-b [&_th]:border-border [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:align-top [&_td]:break-words [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_thead]:bg-surface-muted [&_thead_th]:text-xs [&_thead_th]:font-semibold [&_tbody_th]:font-semibold [&_tbody_th]:text-text [&_tbody_tr:hover]:bg-surface-muted";

export const summaryTableClasses = `${summaryTableCellClasses} border-collapse`;

export const separatedSummaryTableClasses = `${summaryTableCellClasses} border-separate border-spacing-0`;

export const dialogClasses =
  "m-auto max-h-[calc(100dvh-2rem)] w-[min(96vw,90rem)] max-w-none flex-col gap-5 overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-text shadow-dialog backdrop:bg-slate-900/55 backdrop:backdrop-blur-sm open:flex sm:p-8";
