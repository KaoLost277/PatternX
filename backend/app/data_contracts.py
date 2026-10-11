"""Typed data contracts and aggregate-only evaluation."""

import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Literal, NoReturn

from app.completeness import (
    NormalizedMissingMarkers,
    is_missing_value,
    normalize_missing_markers,
)


class ContractParseError(ValueError):
    """Raised when a JSON document is not a valid version 1 contract."""


class ContractResolutionError(ValueError):
    """Raised when a contract column does not resolve to exactly one input column."""


@dataclass(frozen=True)
class RequiredRule:
    column: str


@dataclass(frozen=True)
class EnumRule:
    column: str
    values: tuple[str, ...]


@dataclass(frozen=True)
class IntegerRule:
    column: str


@dataclass(frozen=True)
class NumberRule:
    column: str


@dataclass(frozen=True)
class DateRule:
    column: str
    date_format: Literal["YYYY-MM-DD", "YYYY-MM-DD HH:MM:SS"]


ContractRule = RequiredRule | EnumRule | IntegerRule | NumberRule | DateRule


@dataclass(frozen=True)
class ContractV1:
    rules: tuple[ContractRule, ...]


@dataclass(frozen=True)
class ResolvedRule:
    rule: ContractRule
    column_index: int
    missing_markers: NormalizedMissingMarkers


@dataclass(frozen=True)
class ResolvedContract:
    selected_column_indexes: tuple[int, ...]
    rules: tuple[ResolvedRule, ...]


@dataclass(frozen=True)
class ContractRuleSummary:
    rule_index: int
    missing_count: int
    passing_count: int
    failing_count: int


@dataclass(frozen=True)
class ContractSummary:
    input_rows: int
    rules: tuple[ContractRuleSummary, ...]


@dataclass
class _MutableRuleCounts:
    missing_count: int = 0
    passing_count: int = 0
    failing_count: int = 0


_INTEGER_PATTERN = re.compile(r"[+-]?[0-9]+")
_NUMBER_PATTERN = re.compile(
    r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"
)
_DATE_PATTERN = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_DATE_TIME_PATTERN = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}"
)


def parse_contract_json(raw_json: str) -> ContractV1:
    """Parse a complete version 1 contract at the JSON boundary."""
    try:
        decoded = json.loads(raw_json, parse_constant=_reject_non_json_constant)
    except json.JSONDecodeError as error:
        raise ContractParseError("The contract must be valid JSON.") from error

    contract_data = _require_object_fields(
        decoded,
        {"version", "rules"},
        "contract",
    )
    version = contract_data["version"]
    if isinstance(version, bool) or not isinstance(version, (int, float)):
        raise ContractParseError("The contract version must equal integer 1.")
    if version != 1:
        raise ContractParseError(f"Contract version {version} is not supported.")

    raw_rules = contract_data["rules"]
    if not isinstance(raw_rules, list) or not raw_rules:
        raise ContractParseError("The contract must contain at least one rule.")

    rules = tuple(_parse_rule(raw_rule) for raw_rule in raw_rules)
    return ContractV1(rules=rules)


def resolve_contract(
    contract: ContractV1,
    column_names: Sequence[str],
    missing_markers_by_column: Mapping[str, Sequence[str]],
) -> ResolvedContract:
    """Bind every rule to one exact normalized input-column name."""
    indexes_by_name: dict[str, list[int]] = {}
    for column_index, column_name in enumerate(column_names):
        indexes_by_name.setdefault(column_name, []).append(column_index)

    resolved_rules = []
    for rule in contract.rules:
        matching_indexes = indexes_by_name.get(rule.column, [])
        if not matching_indexes:
            raise ContractResolutionError(
                f"Contract column {rule.column!r} is not present in the input."
            )
        if len(matching_indexes) != 1:
            raise ContractResolutionError(
                f"Contract column {rule.column!r} matches more than one input column."
            )

        resolved_rules.append(
            ResolvedRule(
                rule=rule,
                column_index=matching_indexes[0],
                missing_markers=normalize_missing_markers(
                    missing_markers_by_column.get(rule.column, ())
                ),
            )
        )

    selected_column_indexes = tuple(
        sorted({rule.column_index for rule in resolved_rules})
    )
    return ResolvedContract(
        selected_column_indexes=selected_column_indexes,
        rules=tuple(resolved_rules),
    )


class ContractEvaluator:
    """Accumulate per-rule counts without retaining source-cell values."""

    def __init__(self, contract: ResolvedContract) -> None:
        self._contract = contract
        self._input_rows = 0
        self._counts = [_MutableRuleCounts() for _ in contract.rules]

    def add_row(self, values_by_column_index: Mapping[int, str | None]) -> None:
        """Add selected cell values keyed by their source-column index."""
        if set(values_by_column_index) != set(self._contract.selected_column_indexes):
            raise ValueError(
                "A selected row must provide each resolved source column once."
            )
        if any(
            value is not None and not isinstance(value, str)
            for value in values_by_column_index.values()
        ):
            raise TypeError("Selected cell values must be strings or None.")

        self._input_rows += 1
        for resolved_rule, counts in zip(
            self._contract.rules,
            self._counts,
        ):
            value = values_by_column_index[resolved_rule.column_index]
            if is_missing_value(value, resolved_rule.missing_markers):
                counts.missing_count += 1
                if isinstance(resolved_rule.rule, RequiredRule):
                    counts.failing_count += 1
                continue

            if _passes_rule(resolved_rule.rule, value):
                counts.passing_count += 1
            else:
                counts.failing_count += 1

    def summary(self) -> ContractSummary:
        return ContractSummary(
            input_rows=self._input_rows,
            rules=tuple(
                ContractRuleSummary(
                    rule_index=rule_index,
                    missing_count=counts.missing_count,
                    passing_count=counts.passing_count,
                    failing_count=counts.failing_count,
                )
                for rule_index, counts in enumerate(self._counts)
            ),
        )


