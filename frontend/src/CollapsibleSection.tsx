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
    <details className="collapsible-section" open={open} onToggle={handleToggle}>
      <summary className="collapsible-section-header">
        <span className="collapsible-section-title">{title}</span>
        {summary && <span className="collapsible-section-meta">{summary}</span>}
        <span className="collapsible-section-chevron" aria-hidden="true" />
      </summary>
      <div className="collapsible-section-content">{children}</div>
    </details>
  );
}
