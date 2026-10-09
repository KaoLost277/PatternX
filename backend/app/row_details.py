from collections.abc import Collection, Sequence
from dataclasses import dataclass
from typing import Literal

from app.completeness import sqlite_column_name

ColumnMode = Literal["all", "analysis"]


@dataclass(frozen=True)
class SourceColumnProjection:
    """Display labels and matching generated SQL identifiers in source order."""

    names: tuple[str, ...]
    sqlite_columns: tuple[str, ...]


def source_column_projection(
    source_columns: Sequence[str],
    analysis_columns: Collection[str],
    column_mode: ColumnMode,
) -> SourceColumnProjection:
    """Choose columns for display/export and their corresponding SQLite columns."""
    all_indexes = tuple(range(len(source_columns)))
    visible_indexes = all_indexes
    if column_mode == "analysis":
        analysis_column_set = set(analysis_columns)
        analysis_indexes = tuple(
            index
            for index, column_name in enumerate(source_columns)
            if column_name in analysis_column_set
        )
        if analysis_indexes:
            visible_indexes = analysis_indexes

    # Keep the details interpretable if analysis metadata would hide every column.
    return SourceColumnProjection(
        names=tuple(source_columns[index] for index in visible_indexes),
        sqlite_columns=tuple(sqlite_column_name(index) for index in visible_indexes),
    )
