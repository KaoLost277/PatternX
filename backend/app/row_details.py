from typing import Literal

ColumnMode = Literal["all", "analysis"]


def source_columns_for_mode(
    source_columns: list[str],
    analysis_columns: tuple[str, ...] | list[str],
    column_mode: ColumnMode,
) -> list[str]:
    if column_mode == "all":
        return list(source_columns)

    analysis_column_set = set(analysis_columns)
    visible_columns = [
        column_name
        for column_name in source_columns
        if column_name in analysis_column_set
    ]
    # Keep the details interpretable if analysis metadata would hide every column.
    return visible_columns or list(source_columns)
