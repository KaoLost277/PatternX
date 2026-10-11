import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  DataAnalysisRequestError,
  fetchDataContractJobStatus,
  startDataContractJob,
} from "./dataAnalysisApi";
import type {
  DataAnalysisJobStatus,
  DataContractSummary,
} from "./dataAnalysisApi";
import {
  getDataContractColumnIssues,
  parseDataContractJson,
  serializeDataContract,
} from "./dataContract";
import type {
  DataContractDateFormat,
  DataContractRule,
  DataContractValueType,
  DataContractV1,
} from "./dataContract";
import {
  errorMessageClasses,
  hintTextClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  summaryTableClasses,
} from "./uiClasses";

const CONTRACT_JOB_KIND = "data_contract";
const JOB_POLL_INTERVAL_MILLISECONDS = 500;

interface DataContractPanelProps {
  selectedFile: File | null;
  worksheetName: string;
  columnNames: string[];
  missingValueMarkers: Record<string, string[]>;
  datasetVersion: number;
  jobStatus: DataAnalysisJobStatus | null;
  hidden: boolean;
  onJobStatusChanged: (status: DataAnalysisJobStatus | null) => void;
  onAnalysisStartingChanged: (analysisKind: "data_contract", starting: boolean) => void;
  onError: (message: string | null) => void;
}

function ruleDescription(rule: DataContractRule): string {
  if (rule.kind === "required") {
    return "Required";
  }
  if (rule.kind === "enum") {
    return `Allowed values: ${rule.values.map((value) => JSON.stringify(value)).join(", ")}`;
  }
  if (rule.value_type === "date") {
    return `Date format: ${rule.date_format}`;
  }
  return `Type: ${rule.value_type}`;
}

function contractSummaryFromStatus(
  status: DataAnalysisJobStatus | null,
): DataContractSummary | null {
  if (status?.result?.kind === CONTRACT_JOB_KIND) {
    return status.result;
  }
  return null;
}

function isDataContractRuleKind(
  value: string,
): value is "required" | "enum" | "type" {
  return value === "required" || value === "enum" || value === "type";
}

function isDataContractValueType(value: string): value is DataContractValueType {
  return value === "integer" || value === "number" || value === "date";
}

function isDataContractDateFormat(value: string): value is DataContractDateFormat {
  return value === "YYYY-MM-DD" || value === "YYYY-MM-DD HH:MM:SS";
}

interface DataContractResultsProps {
  summary: DataContractSummary;
  rules: DataContractRule[];
}

