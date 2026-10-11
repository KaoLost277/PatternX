import { useEffect, useRef, useState } from "react";
import {
  cancelColumnProfileJob,
  DataAnalysisRequestError,
  fetchColumnProfileJobStatus,
  inputRowsMetricShare,
  presentValuesMetricShare,
  startColumnProfileJob,
} from "./dataAnalysisApi";
import type { ColumnProfile, ColumnProfileJobStatus } from "./dataAnalysisApi";
import { formatShare } from "./displayFormat";
import {
  errorMessageClasses,
  hintTextClasses,
  loadingSpinnerClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  statusTextClasses,
  summaryTableClasses,
  summaryTableFrameClasses,
} from "./uiClasses";

type ColumnProfilePanelState =
  | { kind: "empty" }
  | { kind: "starting"; previousJob: ColumnProfileJobStatus | null }
  | { kind: "job"; job: ColumnProfileJobStatus }
  | {
      kind: "request_error";
      previousJob: ColumnProfileJobStatus | null;
      message: string;
    };

interface ColumnProfilePanelProps {
  selectedFile: File;
  worksheetName: string;
  missingValueMarkers: Record<string, string[]>;
  hidden: boolean;
  onFormalTermsRequested: (columnName: string) => void;
}

interface ColumnProfileViewProps {
  state: ColumnProfilePanelState;
  canceling: boolean;
  onBuildProfile: () => void;
  onCancelProfile: () => void;
  onFormalTermsRequested: (columnName: string) => void;
}

const JOB_POLL_INTERVAL_MILLISECONDS = 500;

function retainedJob(state: ColumnProfilePanelState): ColumnProfileJobStatus | null {
  if (state.kind === "job") {
    return state.job;
  }
  if (state.kind === "starting" || state.kind === "request_error") {
    return state.previousJob;
  }
  return null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof DataAnalysisRequestError ? error.message : fallback;
}

function inputRowsMetricText(metric: ColumnProfile["present"]): string {
  return `${metric.count.toLocaleString()} of ${metric.denominator.toLocaleString()} Input Rows (${formatShare(inputRowsMetricShare(metric))})`;
}

function distinctTermsMetricText(metric: ColumnProfile["distinctTerms"]): string {
  const values = `${metric.count.toLocaleString()} of ${metric.denominator.toLocaleString()} present values`;
  const share = presentValuesMetricShare(metric);
  if (share === null) {
    return `${values} (share unavailable because there are no present values)`;
  }
  return `${values} (${formatShare(share)})`;
}

export function ColumnProfilePanel({
  selectedFile,
  worksheetName,
  missingValueMarkers,
  hidden,
  onFormalTermsRequested,
}: ColumnProfilePanelProps) {
  const [state, setState] = useState<ColumnProfilePanelState>({ kind: "empty" });
  const [canceling, setCanceling] = useState(false);
  const isMountedRef = useRef(true);
  const activeJobIdRef = useRef<string | null>(null);
  const job = retainedJob(state);
  const runningJobId = job?.state === "running" ? job.jobId : null;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const activeJobId = activeJobIdRef.current;
      if (activeJobId !== null) {
        void cancelColumnProfileJob(activeJobId).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (runningJobId === null) {
      return;
    }

    const pollTimer = window.setInterval(async () => {
      try {
        const nextJob = await fetchColumnProfileJobStatus(runningJobId);
        setState((currentState) => {
          const currentJob = retainedJob(currentState);
          if (currentJob?.jobId !== runningJobId || currentJob.state !== "running") {
            return currentState;
          }
          return { kind: "job", job: nextJob };
        });
      } catch (error: unknown) {
        setState((currentState) => {
          const currentJob = retainedJob(currentState);
          if (currentJob?.jobId !== runningJobId || currentJob.state !== "running") {
            return currentState;
          }
          return {
            kind: "request_error",
            previousJob: currentJob,
            message: errorMessage(
              error,
              "The local API could not read the column profile status. Try again.",
            ),
          };
        });
      }
    }, JOB_POLL_INTERVAL_MILLISECONDS);

    return () => window.clearInterval(pollTimer);
  }, [runningJobId]);

  async function handleBuildProfile() {
    const previousJob = retainedJob(state);
    setState({ kind: "starting", previousJob });
    try {
      const startedJob = await startColumnProfileJob(
        selectedFile,
        worksheetName,
        missingValueMarkers,
      );
      if (!isMountedRef.current) {
        await cancelColumnProfileJob(startedJob.jobId).catch(() => {});
        return;
      }
      activeJobIdRef.current = startedJob.jobId;
      setState({ kind: "job", job: startedJob });
    } catch (error: unknown) {
      setState({
        kind: "request_error",
        previousJob,
        message: errorMessage(
          error,
          "The column profile could not be started. Check the local API and try again.",
        ),
      });
    }
  }

  async function handleCancelProfile() {
    if (job?.state !== "running") {
      return;
    }

    setCanceling(true);
    try {
      const cancelledJob = await cancelColumnProfileJob(job.jobId);
      setState({ kind: "job", job: cancelledJob });
    } catch (error: unknown) {
      setState({
        kind: "request_error",
        previousJob: job,
        message: errorMessage(
          error,
          "The column profile could not be cancelled. Check the local API and retry.",
        ),
      });
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-4" hidden={hidden}>
      <ColumnProfileView
        state={state}
        canceling={canceling}
        onBuildProfile={() => void handleBuildProfile()}
        onCancelProfile={() => void handleCancelProfile()}
        onFormalTermsRequested={onFormalTermsRequested}
      />
    </div>
  );
}

