"""Transform tabular columns using date truncation, delimiter splitting, substring, and regex."""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

TARGET_MODE_NEW_COLUMN = "new_column"
TARGET_MODE_OVERWRITE = "overwrite"
TargetMode = Literal["new_column", "overwrite"]

TRANSFORM_DATE_TRUNCATE = "date_truncate"
TRANSFORM_DELIMITER_SPLIT = "delimiter_split"
TRANSFORM_SUBSTRING = "substring"
TRANSFORM_REGEX = "regex_extract"
TRANSFORM_CASE_TRIM = "case_trim"

TransformType = Literal[
    "date_truncate",
    "delimiter_split",
    "substring",
    "regex_extract",
    "case_trim",
]

# Regex to detect common date components in strings:
# e.g., 13/06/26, 2026-06-13, 06-13-2026, 2026.06.13
DATE_PATTERN = re.compile(
    r"\b(\d{1,4}[/\-\.]\d{1,2}[/\-\.]\d{1,4})\b"
)
# Regex to detect time component: HH:MM:SS or HH:MM
TIME_PATTERN = re.compile(
    r"\b(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\b",
    re.IGNORECASE,
)


class TransformationError(Exception):
    """Raised when transformation configuration or execution fails."""


@dataclass(frozen=True)
class RuleStats:
    matched_count: int = 0
    unmatched_count: int = 0
    empty_count: int = 0
    total_rows: int = 0


@dataclass
class TransformRule:
    id: str
    source_column: str
    target_mode: TargetMode
    target_column: str
    transform_type: TransformType
    config: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TransformRule:
        rule_id = str(data.get("id", "")).strip()
        source_column = str(data.get("source_column", "")).strip()
        target_mode = data.get("target_mode", TARGET_MODE_NEW_COLUMN)
        target_column = str(data.get("target_column", "")).strip()
        transform_type = data.get("transform_type", TRANSFORM_DELIMITER_SPLIT)
        config = data.get("config", {})

        if not source_column:
            raise TransformationError("source_column is required.")
        if target_mode not in (TARGET_MODE_NEW_COLUMN, TARGET_MODE_OVERWRITE):
            raise TransformationError(f"Invalid target_mode: {target_mode}")
        if target_mode == TARGET_MODE_NEW_COLUMN and not target_column:
            target_column = f"{source_column}_transformed"
        elif target_mode == TARGET_MODE_OVERWRITE:
            target_column = source_column

        return cls(
            id=rule_id or f"rule_{source_column}",
            source_column=source_column,
            target_mode=target_mode,
            target_column=target_column,
            transform_type=transform_type,
            config=config if isinstance(config, dict) else {},
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "source_column": self.source_column,
            "target_mode": self.target_mode,
            "target_column": self.target_column,
            "transform_type": self.transform_type,
            "config": self.config,
        }


def transform_cell(value: str | None, rule: TransformRule) -> tuple[str | None, bool]:
    """Transform a single cell value.

    Returns (transformed_value, was_matched). If value is None, empty, or does not
    match the rule pattern, falls back safely to original value with was_matched=False.
    """
    if value is None:
        return None, False
    text = value.strip()
    if not text:
        return value, False

    t_type = rule.transform_type
    cfg = rule.config

    if t_type == TRANSFORM_DATE_TRUNCATE:
        return _transform_date_truncate(value, cfg)
    elif t_type == TRANSFORM_DELIMITER_SPLIT:
        return _transform_delimiter_split(value, cfg)
    elif t_type == TRANSFORM_SUBSTRING:
        return _transform_substring(value, cfg)
    elif t_type == TRANSFORM_REGEX:
        return _transform_regex(value, cfg)
    elif t_type == TRANSFORM_CASE_TRIM:
        return _transform_case_trim(value, cfg)

    return value, False


def _transform_date_truncate(value: str, config: dict[str, Any]) -> tuple[str, bool]:
    part = config.get("part", "date_only")
    delimiter = config.get("delimiter")

    # If explicit delimiter is provided (e.g. ":", " ", "T")
    if delimiter and delimiter in value:
        parts = value.split(delimiter, 1)
        if part == "date_only":
            return parts[0].strip(), True
        elif part == "time_only" and len(parts) > 1:
            return parts[1].strip(), True

    # Smart regex matching
    if part == "date_only":
        match = DATE_PATTERN.search(value)
        if match:
            return match.group(1), True
        # If separated by colon or space or T, try first token
        for sep in (":", " ", "T"):
            if sep in value:
                candidate = value.split(sep, 1)[0].strip()
                if any(char.isdigit() for char in candidate):
                    return candidate, True
    elif part == "time_only":
        match = TIME_PATTERN.search(value)
        if match:
            return match.group(1), True
        for sep in (" ", "T", ":"):
            if sep in value:
                candidate = value.split(sep, 1)[1].strip()
                if any(char.isdigit() for char in candidate):
                    return candidate, True

    # Fallback
    return value, False


