"""Background job for aggregate data-contract validation."""

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from app.completeness import sqlite_column_name
from app.data_analyses import DataAnalysisSummary, count_data_input_rows
from app.data_analysis_jobs import ManagedDataAnalysisJob, ManagedDataAnalysisJobStore
from app.data_contracts import ContractEvaluator, ContractSummary, ResolvedContract
from app.patterns import raise_if_cancelled
from app.sqlite_storage import ANALYSIS_TABLE_NAME
from app.workfiles import clean_up_job

DATA_CONTRACT_KIND = "data_contract"
CONTRACT_SCAN_BATCH_ROWS = 1_000


@dataclass(frozen=True)
class DataContractAnalysisInputs:
    analysis_csv_path: Path
    database_path: Path
    resolved_contract: ResolvedContract


class DataContractJob(ManagedDataAnalysisJob):
    """Run a contract and expose aggregate results without row details."""

    def __init__(
        self,
        job_id: str,
        job_directory: Path,
        analysis_inputs: DataContractAnalysisInputs,
    ) -> None:
        self.resolved_contract: ResolvedContract | None = analysis_inputs.resolved_contract
        super().__init__(
            job_id,
            DATA_CONTRACT_KIND,
            job_directory,
            analysis_inputs.analysis_csv_path,
            analysis_inputs.database_path,
        )

    def compute_summary(self, connection: sqlite3.Connection) -> ContractSummary:
        resolved_contract = self.resolved_contract
        if resolved_contract is None:
            raise ValueError("The contract rules are no longer available to this job.")

        input_rows = count_data_input_rows(connection)
        self.set_stage("Checking contract rules")
        evaluator = ContractEvaluator(resolved_contract)
        selected_columns = ", ".join(
            sqlite_column_name(column_index)
            for column_index in resolved_contract.selected_column_indexes
        )
        cursor = connection.execute(
            f'SELECT {selected_columns} FROM "{ANALYSIS_TABLE_NAME}" ORDER BY rowid ASC'
        )
        rows_done = 0

        while True:
            raise_if_cancelled(self.is_cancel_requested)
            row_batch = cursor.fetchmany(CONTRACT_SCAN_BATCH_ROWS)
            if not row_batch:
                break

            for row in row_batch:
                raise_if_cancelled(self.is_cancel_requested)
                values_by_column_index = dict(
                    zip(resolved_contract.selected_column_indexes, row, strict=True)
                )
                evaluator.add_row(values_by_column_index)
                rows_done += 1

            self.report_progress(rows_done, input_rows)

        return evaluator.summary()

    def clean_up_successful_job(self) -> None:
        clean_up_job(self.job_directory)

    def _finish(
        self,
        state: str,
        result: DataAnalysisSummary | ContractSummary | None,
        error: str | None,
    ) -> None:
        self.resolved_contract = None
        super()._finish(state, result, error)


class DataContractJobStore(ManagedDataAnalysisJobStore[DataContractJob]):
    """Retain the latest contract job and its aggregate status."""
