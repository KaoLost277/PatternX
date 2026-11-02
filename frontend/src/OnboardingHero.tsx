import { useState, useRef } from "react";
import type { DragEvent, ChangeEvent } from "react";
import {
  UploadCloudIcon,
  SparklesIcon,
  FileSpreadsheetIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from "./icons";
import { createSampleDatasetFile } from "./sampleDatasets";
import type { SampleDatasetKind } from "./sampleDatasets";

interface OnboardingHeroProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export function OnboardingHero({ onFileSelect, disabled = false }: OnboardingHeroProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const name = file.name.toLowerCase();
      if (name.endsWith(".csv") || name.endsWith(".xlsx")) {
        onFileSelect(file);
      }
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  };

  const handleBrowseClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleSampleClick = (kind: SampleDatasetKind) => {
    if (disabled) return;
    const sampleFile = createSampleDatasetFile(kind);
    onFileSelect(sampleFile);
  };

  return (
    <section
      className="grid min-w-0 gap-6 rounded-panel border border-border bg-surface p-5 shadow-card sm:p-8"
      aria-label="Welcome and dataset ingestion"
    >
      {/* 3-Step Guided Workflow Banner */}
      <div className="grid min-w-0 gap-3 border-b border-border pb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-surface-accent px-3 py-1 text-xs font-semibold text-accent">
            <SparklesIcon className="size-3.5" />
            Zero-friction local profiling
          </span>
          <span className="text-xs font-medium text-text-muted">
            100% Offline · Private & Secure
          </span>
        </div>

        <h2 className="text-xl font-bold tracking-tight text-text sm:text-2xl">
          Get Started in 3 Simple Steps
        </h2>

        <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
          <div className="flex items-start gap-3 rounded-control border border-accent/30 bg-surface-accent/40 p-3.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-action-primary text-xs font-bold text-white">
              1
            </span>
            <div className="grid min-w-0 gap-0.5">
              <p className="m-0 text-sm font-semibold text-text">Ingest Dataset</p>
              <p className="m-0 text-xs text-text-muted">
                Drop your CSV/XLSX or click a ready demo dataset.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-control border border-border bg-surface-muted p-3.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-xs font-bold text-text-secondary">
              2
            </span>
            <div className="grid min-w-0 gap-0.5">
              <p className="m-0 text-sm font-semibold text-text">Auto Health Check</p>
              <p className="m-0 text-xs text-text-muted">
                Instant completeness scores and missing rates.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-control border border-border bg-surface-muted p-3.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-xs font-bold text-text-secondary">
              3
            </span>
            <div className="grid min-w-0 gap-0.5">
              <p className="m-0 text-sm font-semibold text-text">Deep Analytics</p>
              <p className="m-0 text-xs text-text-muted">
                Explore patterns, structural terms & data contracts.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modern Drag & Drop Zone */}
      <div
        className={`relative grid min-w-0 cursor-pointer place-items-center gap-3 rounded-panel border-2 border-dashed p-8 text-center transition-all ${
          isDragging
            ? "border-accent bg-surface-accent/70 scale-[0.99]"
            : "border-border-strong/60 bg-surface-muted/50 hover:border-accent hover:bg-surface-accent/20"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBrowseClick}
        role="region"
        aria-label="File upload dropzone"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleBrowseClick();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          className="sr-only"
          onChange={handleInputChange}
          disabled={disabled}
          tabIndex={-1}
        />

        <div className="flex size-14 items-center justify-center rounded-full border border-border bg-surface shadow-sm">
          <UploadCloudIcon className="size-7 text-accent" />
        </div>

        <div className="grid gap-1">
          <p className="m-0 text-base font-semibold text-text">
            Drop your file here, or{" "}
            <span className="text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent">
              browse local files
            </span>
          </p>
          <p className="m-0 text-xs text-text-muted">
            Supports CSV and Excel (.xlsx) workbooks · Never uploaded to any server
          </p>
        </div>
      </div>

      {/* 1-Click Interactive Demo Datasets */}
      <div className="grid min-w-0 gap-3 rounded-control border border-border bg-surface-muted p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            <SparklesIcon className="size-3.5 text-accent" />
            No dataset on hand? Try instant demo data:
          </p>
          <span className="text-xs text-text-muted">1-click test drive</span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            className="flex min-h-12 items-center justify-between gap-3 rounded-control border border-border bg-surface px-4 py-2.5 text-left transition-colors hover:border-accent hover:bg-surface-accent/40 active:translate-y-px focus-visible:outline-3 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => handleSampleClick("ecommerce")}
            disabled={disabled}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <FileSpreadsheetIcon className="size-4" />
              </span>
              <div className="grid min-w-0">
                <span className="truncate text-sm font-semibold text-text">
                  E-Commerce Orders
                </span>
                <span className="text-xs text-text-muted">
                  25 rows · Missing emails, phones & postal codes
                </span>
              </div>
            </div>
            <ArrowRightIcon className="size-4 shrink-0 text-text-muted" />
          </button>

          <button
            type="button"
            className="flex min-h-12 items-center justify-between gap-3 rounded-control border border-border bg-surface px-4 py-2.5 text-left transition-colors hover:border-accent hover:bg-surface-accent/40 active:translate-y-px focus-visible:outline-3 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => handleSampleClick("employee")}
            disabled={disabled}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <CheckCircleIcon className="size-4" />
              </span>
              <div className="grid min-w-0">
                <span className="truncate text-sm font-semibold text-text">
                  Employee Directory
                </span>
                <span className="text-xs text-text-muted">
                  25 rows · Departments, salaries & termination dates
                </span>
              </div>
            </div>
            <ArrowRightIcon className="size-4 shrink-0 text-text-muted" />
          </button>
        </div>
      </div>
    </section>
  );
}
