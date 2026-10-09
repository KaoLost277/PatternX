import { useId } from "react";
import type { RowColumnMode } from "./rowColumnMode";
import { analysisOptionClasses } from "./uiClasses";

interface RowColumnModeSelectorProps {
  mode: RowColumnMode;
  onChange: (mode: RowColumnMode) => void;
}

export function RowColumnModeSelector({ mode, onChange }: RowColumnModeSelectorProps) {
  const radioGroupId = useId();

  return (
    <fieldset className="grid min-w-0 gap-2 border-0 p-0">
      <legend className="text-sm font-medium text-text">Columns shown</legend>
      <div className="flex flex-wrap gap-2">
        <label className={analysisOptionClasses}>
          <input
            type="radio"
            name={radioGroupId}
            checked={mode === "all"}
            onChange={() => onChange("all")}
          />
          <span>All source columns</span>
        </label>
        <label className={analysisOptionClasses}>
          <input
            type="radio"
            name={radioGroupId}
            checked={mode === "analysis"}
            onChange={() => onChange("analysis")}
          />
          <span>Columns used in analysis</span>
        </label>
      </div>
    </fieldset>
  );
}
