import type { ReactNode, SyntheticEvent } from "react";

interface CollapsibleSectionProps {
  title: string;
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  summary,
  open,
  onOpenChange,
  children,
}: CollapsibleSectionProps) {
  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    onOpenChange(event.currentTarget.open);
  }

  return (
    <details
      className="group min-w-0 rounded-panel border border-border bg-surface shadow-card"
      open={open}
      onToggle={handleToggle}
    >
      <summary className="grid min-h-16 cursor-pointer list-none grid-cols-[minmax(0,1fr)_minmax(0,auto)_0.75rem] items-center gap-x-4 gap-y-2 rounded-panel px-4 py-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring max-sm:grid-cols-[minmax(0,1fr)_0.75rem] max-sm:px-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 font-semibold text-text">{title}</span>
        {summary && (
          <span className="min-w-0 break-words text-right text-sm font-normal text-text-muted max-sm:col-start-1 max-sm:text-left">
            {summary}
          </span>
        )}
        <svg
          className="size-3 shrink-0 text-text-muted transition-transform group-open:rotate-180 max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1"
          viewBox="0 0 12 8"
          fill="none"
          aria-hidden="true"
        >
          <path d="m1 1 5 5 5-5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </summary>
      <div className="grid min-w-0 gap-4 px-4 pb-5 max-sm:px-3 max-sm:pb-4">{children}</div>
    </details>
  );
}
