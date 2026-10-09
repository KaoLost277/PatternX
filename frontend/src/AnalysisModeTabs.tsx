import type { KeyboardEvent } from "react";

export type AnalysisModeId = "completeness" | "formal_terms" | "group_data";

interface AnalysisModeTab {
  id: AnalysisModeId;
  label: string;
}

const ANALYSIS_MODE_TABS: AnalysisModeTab[] = [
  { id: "completeness", label: "Completeness Patterns" },
  { id: "formal_terms", label: "Formal Terms" },
  { id: "group_data", label: "Group Data" },
];

interface AnalysisModeTabsProps {
  selectedMode: AnalysisModeId | null;
  enabled: boolean;
  onSelect: (mode: AnalysisModeId) => void;
}

export function AnalysisModeTabs({ selectedMode, enabled, onSelect }: AnalysisModeTabsProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentMode: AnalysisModeId) {
    const currentIndex = ANALYSIS_MODE_TABS.findIndex((tab) => tab.id === currentMode);
    let nextIndex: number;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % ANALYSIS_MODE_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + ANALYSIS_MODE_TABS.length) % ANALYSIS_MODE_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = ANALYSIS_MODE_TABS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextMode = ANALYSIS_MODE_TABS[nextIndex]?.id;
    if (nextMode === undefined) {
      return;
    }

    onSelect(nextMode);
    document.getElementById(`analysis-tab-${nextMode}`)?.focus();
  }

  return (
    <nav
      aria-label="Analysis modes"
      aria-orientation="horizontal"
      role="tablist"
      className="flex min-w-0 flex-nowrap gap-1 overflow-x-auto"
    >
      {ANALYSIS_MODE_TABS.map((tab, tabIndex) => {
        const selected = selectedMode === tab.id;
        const tabStyle = selected
          ? "border-accent bg-surface text-accent shadow-sm"
          : "border-transparent text-text-secondary hover:bg-surface-muted hover:text-text";

        return (
          <button
            key={tab.id}
            id={`analysis-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`analysis-panel-${tab.id}`}
            tabIndex={selected || (selectedMode === null && tabIndex === 0) ? 0 : -1}
            disabled={!enabled}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, tab.id)}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-control border px-4 py-2 text-sm font-semibold transition-colors active:bg-surface-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${tabStyle}`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