export function ColumnProfileView({
  state,
  canceling,
  onBuildProfile,
  onCancelProfile,
  onFormalTermsRequested,
}: ColumnProfileViewProps) {
  const job = retainedJob(state);
  const profile = job?.state === "succeeded" ? job.result : null;
  const loading = state.kind === "starting" || job?.state === "running";

  return (
    <section
      className="grid min-w-0 gap-4 rounded-panel border border-border bg-surface p-4 shadow-card sm:p-panel"
      aria-labelledby="column-profile-heading"
    >
      <div className="grid min-w-0 gap-2">
        <h2 className="m-0 text-lg font-semibold" id="column-profile-heading">
          Unified column profile
        </h2>
        <p className={statusTextClasses}>
          Review present and missing Input Rows and distinct Formal Terms for every source column.
        </p>
        <p className={hintTextClasses}>
          Present and missing shares use all Input Rows. Distinct Formal Term shares use present
          values. The profile shows aggregate counts only. It does not show terms, structural
          formats, inferred types, or Data Contract results.
        </p>
      </div>

      {state.kind === "empty" && (
        <div className="grid justify-items-start gap-3" role="status">
          <p className={statusTextClasses}>No column profile has been built for this file.</p>
          <button type="button" className={primaryButtonClasses} onClick={onBuildProfile}>
            Build profile
          </button>
        </div>
      )}

      {state.kind === "starting" && (
        <p className={`${statusTextClasses} flex items-center`} role="status">
          <span className={loadingSpinnerClasses} aria-hidden="true" />
          <span className="ml-2">Uploading the file and starting the column profile.</span>
        </p>
      )}

      {state.kind === "request_error" && (
        <div className="grid justify-items-start gap-3">
          <p className={errorMessageClasses} role="alert">{state.message}</p>
          <button type="button" className={primaryButtonClasses} onClick={onBuildProfile}>
            Try again
          </button>
        </div>
      )}

      {loading && (
        <div className="grid min-w-0 gap-3" role="status">
          <p className="m-0 flex items-center text-sm text-text-secondary">
            <span className={loadingSpinnerClasses} aria-hidden="true" />
            <span className="ml-2">{job?.stage ?? "Building the column profile."}</span>
          </p>
          {job?.progress !== null && job?.progress !== undefined && (
            <div className="grid gap-2">
              <progress
                className="h-2.5 w-full overflow-hidden rounded-full accent-accent"
                value={job.progress.itemsDone}
                max={job.progress.itemsTotal}
              />
              <p className={hintTextClasses}>
                {job.progress.itemsDone.toLocaleString()} of {job.progress.itemsTotal.toLocaleString()} columns profiled.
              </p>
            </div>
          )}
          {job?.state === "running" && (
            <button
              type="button"
              className={secondaryButtonClasses}
              disabled={canceling}
              onClick={onCancelProfile}
            >
              {canceling ? "Cancelling..." : "Cancel profile"}
            </button>
          )}
        </div>
      )}

      {state.kind === "job" && job?.state === "failed" && (
        <div className="grid justify-items-start gap-3">
          <p className={errorMessageClasses} role="alert">
            {job.error ?? "The column profile could not be built."}
          </p>
          <button type="button" className={primaryButtonClasses} onClick={onBuildProfile}>
            Try again
          </button>
        </div>
      )}

      {state.kind === "job" && job?.state === "cancelled" && (
        <div className="grid justify-items-start gap-3">
          <p className={statusTextClasses} role="status">
            Profile cancelled. No aggregate result was kept.
          </p>
          <button type="button" className={primaryButtonClasses} onClick={onBuildProfile}>
            Build profile
          </button>
        </div>
      )}

      {profile !== null && (
        <section className="grid min-w-0 gap-3" aria-labelledby="column-profile-results-heading">
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
            <h3 className="m-0 text-base font-semibold" id="column-profile-results-heading">
              Column profile results
            </h3>
            <p className={statusTextClasses}>
              {profile.inputRows.toLocaleString()} Input Rows · {profile.columns.length.toLocaleString()} source columns.
            </p>
          </div>
          <div
            className={summaryTableFrameClasses}
            role="region"
            aria-label="Column profile. Scroll to view all source columns."
            tabIndex={0}
          >
            <table className={`${summaryTableClasses} min-w-[64rem]`}>
              <thead>
                <tr>
                  <th scope="col">Source column</th>
                  <th scope="col">Present Input Rows</th>
                  <th scope="col">Missing Input Rows</th>
                  <th scope="col">Distinct Formal Terms among present values</th>
                  <th scope="col">Detailed analysis</th>
                </tr>
              </thead>
              <tbody>
                {profile.columns.map((column, columnIndex) => (
                  <tr key={`${columnIndex}-${column.name}`}>
                    <th scope="row">{column.name}</th>
                    <td>{inputRowsMetricText(column.present)}</td>
                    <td>{inputRowsMetricText(column.missing)}</td>
                    <td>{distinctTermsMetricText(column.distinctTerms)}</td>
                    <td>
                      <button
                        type="button"
                        className={secondaryButtonClasses}
                        aria-label={`Open Formal Terms for ${column.name}`}
                        onClick={() => onFormalTermsRequested(column.name)}
                      >
                        Open Formal Terms
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
