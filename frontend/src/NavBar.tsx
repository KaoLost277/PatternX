import { useEffect, useRef, useState } from "react";
import type { AnalysisModeId } from "./AnalysisModeTabs";
import { AnalysisModeTabs } from "./AnalysisModeTabs";
import {
  FileSpreadsheetIcon,
  MenuIcon,
  SparklesIcon,
  XIcon,
} from "./icons";

export interface NavBarProps {
  activeMode: AnalysisModeId | "choose";
  currentModeLabel: string;
  hasDataset: boolean;
  fileName?: string;
  rowCount?: number;
  columnCount?: number;
  onSelectMode: (mode: AnalysisModeId) => void;
  onOpenSampleDataset?: () => void;
}

export function NavBar({
  activeMode,
  currentModeLabel,
  hasDataset,
  fileName,
  rowCount,
  columnCount,
  onSelectMode,
  onOpenSampleDataset,
}: NavBarProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  // Close the drawer when the user presses the Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isDrawerOpen) {
        setIsDrawerOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    if (isDrawerOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDrawerOpen]);

  // Lock body scroll while the drawer overlay is active on small screens
  useEffect(() => {
    if (isDrawerOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isDrawerOpen]);

  function handleModeSelect(mode: AnalysisModeId) {
    onSelectMode(mode);
    setIsDrawerOpen(false);
    menuButtonRef.current?.focus();
  }

  return (
    <>
      {/* Top Sticky Navigation Bar */}
      <header className="sticky top-0 z-20 w-full border-b border-border bg-surface/95 backdrop-blur shadow-xs">
        <h1 className="sr-only">PatternX Data Profiler</h1>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          {/* Left section: Hamburger Menu on the far left, followed by the Mode Indicator */}
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              ref={menuButtonRef}
              id="nav-menu-button"
              type="button"
              aria-label={isDrawerOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isDrawerOpen}
              aria-controls="navigation-drawer"
              onClick={() => setIsDrawerOpen((open) => !open)}
              className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text shadow-xs transition-colors hover:border-border-strong hover:bg-surface-muted active:bg-surface-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring shrink-0"
            >
              <MenuIcon className="size-5 text-accent" />
              <span>Menu</span>
              <span className="text-[10px] text-text-muted" aria-hidden="true">▼</span>
            </button>

            {/* Current Active Mode Indicator Pill */}
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              title="Click to view and switch analysis modes"
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-surface-accent px-3 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
            >
              <span className="size-1.5 rounded-full bg-accent animate-pulse" />
              <span className="max-w-44 truncate">{currentModeLabel}</span>
            </button>
          </div>

          {/* Right section: Dataset status pill and Offline privacy badge */}
          <div className="flex items-center gap-2.5">
            {hasDataset ? (
              <div className="hidden sm:flex items-center gap-2 rounded-control border border-border bg-surface-muted px-3 py-1.5 text-xs text-text-secondary">
                <FileSpreadsheetIcon className="size-3.5 text-accent" />
                <span className="max-w-48 truncate font-medium">{fileName || "Dataset ready"}</span>
                {columnCount !== undefined && (
                  <span className="text-text-muted">({columnCount} cols)</span>
                )}
              </div>
            ) : (
              onOpenSampleDataset && (
                <button
                  type="button"
                  onClick={onOpenSampleDataset}
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-control border border-accent/40 bg-surface px-2.5 py-1.5 text-xs font-semibold text-accent shadow-xs transition-colors hover:bg-surface-accent"
                >
                  <SparklesIcon className="size-3.5" />
                  <span>Demo Data</span>
                </button>
              )
            )}

            {/* Offline Engine Badge */}
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-success-border bg-success-surface px-2.5 py-1 text-xs font-medium text-success-text"
              title="Local loopback only (127.0.0.1). No network requests or telemetry."
            >
              <span className="size-1.5 rounded-full bg-emerald-600" />
              <span className="hidden sm:inline">Offline (127.0.0.1)</span>
              <span className="sm:hidden">Offline</span>
            </div>
          </div>
        </div>
      </header>

      {/* Drawer Backdrop Overlay */}
      <div
        className={`fixed inset-0 z-50 bg-text/40 backdrop-blur-xs transition-opacity duration-200 ${
          isDrawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-over Hamburger Drawer */}
      <aside
        id="navigation-drawer"
        role="dialog"
        aria-modal="true"
        aria-hidden={!isDrawerOpen}
        aria-label="Navigation drawer"
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-full max-w-sm sm:max-w-md flex-col bg-surface shadow-dialog border-r border-border transition-transform duration-200 ease-in-out ${
          isDrawerOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white text-sm font-bold shadow-xs">
              PX
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-text leading-tight">
                PatternX Data Profiler
              </span>
              <span className="text-xs text-text-muted">
                Offline dataset profiling & quality inspection
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setIsDrawerOpen(false)}
            className="inline-flex size-10 items-center justify-center rounded-control border border-border text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        {/* Dataset Status Banner in Drawer */}
        <div className="border-b border-border bg-surface-muted/60 p-4 text-xs">
          {hasDataset ? (
            <div className="flex items-start gap-2.5 text-text">
              <FileSpreadsheetIcon className="size-4 shrink-0 text-accent mt-0.5" />
              <div className="min-w-0">
                <span className="font-semibold block truncate text-sm">
                  {fileName || "Dataset Loaded"}
                </span>
                <span className="text-text-muted">
                  {rowCount !== undefined && columnCount !== undefined
                    ? `${rowCount.toLocaleString()} rows • ${columnCount} columns`
                    : "Active dataset ready for analysis"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-text-secondary">
              <p className="m-0 font-semibold text-text">No dataset imported yet</p>
              <p className="m-0 mt-1 text-text-muted">
                Import a CSV or XLSX file to enable all profiling and transformation modes.
              </p>
            </div>
          )}
        </div>

        {/* Drawer Mode List */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-text-muted">
            Analysis & Tool Modes
          </p>
          <AnalysisModeTabs
            selectedMode={activeMode === "choose" ? null : activeMode}
            enabled={hasDataset}
            onSelect={handleModeSelect}
            onItemSelect={() => setIsDrawerOpen(false)}
            layout="drawer"
          />
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-border bg-surface-muted/40 p-4 text-xs text-text-muted flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span>
              Press{" "}
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] font-mono font-medium text-text">
                Esc
              </kbd>{" "}
              to close
            </span>
            <span className="font-semibold text-accent">v1.0 Local</span>
          </div>
          <p className="m-0 text-[11px] text-text-muted">
            100% Offline loopback. Zero cloud transfer or external tracking.
          </p>
        </div>
      </aside>
    </>
  );
}
