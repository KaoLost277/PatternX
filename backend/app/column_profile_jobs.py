import sqlite3
from dataclasses import dataclass
from pathlib import Path

from app.data_analyses import (
    ColumnProfileSummary,
    DataAnalysisSummary,
    compute_column_profile,
)
from app.data_analysis_jobs import ManagedDataAnalysisJob, ManagedDataAnalysisJobStore
from app.data_contracts import ContractSummary
from app.workfiles import clean_up_job

COLUMN_PROFILE_KIND = "column_profile"


@dataclass(frozen=True)
class ColumnProfileInputs:
    analysis_csv_path: Path
    database_path: Path
    column_names: list[str]
    missing_markers_by_column: dict[str, list[str]]


class ColumnProfileJob(ManagedDataAnalysisJob):
    def __init__(
        self,
        job_id: str,
        job_directory: Path,
        analysis_inputs: ColumnProfileInputs,
    ) -> None:
        self.analysis_inputs: ColumnProfileInputs | None = analysis_inputs
        super().__init__(
            job_id,
            COLUMN_PROFILE_KIND,
            job_directory,
            analysis_inputs.analysis_csv_path,
            analysis_inputs.database_path,
        )

    def compute_summary(self, connection: sqlite3.Connection) -> ColumnProfileSummary:
        analysis_inputs = self.analysis_inputs
        if analysis_inputs is None:
            raise ValueError("The profile inputs are no longer available to this job.")

        self.set_stage("Counting values in each source column")
        return compute_column_profile(
            connection,
            analysis_inputs.column_names,
            analysis_inputs.missing_markers_by_column,
            progress_reporter=self.report_progress,
            cancellation_check=self.is_cancel_requested,
        )

    def clean_up_successful_job(self) -> None:
        clean_up_job(self.job_directory)

    def _finish(
        self,
        state: str,
        result: DataAnalysisSummary | ContractSummary | ColumnProfileSummary | None,
        error: str | None,
    ) -> None:
        self.analysis_inputs = None
        super()._finish(state, result, error)


class ColumnProfileJobStore(ManagedDataAnalysisJobStore[ColumnProfileJob]):
    pass