export function DataContractResults({ summary, rules }: DataContractResultsProps) {
  const hasRequiredRule = rules.some((rule) => rule.kind === "required");

  return (
    <>
      <p className={hintTextClasses}>
        {summary.input_rows.toLocaleString()} Input Rows · {summary.rules.length} rules
      </p>
      {hasRequiredRule && (
        <p className="m-0 rounded-control border border-warning-border bg-warning-surface px-3 py-2 text-sm text-warning-text">
          For Required rules, missing Input Rows also count as failures. Those counts overlap.
        </p>
      )}
      <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-control border border-border">
        <table className={summaryTableClasses}>
          <thead>
            <tr>
              <th scope="col">Column and rule</th>
              <th scope="col">Missing Input Rows</th>
              <th scope="col">Passing Input Rows</th>
              <th scope="col">Failing Input Rows</th>
            </tr>
          </thead>
          <tbody>
            {summary.rules.map((ruleResult) => {
              const rule = rules[ruleResult.rule_index];
              return (
                <tr key={ruleResult.rule_index}>
                  <th scope="row">
                    {rule === undefined
                      ? `Rule ${ruleResult.rule_index + 1}`
                      : `${rule.column || "(blank header)"} · ${ruleDescription(rule)}`}
                  </th>
                  <td>{ruleResult.missing_count.toLocaleString()}</td>
                  <td>{ruleResult.passing_count.toLocaleString()}</td>
                  <td>{ruleResult.failing_count.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={hintTextClasses}>
        Results contain counts only. Contract checks do not display or export failing row values.
      </p>
    </>
  );
}

export function DataContractPanel({
  selectedFile,
  worksheetName,
  columnNames,
  missingValueMarkers,
  datasetVersion,
  jobStatus,
  hidden,
  onJobStatusChanged,
  onAnalysisStartingChanged,
  onError,
}: DataContractPanelProps) {
  const [rules, setRules] = useState<DataContractRule[]>([]);
  const [selectedColumnName, setSelectedColumnName] = useState<string | null>(null);
  const [selectedRuleKind, setSelectedRuleKind] = useState<"required" | "enum" | "type">(
    "required",
  );
  const [enumValuesText, setEnumValuesText] = useState("");
  const [selectedValueType, setSelectedValueType] =
    useState<DataContractValueType>("integer");
  const [selectedDateFormat, setSelectedDateFormat] =
    useState<DataContractDateFormat>("YYYY-MM-DD");
  const [submittedContract, setSubmittedContract] = useState<{
    rules: DataContractRule[];
    datasetVersion: number;
    missingMarkersKey: string;
  } | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const missingMarkersKey = JSON.stringify(missingValueMarkers);
  const submittedContractMatchesContext =
    submittedContract !== null &&
    submittedContract.datasetVersion === datasetVersion &&
    submittedContract.missingMarkersKey === missingMarkersKey;
  const submittedRules = submittedContractMatchesContext ? submittedContract.rules : null;
  const isRunning =
    submittedContractMatchesContext && jobStatus?.state === "running";
  const isBusy = starting || isRunning;
  const columnIssues = useMemo(
    () => getDataContractColumnIssues({ version: 1, rules }, columnNames),
    [columnNames, rules],
  );
  const selectedColumn =
    selectedColumnName !== null && columnNames.includes(selectedColumnName)
      ? selectedColumnName
      : (columnNames[0] ?? null);
  const clearCurrentJob = useCallback(() => {
    setSubmittedContract(null);
    setJobError(null);
    onJobStatusChanged(null);
    onError(null);
  }, [onError, onJobStatusChanged]);

  const applyJobStatus = useCallback(
    (nextStatus: DataAnalysisJobStatus) => {
      onJobStatusChanged(nextStatus);
      if (nextStatus.state === "succeeded" || nextStatus.state === "cancelled") {
        setJobError(null);
        onError(null);
      } else if (nextStatus.state === "failed") {
        const message = nextStatus.error ?? "The contract analysis failed.";
        setJobError(message);
        onError(message);
      }
    },
    [onError, onJobStatusChanged],
  );

  const runningJobId = isRunning && jobStatus !== null ? jobStatus.job_id : null;
  useEffect(() => {
    if (runningJobId === null) {
      return;
    }

    const abortController = new AbortController();
    let stopped = false;
    const pollTimer = window.setInterval(async () => {
      try {
        const nextStatus = await fetchDataContractJobStatus(
          runningJobId,
          abortController.signal,
        );
        if (!stopped) {
          applyJobStatus(nextStatus);
        }
      } catch (error: unknown) {
        if (stopped || abortController.signal.aborted) {
          return;
        }
        const message =
          error instanceof DataAnalysisRequestError
            ? error.message
            : "The local API could not read the contract status. Try again.";
        setJobError(message);
        onError(message);
      }
    }, JOB_POLL_INTERVAL_MILLISECONDS);

    return () => {
      stopped = true;
      window.clearInterval(pollTimer);
      abortController.abort();
    };
  }, [applyJobStatus, onError, runningJobId]);

  function replaceRules(nextRules: DataContractRule[]) {
    setRules(nextRules);
    setContractError(null);
    setFeedback(null);
    clearCurrentJob();
  }

  function handleRuleAdded(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedColumn === null) {
      setContractError("Select a column before adding a rule.");
      return;
    }

    let rule: DataContractRule;
    if (selectedRuleKind === "required") {
      rule = { column: selectedColumn, kind: "required" };
    } else if (selectedRuleKind === "enum") {
      const values = enumValuesText.split(/\r?\n/).filter((value) => value.length > 0);
      if (values.length === 0) {
        setContractError("Enter at least one allowed value, with one value per line.");
        return;
      }
      if (values.some((value) => value.trim().length === 0)) {
        setContractError("Allowed values cannot be empty or whitespace-only.");
        return;
      }
      if (new Set(values).size !== values.length) {
        setContractError("Allowed values must be distinct.");
        return;
      }
      rule = { column: selectedColumn, kind: "enum", values };
    } else if (selectedValueType === "date") {
      rule = {
        column: selectedColumn,
        kind: "type",
        value_type: "date",
        date_format: selectedDateFormat,
      };
    } else {
      rule = {
        column: selectedColumn,
        kind: "type",
        value_type: selectedValueType,
      };
    }

    replaceRules([...rules, rule]);
  }

  async function handleContractFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const selectedContractFile = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (selectedContractFile === undefined) {
      return;
    }

    try {
      const importedContract = parseDataContractJson(await selectedContractFile.text());
      replaceRules(importedContract.rules);
      setFeedback("Contract imported.");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "The contract file could not be read.";
      setContractError(message);
      setFeedback(null);
    }
  }

  function handleContractExport() {
    if (rules.length === 0) {
      return;
    }

    const contract: DataContractV1 = { version: 1, rules };
    const contractBlob = new Blob([serializeDataContract(contract)], {
      type: "application/json",
    });
    const objectUrl = URL.createObjectURL(contractBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = objectUrl;
    downloadLink.download = "patternx-data-contract.json";
    downloadLink.hidden = true;

    try {
      document.body.append(downloadLink);
      downloadLink.click();
      setFeedback("Contract exported.");
      setContractError(null);
    } finally {
      downloadLink.remove();
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function handleContractRun() {
    if (selectedFile === null || rules.length === 0 || columnIssues.length > 0 || isBusy) {
      return;
    }

    const contract: DataContractV1 = { version: 1, rules };
    clearCurrentJob();
    setSubmittedContract({
      rules: [...rules],
      datasetVersion,
      missingMarkersKey,
    });
    setContractError(null);
    setJobError(null);
    setFeedback(null);
    setStarting(true);
    onAnalysisStartingChanged(CONTRACT_JOB_KIND, true);

    try {
      const nextStatus = await startDataContractJob(
        selectedFile,
        worksheetName,
        missingValueMarkers,
        contract,
      );
      applyJobStatus(nextStatus);
    } catch (error: unknown) {
      const message =
        error instanceof DataAnalysisRequestError
          ? error.message
          : "The contract analysis could not be started.";
      setJobError(message);
      onError(message);
    } finally {
      setStarting(false);
      onAnalysisStartingChanged(CONTRACT_JOB_KIND, false);
    }
  }

  const result = submittedContractMatchesContext
    ? contractSummaryFromStatus(jobStatus)
    : null;
  const resultRules = submittedRules ?? rules;
  const controlsDisabled = isBusy || selectedColumn === null;

  return (
    <div className="grid min-w-0 gap-4" hidden={hidden}>
      <header className="grid min-w-0 gap-2 rounded-panel border border-border bg-surface p-4 shadow-card sm:p-panel">
        <h2 className="text-xl font-semibold tracking-tight text-text">Data Contracts</h2>
        <p className={hintTextClasses}>
          Add checks for this file and review aggregate counts. Contract results never show
          failing row values.
        </p>
        <p className={hintTextClasses}>
          Rules use the applied Missing Value settings. Export a contract to keep it after
          this browser session.
        </p>
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="grid min-w-0 content-start gap-4 rounded-panel border border-border bg-surface p-4 shadow-card sm:p-panel">
          <div className="grid min-w-0 gap-1">
            <h3 className="text-lg font-semibold text-text">Add a rule</h3>
            <p className={hintTextClasses}>Choose a column and define one check.</p>
          </div>

          <form className="grid min-w-0 gap-3" onSubmit={handleRuleAdded}>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="grid min-w-0 gap-1.5">
                <label className="text-sm font-semibold text-text" htmlFor="contract-column">
                  Column
                </label>
                <select
                  className="min-h-11 min-w-0 rounded-control border border-border-strong bg-surface px-3 text-sm text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  disabled={controlsDisabled}
                  id="contract-column"
                  onChange={(event) => setSelectedColumnName(event.currentTarget.value)}
                  value={selectedColumn ?? ""}
                >
                  {columnNames.map((columnName, columnIndex) => (
                    <option key={`${columnName}-${columnIndex}`} value={columnName}>
                      {columnName || "(blank header)"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <label className="text-sm font-semibold text-text" htmlFor="contract-rule-kind">
                  Rule
                </label>
                <select
                  className="min-h-11 min-w-0 rounded-control border border-border-strong bg-surface px-3 text-sm text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  disabled={controlsDisabled}
                  id="contract-rule-kind"
                  onChange={(event) => {
                    const nextRuleKind = event.currentTarget.value;
                    if (isDataContractRuleKind(nextRuleKind)) {
                      setSelectedRuleKind(nextRuleKind);
                    }
                  }}
                  value={selectedRuleKind}
                >
                  <option value="required">Required</option>
                  <option value="enum">Allowed values</option>
                  <option value="type">Data type</option>
                </select>
              </div>
            </div>

            {selectedRuleKind === "enum" && (
              <div className="grid min-w-0 gap-1.5">
                <label className="text-sm font-semibold text-text" htmlFor="contract-enum-values">
                  Allowed values, one per line
                </label>
                <textarea
                  className="min-h-24 min-w-0 resize-y rounded-control border border-border-strong bg-surface px-3 py-2 text-sm text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  disabled={controlsDisabled}
                  id="contract-enum-values"
                  onChange={(event) => setEnumValuesText(event.currentTarget.value)}
                  value={enumValuesText}
                />
              </div>
            )}

            {selectedRuleKind === "type" && (
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="grid min-w-0 gap-1.5">
                  <label className="text-sm font-semibold text-text" htmlFor="contract-value-type">
                    Data type
                  </label>
                  <select
                    className="min-h-11 min-w-0 rounded-control border border-border-strong bg-surface px-3 text-sm text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    disabled={controlsDisabled}
                    id="contract-value-type"
                    onChange={(event) => {
                      const nextValueType = event.currentTarget.value;
                      if (isDataContractValueType(nextValueType)) {
                        setSelectedValueType(nextValueType);
                      }
                    }}
                    value={selectedValueType}
                  >
                    <option value="integer">Integer</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                  </select>
                </div>
                {selectedValueType === "date" && (
                  <div className="grid min-w-0 gap-1.5">
                    <label className="text-sm font-semibold text-text" htmlFor="contract-date-format">
                      Date format
                    </label>
                    <select
                      className="min-h-11 min-w-0 rounded-control border border-border-strong bg-surface px-3 text-sm text-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      disabled={controlsDisabled}
                      id="contract-date-format"
                      onChange={(event) => {
                        const nextDateFormat = event.currentTarget.value;
                        if (isDataContractDateFormat(nextDateFormat)) {
                          setSelectedDateFormat(nextDateFormat);
                        }
                      }}
                      value={selectedDateFormat}
                    >
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="YYYY-MM-DD HH:MM:SS">YYYY-MM-DD HH:MM:SS</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            <button className={secondaryButtonClasses} disabled={controlsDisabled} type="submit">
              Add rule
            </button>
          </form>

          {contractError !== null && (
            <p className={errorMessageClasses} role="alert">
              {contractError}
            </p>
          )}
          {columnIssues.length > 0 && (
            <p className={errorMessageClasses} role="alert">
              Fix these column matches before you run the contract. {columnIssues.join(" ")}
            </p>
          )}

          <section className="grid min-w-0 gap-3" aria-labelledby="contract-rules-heading">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-text" id="contract-rules-heading">
                Contract rules
              </h3>
              <div className="flex flex-wrap gap-2">
                <input
                  accept=".json,application/json"
                  aria-label="Import a data contract JSON file"
                  className="sr-only"
                  disabled={isBusy}
                  id="contract-import-file"
                  onChange={(event) => void handleContractFileSelected(event)}
                  ref={fileInputRef}
                  type="file"
                />
                <button
                  className={secondaryButtonClasses}
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  Import JSON
                </button>
                <button
                  className={secondaryButtonClasses}
                  disabled={isBusy || rules.length === 0}
                  onClick={handleContractExport}
                  type="button"
                >
                  Export JSON
                </button>
              </div>
            </div>

            {rules.length === 0 ? (
              <p className={hintTextClasses}>Add a rule or import a version 1 contract.</p>
            ) : (
              <ol className="m-0 grid min-w-0 list-none gap-2 p-0">
                {rules.map((rule, ruleIndex) => (
                  <li
                    className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-surface-muted p-3"
                    key={`${rule.column}-${rule.kind}-${ruleIndex}`}
                  >
                    <div className="grid min-w-0 gap-1">
                      <span className="break-words font-semibold text-text">
                        {rule.column || "(blank header)"} · {ruleDescription(rule)}
                      </span>
                    </div>
                    <button
                      aria-label={`Remove ${rule.column || "blank header"} rule ${ruleIndex + 1}`}
                      className={secondaryButtonClasses}
                      disabled={isBusy}
                      onClick={() => replaceRules(rules.filter((_, index) => index !== ruleIndex))}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                className={primaryButtonClasses}
                disabled={
                  isBusy ||
                  selectedFile === null ||
                  rules.length === 0 ||
                  columnIssues.length > 0
                }
                onClick={() => void handleContractRun()}
                type="button"
              >
                Run contract
              </button>
            </div>
            {feedback !== null && (
              <p className="m-0 text-sm text-text-secondary" role="status">
                {feedback}
              </p>
            )}
            {jobError !== null && (
              <p className={errorMessageClasses} role="alert">
                {jobError}
              </p>
            )}
          </section>
        </section>

        <section className="grid min-w-0 content-start gap-3 rounded-panel border border-border bg-surface p-4 shadow-card sm:p-panel" aria-labelledby="contract-results-heading">
          <h3 className="text-lg font-semibold text-text" id="contract-results-heading">
            Results
          </h3>
          <p className={hintTextClasses}>
            Missing Values use the applied markers. Required rules count missing rows as failures
            too; enum and type rules keep missing separate from pass and fail.
          </p>
          {result !== null && jobStatus?.state === "succeeded" ? (
            <DataContractResults summary={result} rules={resultRules} />
          ) : jobStatus?.state === "cancelled" ? (
            <p className={hintTextClasses}>The contract analysis was cancelled. No summary was kept.</p>
          ) : isRunning || starting ? (
            <p className={hintTextClasses} role="status">
              The contract is being checked. Progress and cancellation are available above.
            </p>
          ) : (
            <p className={hintTextClasses}>
              Run a contract to see missing, passing, and failing Input Row counts.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
