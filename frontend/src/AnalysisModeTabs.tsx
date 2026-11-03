import type { ComponentType, KeyboardEvent } from "react";
import {
  BarChartIcon,
  LayersIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TableIcon,
} from "./icons";
import type { IconProps } from "./icons";

export type AnalysisModeId =
  | "completeness"
  | "formal_terms"
  | "group_data"
  | "data_contract"
  | "transformations";

export interface AnalysisModeTabInfo {
  id: AnalysisModeId;
  label: string;
  description: string;
  icon: ComponentType<IconProps>;
}

const ANALYSIS_MODE_TABS: AnalysisModeTabInfo[] = [
  {
    id: "completeness",
    label: "Completeness Patterns",
    description: "Profile null values, missingness combinations & column health",
    icon: BarChartIcon,
  },
  {
    id: "formal_terms",
    label: "Formal Terms",
    description: "Extract structural formats, token templates & vocabulary",
    icon: TableIcon,
  },
  {
    id: "group_data",
    label: "Group Data",
    description: "Analyze co-occurrences, distinct groupings & distribution",
    icon: LayersIcon,
  },
  {
    id: "data_contract",
    label: "Data Contracts",
    description: "Define schemas, validate column constraints & invariants",
    icon: ShieldCheckIcon,
  },
  {
    id: "transformations",
    label: "Data Transformations",
    description: "Clean dates, split text by delimiter, substring & regex",
    icon: SparklesIcon,
  },
];

export interface AnalysisModeTabsProps {
  selectedMode: AnalysisModeId | null;
  enabled: boolean;
  onSelect: (mode: AnalysisModeId) => void;
  onItemSelect?: () => void;
  layout?: "drawer" | "horizontal";
}

export function AnalysisModeTabs({
  selectedMode,
  enabled,
  onSelect,
  onItemSelect,
  layout = "drawer",
}: AnalysisModeTabsProps) {
  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentMode: AnalysisModeId,
  ) {
    const currentIndex = ANALYSIS_MODE_TABS.findIndex((tab) => tab.id === currentMode);
    let nextIndex: number;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % ANALYSIS_MODE_TABS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
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

  if (layout === "horizontal") {
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

  return (
    <nav
      aria-label="Analysis modes"
      aria-orientation="vertical"
      role="tablist"
      className="flex flex-col gap-2.5"
    >
      {ANALYSIS_MODE_TABS.map((tab, tabIndex) => {
        const selected = selectedMode === tab.id;
        const IconComponent = tab.icon;

        return (
          <div
            key={tab.id}
            onClick={() => {
              if (enabled) {
                onSelect(tab.id);
                onItemSelect?.();
              }
            }}
            className={`group relative flex flex-col gap-1.5 rounded-control border p-3.5 transition-all ${
              selected
                ? "border-accent bg-surface-accent shadow-xs"
                : enabled
                  ? "border-border bg-surface hover:border-border-strong hover:bg-surface-muted cursor-pointer"
                  : "border-border/60 bg-surface-muted/40 opacity-60 cursor-not-allowed"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-control transition-colors ${
                    selected
                      ? "bg-accent text-white"
                      : "bg-surface-muted text-text-secondary group-hover:bg-surface group-hover:text-text"
                  }`}
                >
                  <IconComponent className="size-4.5" />
                </span>
                <button
                  id={`analysis-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`analysis-panel-${tab.id}`}
                  tabIndex={selected || (selectedMode === null && tabIndex === 0) ? 0 : -1}
                  disabled={!enabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(tab.id);
                    onItemSelect?.();
                  }}
                  onKeyDown={(event) => handleKeyDown(event, tab.id)}
                  className="text-left text-sm font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed"
                >
                  {tab.label}
                </button>
              </div>
              {selected && (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                  Active
                </span>
              )}
            </div>
            <p className="m-0 pl-11 text-xs text-text-muted">
              {tab.description}
            </p>
          </div>
        );
      })}
    </nav>
  );
}