def _parse_rule(raw_rule: object) -> ContractRule:
    if not isinstance(raw_rule, dict):
        raise ContractParseError("Every contract rule must be an object.")

    kind = raw_rule.get("kind")
    if not isinstance(kind, str):
        raise ContractParseError("Every contract rule must have a string kind.")

    if kind == "required":
        rule_data = _require_object_fields(
            raw_rule,
            {"column", "kind"},
            "required rule",
        )
        return RequiredRule(column=_require_string(rule_data["column"], "column"))

    if kind == "enum":
        rule_data = _require_object_fields(
            raw_rule,
            {"column", "kind", "values"},
            "enum rule",
        )
        column = _require_string(rule_data["column"], "column")
        raw_values = rule_data["values"]
        if not isinstance(raw_values, list) or not raw_values:
            raise ContractParseError("Enum rule values must be a non-empty array.")
        if any(not isinstance(value, str) for value in raw_values):
            raise ContractParseError("Every enum rule value must be a string.")
        values = tuple(raw_values)
        if len(set(values)) != len(values):
            raise ContractParseError("Enum rule values must be distinct.")
        if any(not value.strip() for value in values):
            raise ContractParseError(
                "Enum rule values cannot be empty or whitespace-only."
            )
        return EnumRule(column=column, values=values)

    if kind == "type":
        value_type = raw_rule.get("value_type")
        if not isinstance(value_type, str):
            raise ContractParseError("Type rules must have a string value_type.")
        if value_type == "integer":
            rule_data = _require_object_fields(
                raw_rule,
                {"column", "kind", "value_type"},
                "integer rule",
            )
            return IntegerRule(column=_require_string(rule_data["column"], "column"))
        if value_type == "number":
            rule_data = _require_object_fields(
                raw_rule,
                {"column", "kind", "value_type"},
                "number rule",
            )
            return NumberRule(column=_require_string(rule_data["column"], "column"))
        if value_type == "date":
            rule_data = _require_object_fields(
                raw_rule,
                {"column", "kind", "value_type", "date_format"},
                "date rule",
            )
            date_format = rule_data["date_format"]
            if not isinstance(date_format, str) or date_format not in (
                "YYYY-MM-DD",
                "YYYY-MM-DD HH:MM:SS",
            ):
                raise ContractParseError(
                    "The date rule format must be YYYY-MM-DD or "
                    "YYYY-MM-DD HH:MM:SS."
                )
            return DateRule(
                column=_require_string(rule_data["column"], "column"),
                date_format=date_format,
            )
        raise ContractParseError(f"Type {value_type!r} is not supported.")

    raise ContractParseError(f"Rule kind {kind!r} is not supported.")


def _require_object_fields(
    value: object,
    expected_fields: set[str],
    description: str,
) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ContractParseError(f"The {description} must be an object.")

    actual_fields = set(value)
    unknown_fields = actual_fields - expected_fields
    missing_fields = expected_fields - actual_fields
    if unknown_fields:
        unknown = ", ".join(sorted(unknown_fields))
        raise ContractParseError(f"The {description} has unknown field(s): {unknown}.")
    if missing_fields:
        missing = ", ".join(sorted(missing_fields))
        raise ContractParseError(f"The {description} is missing field(s): {missing}.")
    return value


def _require_string(value: object, field_name: str) -> str:
    if not isinstance(value, str):
        raise ContractParseError(f"The {field_name} field must be a string.")
    return value


def _reject_non_json_constant(value: str) -> NoReturn:
    raise ContractParseError(f"The JSON constant {value!r} is not supported.")


def _passes_rule(rule: ContractRule, value: str) -> bool:
    match rule:
        case RequiredRule():
            return True
        case EnumRule(values=values):
            return value in values
        case IntegerRule():
            return _INTEGER_PATTERN.fullmatch(value.strip()) is not None
        case NumberRule():
            return _is_finite_decimal(value)
        case DateRule(date_format="YYYY-MM-DD"):
            return _is_calendar_date(value)
        case DateRule(date_format="YYYY-MM-DD HH:MM:SS"):
            return _is_calendar_datetime(value)

    raise AssertionError(f"Unhandled contract rule: {rule!r}")


def _is_finite_decimal(value: str) -> bool:
    normalized_value = value.strip()
    if _NUMBER_PATTERN.fullmatch(normalized_value) is None:
        return False

    try:
        return Decimal(normalized_value).is_finite()
    except InvalidOperation:
        return False


def _is_calendar_date(value: str) -> bool:
    normalized_value = value.strip()
    if _DATE_PATTERN.fullmatch(normalized_value) is None:
        return False

    try:
        date.fromisoformat(normalized_value)
    except ValueError:
        return False
    return True


def _is_calendar_datetime(value: str) -> bool:
    normalized_value = value.strip()
    if _DATE_TIME_PATTERN.fullmatch(normalized_value) is None:
        return False

    try:
        datetime.fromisoformat(normalized_value)
    except ValueError:
        return False
    return True