def _transform_delimiter_split(value: str, config: dict[str, Any]) -> tuple[str, bool]:
    delimiter = config.get("delimiter", "_")
    position = config.get("position", "after")  # "after", "before", "part_index", "after_last", "before_first"
    part_index = int(config.get("part_index", 1))

    if not delimiter or delimiter not in value:
        return value, False

    if position == "before" or position == "before_first":
        result = value.split(delimiter, 1)[0]
        return result, True
    elif position == "after":
        parts = value.split(delimiter, 1)
        if len(parts) > 1:
            return parts[1], True
    elif position == "after_last":
        result = value.rsplit(delimiter, 1)[-1]
        return result, True
    elif position == "part_index":
        parts = value.split(delimiter)
        # 1-based index
        if 1 <= part_index <= len(parts):
            return parts[part_index - 1], True

    return value, False


def _transform_substring(value: str, config: dict[str, Any]) -> tuple[str, bool]:
    mode = config.get("mode", "first_n")  # "first_n", "last_n", "range"
    count = int(config.get("count", 5))
    start = int(config.get("start", 0))
    length = int(config.get("length", 5))

    if mode == "first_n":
        return value[:count], True
    elif mode == "last_n":
        return value[-count:] if count > 0 else value, True
    elif mode == "range":
        end = start + length if length > 0 else len(value)
        return value[start:end], True

    return value, False


def _transform_regex(value: str, config: dict[str, Any]) -> tuple[str, bool]:
    pattern_str = config.get("pattern", "")
    group = int(config.get("group", 1))

    if not pattern_str:
        return value, False

    try:
        match = re.search(pattern_str, value)
        if match:
            if 0 <= group <= len(match.groups()):
                return match.group(group), True
            return match.group(0), True
    except re.error:
        return value, False

    return value, False


def _transform_case_trim(value: str, config: dict[str, Any]) -> tuple[str, bool]:
    res = value
    if config.get("trim", True):
        res = res.strip()
    case = config.get("case", "none")
    if case == "upper":
        res = res.upper()
    elif case == "lower":
        res = res.lower()
    elif case == "title":
        res = res.title()
    return res, True


def apply_transformations_to_rows(
    columns: list[str],
    rows: list[list[str]],
    rules: list[TransformRule],
) -> tuple[list[str], list[list[str]], dict[str, RuleStats]]:
    """Apply an ordered list of transformation rules across rectangular data rows.

    Returns:
        (new_columns, transformed_rows, stats_per_rule)
    """
    current_columns = list(columns)
    current_rows = [list(row) for row in rows]
    stats: dict[str, RuleStats] = {}

    for rule in rules:
        if rule.source_column not in current_columns:
            stats[rule.id] = RuleStats(total_rows=len(current_rows))
            continue

        src_idx = current_columns.index(rule.source_column)
        matched_cnt = 0
        unmatched_cnt = 0
        empty_cnt = 0

        # Determine target column index
        if rule.target_mode == TARGET_MODE_OVERWRITE:
            target_idx = src_idx
            # column name remains source_column
        else:
            # New column: make sure target_column name is unique
            target_name = rule.target_column
            suffix = 1
            while target_name in current_columns:
                target_name = f"{rule.target_column}_{suffix}"
                suffix += 1
            current_columns.append(target_name)
            target_idx = len(current_columns) - 1

        for row in current_rows:
            raw_val = row[src_idx] if src_idx < len(row) else ""
            if not raw_val or not raw_val.strip():
                empty_cnt += 1
                trans_val = raw_val
                was_matched = False
            else:
                trans_val, was_matched = transform_cell(raw_val, rule)
                if was_matched:
                    matched_cnt += 1
                else:
                    unmatched_cnt += 1

            if rule.target_mode == TARGET_MODE_OVERWRITE:
                row[target_idx] = trans_val
            else:
                row.append(trans_val)

        stats[rule.id] = RuleStats(
            matched_count=matched_cnt,
            unmatched_count=unmatched_cnt,
            empty_count=empty_cnt,
            total_rows=len(current_rows),
        )

    return current_columns, current_rows, stats


def transform_csv_stream(
    input_csv_path: Path,
    output_csv_path: Path,
    rules: list[TransformRule],
) -> tuple[list[str], dict[str, RuleStats], int]:
    """Stream input CSV, apply transformation rules, and write to output CSV."""
    with input_csv_path.open("r", encoding="utf-8-sig", newline="") as infile:
        reader = csv.reader(infile)
        header = next(reader, None)
        if not header:
            raise TransformationError("Empty CSV file.")

        # Read sample to compute columns and stats, or stream
        rows = list(reader)

    new_columns, transformed_rows, stats = apply_transformations_to_rows(header, rows, rules)

    with output_csv_path.open("w", encoding="utf-8-sig", newline="") as outfile:
        writer = csv.writer(outfile)
        writer.writerow(new_columns)
        writer.writerows(transformed_rows)

    return new_columns, stats, len(transformed_rows)
