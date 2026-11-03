import { useState, useId } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  SparklesIcon,
  TableIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  XIcon,
} from "./icons";
import {
  fetchTransformPreview,
  applyTransformationsApi,
  serializeTransformations,
  parseTransformationsJson,
} from "./dataTransformations";
import type {
  TransformRule,
  TransformType,
  TargetMode,
  TransformPreviewResponse,
} from "./dataTransformations";
import {
  primaryButtonClasses,
  secondaryButtonClasses,
  explainerBannerClasses,
  errorMessageClasses,
} from "./uiClasses";

let ruleCounter = 1;
function getNextRuleId(prefix: string): string {
  return `${prefix}_${ruleCounter++}`;
}

interface DataTransformationPanelProps {
  selectedFile: File | null;
  worksheetName: string;
  columnNames: string[];
  hidden: boolean;
  onApplyDataset: (newFile: File) => Promise<void>;
  onRevertOriginal?: () => void;
  isTransformedDataset?: boolean;
}

export function DataTransformationPanel({
  selectedFile,
  worksheetName,
  columnNames,
  hidden,
  onApplyDataset,
  onRevertOriginal,
  isTransformedDataset = false,
}: DataTransformationPanelProps) {
  const [rules, setRules] = useState<TransformRule[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>(columnNames[0] || "");
  const [targetMode, setTargetMode] = useState<TargetMode>("new_column");
  const [targetColumnName, setTargetColumnName] = useState<string>("");
  const [transformType, setTransformType] = useState<TransformType>("date_truncate");

  // Config states
  const [datePart, setDatePart] = useState<"date_only" | "time_only">("date_only");
  const [dateDelimiter, setDateDelimiter] = useState<string>("");
  const [delimiterChar, setDelimiterChar] = useState<string>("_");
  const [delimiterPosition, setDelimiterPosition] = useState<string>("after");
  const [delimiterPartIndex, setDelimiterPartIndex] = useState<number>(1);
  const [substringMode, setSubstringMode] = useState<string>("first_n");
  const [substringCount, setSubstringCount] = useState<number>(5);
  const [regexPattern, setRegexPattern] = useState<string>("");
  const [regexGroup, setRegexGroup] = useState<number>(1);
  const [caseTrimCase, setCaseTrimCase] = useState<string>("none");
  const [caseTrimTrim, setCaseTrimTrim] = useState<boolean>(true);

  // Preview & Execution states
  const [preview, setPreview] = useState<TransformPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fileInputId = useId();

  const activeColumn = selectedColumn || columnNames[0] || "";

  // Helper to construct rule config based on transformType
  function buildCurrentConfig(): Record<string, any> {
    if (transformType === "date_truncate") {
      return {
        part: datePart,
        ...(dateDelimiter.trim() ? { delimiter: dateDelimiter.trim() } : {}),
      };
    }
    if (transformType === "delimiter_split") {
      return {
        delimiter: delimiterChar,
        position: delimiterPosition,
        part_index: delimiterPartIndex,
      };
    }
    if (transformType === "substring") {
      return {
        mode: substringMode,
        count: substringCount,
      };
    }
    if (transformType === "regex_extract") {
      return {
        pattern: regexPattern,
        group: regexGroup,
      };
    }
    if (transformType === "case_trim") {
      return {
        trim: caseTrimTrim,
        case: caseTrimCase,
      };
    }
    return {};
  }

  function handleAddRule(event: FormEvent) {
    event.preventDefault();
    if (!activeColumn) {
      setError("Please select a column.");
      return;
    }

    const defaultTargetName =
      targetMode === "new_column"
        ? targetColumnName.trim() || `${activeColumn}_clean`
        : activeColumn;

    const newRule: TransformRule = {
      id: getNextRuleId("rule"),
      source_column: activeColumn,
      target_mode: targetMode,
      target_column: defaultTargetName,
      transform_type: transformType,
      config: buildCurrentConfig(),
    };

    const nextRules = [...rules, newRule];
    setRules(nextRules);
    setTargetColumnName("");
    setError(null);
    setFeedback(`Rule added for column "${activeColumn}".`);

    // Automatically refresh preview
    if (selectedFile) {
      triggerPreview(selectedFile, nextRules);
    }
  }

  function handleDeleteRule(ruleId: string) {
    const nextRules = rules.filter((r) => r.id !== ruleId);
    setRules(nextRules);
    if (selectedFile) {
      triggerPreview(selectedFile, nextRules);
    }
  }

  async function triggerPreview(file: File, rulesToPreview: TransformRule[]) {
    if (rulesToPreview.length === 0) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    setError(null);
    try {
      const result = await fetchTransformPreview(file, worksheetName, rulesToPreview);
      setPreview(result);
    } catch (err: any) {
      setError(err.message || "Failed to load live preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleApplyToDataset() {
    if (!selectedFile || rules.length === 0) return;
    setApplyLoading(true);
    setError(null);
    try {
      const transformedFile = await applyTransformationsApi(selectedFile, worksheetName, rules);
      await onApplyDataset(transformedFile);
      setFeedback("Transformations successfully applied to dataset! All analyses now use the formatted columns.");
    } catch (err: any) {
      setError(err.message || "Failed to apply transformations.");
    } finally {
      setApplyLoading(false);
    }
  }

  async function handleDownloadCsv() {
    if (!selectedFile || rules.length === 0) return;
    try {
      const transformedFile = await applyTransformationsApi(selectedFile, worksheetName, rules);
      const url = URL.createObjectURL(transformedFile);
      const a = document.createElement("a");
      a.href = url;
      a.download = transformedFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Failed to download transformed CSV.");
    }
  }

  function handleExportJson() {
    const jsonStr = serializeTransformations(rules);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transformations_v1.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImportJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const importedRules = parseTransformationsJson(text);
        setRules(importedRules);
        setFeedback(`Imported ${importedRules.length} rules.`);
        if (selectedFile) {
          triggerPreview(selectedFile, importedRules);
        }
      } catch (err: any) {
        setError(err.message || "Invalid transformations JSON file.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  // Smart Presets
  function applyDateTruncatePreset() {
    // Find column containing 'date' or 'time'
    const dateCol = columnNames.find((c) => /date|time|created|timestamp/i.test(c)) || columnNames[0];
    if (!dateCol) return;
    const presetRule: TransformRule = {
      id: getNextRuleId("rule_preset_date"),
      source_column: dateCol,
      target_mode: "new_column",
      target_column: `${dateCol}_date`,
      transform_type: "date_truncate",
      config: { part: "date_only", delimiter: ":" },
    };
    const nextRules = [...rules, presetRule];
    setRules(nextRules);
    if (selectedFile) triggerPreview(selectedFile, nextRules);
  }

  function applyDelimiterPreset() {
    const codeCol = columnNames.find((c) => /code|id|ref|sku|order/i.test(c)) || columnNames[0];
    if (!codeCol) return;
    const presetRule: TransformRule = {
      id: getNextRuleId("rule_preset_delim"),
      source_column: codeCol,
      target_mode: "new_column",
      target_column: `${codeCol}_suffix`,
      transform_type: "delimiter_split",
      config: { delimiter: "_", position: "after" },
    };
    const nextRules = [...rules, presetRule];
    setRules(nextRules);
    if (selectedFile) triggerPreview(selectedFile, nextRules);
  }

  return (
    <div className="grid min-w-0 gap-5" hidden={hidden}>
      {/* Header & Explainer */}
      <header className="grid min-w-0 gap-3 rounded-panel border border-border bg-surface p-4 shadow-card sm:p-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-control bg-accent/10 text-accent">
              <SparklesIcon className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-text">Data Transformations</h2>
              <p className="m-0 text-xs text-text-muted">
                Extract, reformat, and clean values before running Completeness, Group Data, or Contracts.
              </p>
            </div>
          </div>
          {isTransformedDataset && (
            <span className="flex items-center gap-1.5 rounded-full border border-success-border bg-success-surface px-3 py-1 text-xs font-semibold text-success-text">
              <CheckCircleIcon className="size-3.5" />
              Dataset Active: Transformed
            </span>
          )}
        </div>

        <div className={explainerBannerClasses}>
          <TableIcon className="size-4 shrink-0 text-accent mt-0.5" />
          <div className="grid gap-0.5 text-xs">
            <strong className="text-text font-semibold">How Column Transformations work:</strong>
            <p className="m-0 text-text-secondary">
              Set rules to isolate dates (e.g. <code>13/06/26:23:30:32</code> → <code>13/06/26</code>) or extract codes after delimiters (e.g. <code>ADWD_1</code> → <code>1</code>).
              You can choose to create a <strong>New Virtual Column</strong> or <strong>Overwrite in-place</strong>.
              Values that do not match the rule safely retain their original raw text.
            </p>
          </div>
        </div>

        {error && <p className={errorMessageClasses} role="alert">{error}</p>}
        {feedback && (
          <p className="m-0 rounded-control border border-success-border bg-success-surface px-3 py-2 text-xs font-semibold text-success-text" role="status">
            {feedback}
          </p>
        )}
      </header>

      {/* Main Workspace: 2 Columns (Rule Builder + Before/After Preview) */}
      <div className="grid min-w-0 gap-5 lg:grid-cols-12">
        {/* Left Column: Rule Builder & Active Rules (5 cols) */}
        <section className="grid min-w-0 content-start gap-4 rounded-panel border border-border bg-surface p-4 shadow-card sm:p-panel lg:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <h3 className="text-base font-bold text-text">Define a Transformation</h3>
            <span className="text-xs text-text-muted">Step 1 of 2</span>
          </div>

          {/* Quick Presets Toolbar */}
          <div className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface-muted p-2.5">
            <span className="flex items-center gap-1 text-xs font-semibold text-text-secondary">
              <SparklesIcon className="size-3 text-accent" />
              Presets:
            </span>
            <button
              type="button"
              className={secondaryButtonClasses}
              onClick={applyDateTruncatePreset}
              title="Auto-detect date column and cut time (13/06/26:23:30 -> 13/06/26)"
            >
              Cut Time from Date
            </button>
            <button
              type="button"
              className={secondaryButtonClasses}
              onClick={applyDelimiterPreset}
              title="Extract suffix after underscore (ADWD_1 -> 1)"
            >
              Extract after '_'
            </button>
          </div>

          <form className="grid min-w-0 gap-3" onSubmit={handleAddRule}>
            {/* Source Column */}
            <label className="grid min-w-0 gap-1 text-xs font-semibold text-text-secondary">
              <span>Source Column to Transform</span>
              <select
                className="min-h-10 rounded-control border border-border-strong bg-surface px-3 text-sm text-text focus-visible:outline-3 focus-visible:outline-focus-ring"
                value={activeColumn}
                onChange={(e) => setSelectedColumn(e.target.value)}
              >
                {columnNames.map((col, idx) => (
                  <option key={idx} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </label>

            {/* Transformation Type */}
            <label className="grid min-w-0 gap-1 text-xs font-semibold text-text-secondary">
              <span>Transformation Action</span>
              <select
                className="min-h-10 rounded-control border border-border-strong bg-surface px-3 text-sm text-text focus-visible:outline-3 focus-visible:outline-focus-ring"
                value={transformType}
                onChange={(e) => setTransformType(e.target.value as TransformType)}
              >
                <option value="date_truncate">Date & Time Truncation (e.g. 13/06/26:23:30:32 → 13/06/26)</option>
                <option value="delimiter_split">Delimiter Split & Extract (e.g. ADWD_1 → 1)</option>
                <option value="substring">Character Slice / Substring (First/Last N chars)</option>
                <option value="regex_extract">Dynamic Regex Extraction (Advanced Pattern)</option>
                <option value="case_trim">Case Conversion & Trim (UPPER, lower, trim)</option>
              </select>
            </label>

            {/* Conditional Type Configs */}
            {transformType === "date_truncate" && (
              <div className="grid gap-2.5 rounded-control border border-border bg-surface-muted p-3">
                <span className="text-xs font-semibold text-text">Date Truncation Settings:</span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs text-text-muted">
                    <span>Extract Part</span>
                    <select
                      className="min-h-9 rounded-control border border-border bg-surface px-2 text-xs text-text"
                      value={datePart}
                      onChange={(e) => setDatePart(e.target.value as any)}
                    >
                      <option value="date_only">Date only (Drop time)</option>
                      <option value="time_only">Time only (Drop date)</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-text-muted">
                    <span>Delimiter (optional)</span>
                    <input
                      type="text"
                      className="min-h-9 rounded-control border border-border bg-surface px-2 text-xs text-text"
                      placeholder="e.g. : or space"
                      value={dateDelimiter}
                      onChange={(e) => setDateDelimiter(e.target.value)}
                    />
                  </label>
                </div>
              </div>
            )}

            {transformType === "delimiter_split" && (
              <div className="grid gap-2.5 rounded-control border border-border bg-surface-muted p-3">
                <span className="text-xs font-semibold text-text">Delimiter Settings:</span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs text-text-muted">
                    <span>Delimiter Character</span>
                    <input
                      type="text"
                      className="min-h-9 rounded-control border border-border bg-surface px-2 text-xs text-text"
                      value={delimiterChar}
                      onChange={(e) => setDelimiterChar(e.target.value)}
                      placeholder="_"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-text-muted">
                    <span>Position to Extract</span>
                    <select
                      className="min-h-9 rounded-control border border-border bg-surface px-2 text-xs text-text"
                      value={delimiterPosition}
                      onChange={(e) => setDelimiterPosition(e.target.value)}
                    >
                      <option value="after">After first delimiter</option>
                      <option value="before">Before first delimiter</option>
                      <option value="after_last">After LAST delimiter</option>
                      <option value="before_first">Before first delimiter</option>
                      <option value="part_index">Specific part index (1, 2...)</option>
                    </select>
                  </label>
                </div>
                {delimiterPosition === "part_index" && (
                  <label className="grid gap-1 text-xs text-text-muted">
                    <span>Part Index (1-based)</span>
                    <input
                      type="number"
                      min={1}
                      className="min-h-9 rounded-control border border-border bg-surface px-2 text-xs text-text"
                      value={delimiterPartIndex}
                      onChange={(e) => setDelimiterPartIndex(Number(e.target.value))}
                    />
                  </label>
                )}
              </div>
            )}

            {transformType === "substring" && (
              <div className="grid gap-2.5 rounded-control border border-border bg-surface-muted p-3">
                <span className="text-xs font-semibold text-text">Substring Slice Settings:</span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs text-text-muted">
                    <span>Slice Mode</span>
                    <select
                      className="min-h-9 rounded-control border border-border bg-surface px-2 text-xs text-text"
                      value={substringMode}
                      onChange={(e) => setSubstringMode(e.target.value)}
                    >
                      <option value="first_n">First N characters</option>
                      <option value="last_n">Last N characters</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-text-muted">
                    <span>Number of Characters</span>
                    <input
                      type="number"
                      min={1}
                      className="min-h-9 rounded-control border border-border bg-surface px-2 text-xs text-text"
                      value={substringCount}
                      onChange={(e) => setSubstringCount(Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>
            )}

            {transformType === "regex_extract" && (
              <div className="grid gap-2.5 rounded-control border border-border bg-surface-muted p-3">
                <span className="text-xs font-semibold text-text">Regex Pattern Settings:</span>
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <label className="grid gap-1 text-xs text-text-muted">
                    <span>Regex with Capture Group</span>
                    <input
                      type="text"
                      className="min-h-9 rounded-control border border-border bg-surface px-2 text-xs text-text font-mono"
                      placeholder="e.g. _([0-9]+)$ or ([A-Z]+)"
                      value={regexPattern}
                      onChange={(e) => setRegexPattern(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-text-muted">
                    <span>Group #</span>
                    <input
                      type="number"
                      min={0}
                      className="min-h-9 rounded-control border border-border bg-surface px-2 text-xs text-text"
                      value={regexGroup}
                      onChange={(e) => setRegexGroup(Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>
            )}

            {transformType === "case_trim" && (
              <div className="grid gap-2.5 rounded-control border border-border bg-surface-muted p-3">
                <span className="text-xs font-semibold text-text">Formatting Options:</span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-text">
                    <input
                      type="checkbox"
                      checked={caseTrimTrim}
                      onChange={(e) => setCaseTrimTrim(e.target.checked)}
                    />
                    <span>Trim Whitespace</span>
                  </label>
                  <select
                    className="min-h-9 rounded-control border border-border bg-surface px-2 text-xs text-text"
                    value={caseTrimCase}
                    onChange={(e) => setCaseTrimCase(e.target.value)}
                  >
                    <option value="none">Preserve case</option>
                    <option value="upper">UPPERCASE</option>
                    <option value="lower">lowercase</option>
                    <option value="title">Title Case</option>
                  </select>
                </div>
              </div>
            )}

            {/* Target Mode: New Column vs Overwrite */}
            <div className="grid gap-2 pt-1">
              <span className="text-xs font-semibold text-text-secondary">Destination Column Mode:</span>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs font-medium text-text">
                  <input
                    type="radio"
                    name="targetMode"
                    value="new_column"
                    checked={targetMode === "new_column"}
                    onChange={() => setTargetMode("new_column")}
                  />
                  <span>Create New Virtual Column</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-text">
                  <input
                    type="radio"
                    name="targetMode"
                    value="overwrite"
                    checked={targetMode === "overwrite"}
                    onChange={() => setTargetMode("overwrite")}
                  />
                  <span>Overwrite In-Place</span>
                </label>
              </div>
              {targetMode === "new_column" && (
                <input
                  type="text"
                  className="min-h-9 rounded-control border border-border-strong bg-surface px-3 text-xs text-text focus-visible:outline-3 focus-visible:outline-focus-ring"
                  placeholder={`Custom column name (defaults to ${activeColumn}_clean)`}
                  value={targetColumnName}
                  onChange={(e) => setTargetColumnName(e.target.value)}
                />
              )}
            </div>

            <button type="submit" className={primaryButtonClasses}>
              Add Transformation Rule
            </button>
          </form>

          {/* Active Rules List */}
          <div className="grid min-w-0 gap-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Configured Rules ({rules.length})
              </h4>
              <div className="flex items-center gap-1.5">
                <input
                  type="file"
                  id={fileInputId}
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={handleImportJson}
                />
                <button
                  type="button"
                  className="text-xs font-medium text-accent hover:underline"
                  onClick={() => document.getElementById(fileInputId)?.click()}
                >
                  Import JSON
                </button>
                <span className="text-text-muted">·</span>
                <button
                  type="button"
                  className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                  onClick={handleExportJson}
                  disabled={rules.length === 0}
                >
                  Export JSON
                </button>
              </div>
            </div>

            {rules.length === 0 ? (
              <p className="m-0 text-xs text-text-muted">
                No transformation rules defined yet. Add a rule above or pick a preset.
              </p>
            ) : (
              <ul className="m-0 grid gap-2 p-0 list-none">
                {rules.map((rule, idx) => (
                  <li
                    key={rule.id}
                    className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface-muted p-2.5 text-xs"
                  >
                    <div className="grid min-w-0 gap-0.5">
                      <div className="flex items-center gap-1.5 font-semibold text-text">
                        <span>{idx + 1}. {rule.source_column}</span>
                        <ArrowRightIcon className="size-3 text-text-muted" />
                        <span className="text-accent">{rule.target_column}</span>
                        <span className="rounded bg-surface px-1.5 py-0.2 border border-border text-[10px] text-text-secondary font-normal">
                          {rule.target_mode === "overwrite" ? "Overwrite" : "New Col"}
                        </span>
                      </div>
                      <span className="text-text-muted">
                        Type: {rule.transform_type}
                        {rule.transform_type === "delimiter_split" && ` ('${rule.config.delimiter}')`}
                        {rule.transform_type === "date_truncate" && ` (${rule.config.part})`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="size-6 flex items-center justify-center rounded text-text-muted hover:bg-error-surface hover:text-error-text"
                      title="Remove rule"
                      onClick={() => handleDeleteRule(rule.id)}
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Right Column: Live Before / After Comparison Table & Apply Action (7 cols) */}
        <section className="grid min-w-0 content-start gap-4 rounded-panel border border-border bg-surface p-4 shadow-card sm:p-panel lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h3 className="text-base font-bold text-text">Live Before / After Preview</h3>
              <p className="m-0 text-xs text-text-muted">
                Preview sample rows across your dataset. Unmatched rows safely retain raw values.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className={secondaryButtonClasses}
                onClick={handleDownloadCsv}
                disabled={rules.length === 0 || applyLoading}
                title="Download the transformed dataset as a new CSV"
              >
                Export CSV
              </button>

              <button
                type="button"
                className={primaryButtonClasses}
                onClick={handleApplyToDataset}
                disabled={rules.length === 0 || applyLoading}
                title="Apply transformations to active session for Completeness, Group Data & Contracts"
              >
                <SparklesIcon className="size-4 mr-1.5" />
                {applyLoading ? "Applying..." : "Apply to Analysis"}
              </button>
            </div>
          </div>

          {/* Rule Match Statistics Pills */}
          {preview?.stats && Object.keys(preview.stats).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(preview.stats).map(([ruleId, s]) => (
                <div
                  key={ruleId}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs text-text-secondary"
                >
                  <span className="font-semibold text-text">{s.matched_count}/{s.total_rows} matched</span>
                  {s.unmatched_count > 0 && (
                    <span className="text-warning-text font-medium">({s.unmatched_count} raw fallback)</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Table Container */}
          {previewLoading ? (
            <div className="flex min-h-60 items-center justify-center rounded-control border border-border bg-surface-muted p-8 text-sm text-text-muted">
              <RefreshCwIcon className="size-5 animate-spin mr-2 text-accent" />
              Calculating live preview...
            </div>
          ) : !preview || preview.preview_rows.length === 0 ? (
            <div className="grid min-h-60 place-items-center rounded-control border border-dashed border-border p-8 text-center text-sm text-text-muted">
              <div>
                <TableIcon className="size-8 text-text-muted/50 mx-auto mb-2" />
                <p className="m-0 font-medium text-text">No active transformation preview</p>
                <p className="m-0 text-xs text-text-muted">
                  Add a transformation rule on the left to see Before / After sample comparisons.
                </p>
              </div>
            </div>
          ) : (
            <div className="min-w-0 overflow-x-auto rounded-control border border-border shadow-card max-h-96">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-surface-muted text-text-secondary sticky top-0 border-b border-border z-10">
                  <tr>
                    <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] w-12 text-center">Row</th>
                    {preview.transformed_columns.map((col, idx) => {
                      const isNewCol = !preview.original_columns.includes(col);
                      return (
                        <th key={idx} className="p-2.5 font-semibold text-text">
                          <div className="flex items-center gap-1">
                            <span>{col}</span>
                            {isNewCol && (
                              <span className="rounded bg-accent/10 px-1 py-0.2 text-[9px] font-bold text-accent">
                                NEW
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.preview_rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-surface-muted/60">
                      <td className="p-2.5 text-center text-text-muted font-mono text-[11px]">
                        {rowIdx + 1}
                      </td>
                      {preview.transformed_columns.map((col, colIdx) => {
                        const originalVal = row.original[col];
                        const transformedVal = row.transformed[col];
                        const hasChanged = originalVal !== undefined && originalVal !== transformedVal;

                        return (
                          <td key={colIdx} className="p-2.5 max-w-48 truncate">
                            {hasChanged ? (
                              <div className="grid gap-0.5">
                                <span className="font-semibold text-accent">{transformedVal}</span>
                                <span className="text-[10px] text-text-muted line-through">{originalVal}</span>
                              </div>
                            ) : (
                              <span className={transformedVal ? "text-text" : "text-text-muted italic"}>
                                {transformedVal || "(empty)"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Revert Original Action if Active */}
          {isTransformedDataset && onRevertOriginal && (
            <div className="flex items-center justify-between rounded-control border border-border bg-surface-muted p-3 text-xs">
              <span className="text-text-secondary">
                Currently analyzing transformed dataset. Want to return to original raw data?
              </span>
              <button
                type="button"
                className={secondaryButtonClasses}
                onClick={onRevertOriginal}
              >
                Revert to Original Dataset
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
