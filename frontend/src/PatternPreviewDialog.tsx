import { useEffect, useRef } from "react";
import { ColumnVisibilityPicker } from "./ColumnVisibilityPicker";
import { PatternPreview } from "./PatternPreview";
import type { CompletenessPattern, PatternSummary } from "./PatternPreview";
import {
  dialogClasses,
  dialogHeadingClasses,
  secondaryButtonClasses,
  statusTextClasses,
} from "./uiClasses";

interface PatternPreviewDialogProps {
  patternSummary: PatternSummary;
  pattern: CompletenessPattern;
  visibleAnalysisColumns: string[];
  onVisibleAnalysisColumnsChanged: (visibleColumns: string[]) => void;
  onClose: () => void;
}

export function PatternPreviewDialog({
  patternSummary,
  pattern,
  visibleAnalysisColumns,
  onVisibleAnalysisColumnsChanged,
  onClose,
}: PatternPreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  function handleCloseButtonClicked() {
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      className={dialogClasses}
      aria-labelledby="preview-dialog-title"
      aria-describedby="preview-dialog-description"
      onClose={onClose}
    >
      <div className="flex min-w-0 items-start justify-between gap-5 max-sm:gap-3">
        <div className="grid min-w-0 gap-2">
          <h2 className={dialogHeadingClasses} id="preview-dialog-title">
            Sample rows for a Completeness Pattern
          </h2>
          <p id="preview-dialog-description" className={statusTextClasses}>
            {pattern.count.toLocaleString()} Input Rows share this pattern.
          </p>
        </div>
        <button
          type="button"
          className={secondaryButtonClasses}
          aria-label="Close sample rows preview"
          onClick={handleCloseButtonClicked}
        >
          Close
        </button>
      </div>

      <ColumnVisibilityPicker
        columns={patternSummary.analysis_columns}
        visibleColumns={visibleAnalysisColumns}
        onVisibleColumnsChanged={onVisibleAnalysisColumnsChanged}
      />

      <PatternPreview
        patternSummary={patternSummary}
        pattern={pattern}
        visibleAnalysisColumns={visibleAnalysisColumns}
      />
    </dialog>
  );
}
