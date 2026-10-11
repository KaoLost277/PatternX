import pytest

from app.completeness import NormalizedMissingMarkers
from app.data_contracts import (
    ContractEvaluator,
    ContractParseError,
    ContractResolutionError,
    ContractRuleSummary,
    ContractSummary,
    ContractV1,
    DateRule,
    EnumRule,
    IntegerRule,
    NumberRule,
    RequiredRule,
    ResolvedContract,
    ResolvedRule,
    parse_contract_json,
    resolve_contract,
)


def test_parser_builds_ordered_version_one_rule_union() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":['
        '{"column":"Email","kind":"required"},'
        '{"column":"Status","kind":"enum","values":["Active","Inactive"]},'
        '{"column":"Age","kind":"type","value_type":"integer"},'
        '{"column":"Start Date","kind":"type","value_type":"date",'
        '"date_format":"YYYY-MM-DD"}]}'
    )

    assert contract == ContractV1(
        rules=(
            RequiredRule(column="Email"),
            EnumRule(column="Status", values=("Active", "Inactive")),
            IntegerRule(column="Age"),
            DateRule(column="Start Date", date_format="YYYY-MM-DD"),
        )
    )


@pytest.mark.parametrize(
    "raw_json",
    [
        '{"version":',
        '{"version":2,"rules":[{"column":"Email","kind":"required"}]}',
        '{"version":1.5,"rules":[{"column":"Email","kind":"required"}]}',
        '{"version":1,"rules":[{"column":"Email","kind":"required"}],'
        '"extra":true}',
        '{"version":1,"rules":[{"column":"Email","kind":"required",'
        '"extra":true}]}',
        '{"version":NaN,"rules":[]}',
    ],
)
def test_parser_rejects_malformed_unsupported_and_unexpected_json(
    raw_json: str,
) -> None:
    with pytest.raises(ContractParseError):
        parse_contract_json(raw_json)


def test_parser_rejects_boolean_version() -> None:
    with pytest.raises(ContractParseError):
        parse_contract_json(
            '{"version":true,"rules":[{"column":"Email","kind":"required"}]}'
        )


@pytest.mark.parametrize(
    "rules",
    [
        "[]",
        '[{"column":"Email","kind":"unknown"}]',
        '[{"column":"Age","kind":"type","value_type":"string"}]',
        '[{"column":"Age","kind":"type","value_type":"integer",'
        '"date_format":"YYYY-MM-DD"}]',
        '[{"column":"Start Date","kind":"type","value_type":"date",'
        '"date_format":"MM/DD/YYYY"}]',
        '[{"column":"Start Date","kind":"type","value_type":"date"}]',
        '[{"column":"Status","kind":"enum","values":[]}]',
        '[{"column":"Status","kind":"enum","values":["A","A"]}]',
        '[{"column":"Status","kind":"enum","values":[""]}]',
        '[{"column":"Status","kind":"enum","values":[" \t "]}]',
        '[{"column":"Status","kind":"enum","values":["A",2]}]',
        '[{"column":4,"kind":"required"}]',
        '[{"column":"Email","kind":"required","values":[]}]',
        '[null]',
    ],
)
def test_parser_rejects_invalid_rules_without_partial_acceptance(rules: str) -> None:
    with pytest.raises(ContractParseError):
        parse_contract_json(f'{{"version":1,"rules":{rules}}}')


def test_resolver_matches_exact_names_and_normalizes_configured_markers() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":['
        '{"column":"Age","kind":"type","value_type":"integer"},'
        '{"column":"Email","kind":"required"}]}'
    )

    resolved = resolve_contract(
        contract,
        ["Email", "Age"],
        {"Age": [" N/A ", "missing"]},
    )

    assert resolved == ResolvedContract(
        selected_column_indexes=(0, 1),
        rules=(
            ResolvedRule(
                rule=IntegerRule(column="Age"),
                column_index=1,
                missing_markers=NormalizedMissingMarkers(frozenset({"n/a", "missing"})),
            ),
            ResolvedRule(
                rule=RequiredRule(column="Email"),
                column_index=0,
                missing_markers=NormalizedMissingMarkers(frozenset()),
            ),
        )
    )


def test_resolver_rejects_unknown_case_mismatched_and_ambiguous_columns() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":[{"column":"Email","kind":"required"}]}'
    )

    with pytest.raises(ContractResolutionError):
        resolve_contract(contract, ["email"], {})
    with pytest.raises(ContractResolutionError):
        resolve_contract(contract, ["Email", "Email"], {})


def test_required_rule_counts_missing_rows_as_both_missing_and_failing() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":[{"column":"Email","kind":"required"}]}'
    )
    resolved = resolve_contract(contract, ["Email"], {"Email": ["N/A"]})
    evaluator = ContractEvaluator(resolved)
    for value in (None, "", " \t ", " N/A ", "0"):
        evaluator.add_row({0: value})

    assert evaluator.summary() == ContractSummary(
        input_rows=5,
        rules=(
            ContractRuleSummary(
                0,
                missing_count=4,
                passing_count=1,
                failing_count=4,
            ),
        ),
    )


def test_enum_uses_exact_non_missing_text() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":[{"column":"Status","kind":"enum",'
        '"values":["Active","Inactive"]}]}'
    )
    evaluator = ContractEvaluator(resolve_contract(contract, ["Status"], {}))
    for value in ("Active", "active", " Active ", "Other", "  "):
        evaluator.add_row({0: value})

    assert evaluator.summary() == ContractSummary(
        input_rows=5,
        rules=(
            ContractRuleSummary(
                0,
                missing_count=1,
                passing_count=1,
                failing_count=3,
            ),
        ),
    )


def test_missing_enum_and_type_values_do_not_count_as_passing_or_failing() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":['
        '{"column":"Email","kind":"required"},'
        '{"column":"Status","kind":"enum","values":["Active"]},'
        '{"column":"Age","kind":"type","value_type":"integer"}]}'
    )
    resolved = resolve_contract(
        contract,
        ["Email", "Status", "Age"],
        {"Email": ["n/a"], "Status": ["N/A"]},
    )
    evaluator = ContractEvaluator(resolved)
    for row in (
        {0: None, 1: None, 2: None},
        {0: "person", 1: "Active", 2: "12"},
        {0: "", 1: "active", 2: "2.0"},
        {0: " n/a ", 1: "N/A", 2: None},
    ):
        evaluator.add_row(row)

    assert evaluator.summary() == ContractSummary(
        input_rows=4,
        rules=(
            ContractRuleSummary(0, missing_count=3, passing_count=1, failing_count=3),
            ContractRuleSummary(1, missing_count=2, passing_count=1, failing_count=1),
            ContractRuleSummary(2, missing_count=2, passing_count=1, failing_count=1),
        ),
    )


def test_integer_requires_optional_ascii_sign_and_ascii_digits() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":[{"column":"Age","kind":"type",'
        '"value_type":"integer"}]}'
    )
    evaluator = ContractEvaluator(resolve_contract(contract, ["Age"], {}))
    for value in (
        "0",
        "+12",
        "-4",
        " 6 ",
        "1.0",
        "1e2",
        "1,000",
        "１２",
        "١",
        None,
    ):
        evaluator.add_row({0: value})

    assert evaluator.summary() == ContractSummary(
        input_rows=10,
        rules=(
            ContractRuleSummary(
                0,
                missing_count=1,
                passing_count=4,
                failing_count=5,
            ),
        ),
    )


def test_number_accepts_finite_ascii_decimal_syntax_only() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":[{"column":"Amount","kind":"type",'
        '"value_type":"number"}]}'
    )
    evaluator = ContractEvaluator(resolve_contract(contract, ["Amount"], {}))
    for value in (
        "0",
        "+12",
        "-4.25",
        " .5 ",
        "1.",
        "1e2",
        "1E-2",
        "-3.1e+4",
        "1,000",
        "1,5",
        "NaN",
        "Infinity",
        "-Infinity",
        "1_000",
        "１２",
        "1e",
    ):
        evaluator.add_row({0: value})

    assert evaluator.summary() == ContractSummary(
        input_rows=16,
        rules=(
            ContractRuleSummary(
                0,
                missing_count=0,
                passing_count=8,
                failing_count=8,
            ),
        ),
    )


def test_date_accepts_only_valid_calendar_dates_in_exact_format() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":[{"column":"Start Date","kind":"type",'
        '"value_type":"date","date_format":"YYYY-MM-DD"}]}'
    )
    evaluator = ContractEvaluator(resolve_contract(contract, ["Start Date"], {}))
    for value in (
        "2024-02-29",
        " 2023-12-31 ",
        "2023-02-29",
        "2024-2-09",
        "2024-02-09T00:00:00",
        "2024/02/09",
        "２０２４-02-09",
        "",
    ):
        evaluator.add_row({0: value})

    assert evaluator.summary() == ContractSummary(
        input_rows=8,
        rules=(
            ContractRuleSummary(
                0,
                missing_count=1,
                passing_count=2,
                failing_count=5,
            ),
        ),
    )


def test_datetime_format_matches_the_existing_xlsx_cell_text() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":[{"column":"Start Date","kind":"type",'
        '"value_type":"date","date_format":"YYYY-MM-DD HH:MM:SS"}]}'
    )
    evaluator = ContractEvaluator(resolve_contract(contract, ["Start Date"], {}))
    for value in (
        "2025-02-28 00:00:00",
        "2024-02-29 12:30:45",
        "2023-02-29 12:30:45",
        "2024-02-09T00:00:00",
        "2024-02-09 00:00:00.123",
        "2024-2-09 00:00:00",
    ):
        evaluator.add_row({0: value})

    assert evaluator.summary() == ContractSummary(
        input_rows=6,
        rules=(
            ContractRuleSummary(
                0,
                missing_count=0,
                passing_count=2,
                failing_count=4,
            ),
        ),
    )


def test_summary_preserves_rule_order_and_contains_no_source_values() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":['
        '{"column":"Code","kind":"enum","values":["OK"]},'
        '{"column":"Private","kind":"required"}]}'
    )
    evaluator = ContractEvaluator(
        resolve_contract(contract, ["Code", "Private"], {})
    )
    evaluator.add_row({0: "OK", 1: "secret-cell-value"})
    evaluator.add_row({0: "REJECTED", 1: "another-private-value"})

    summary = evaluator.summary()
    assert summary == ContractSummary(
        input_rows=2,
        rules=(
            ContractRuleSummary(0, missing_count=0, passing_count=1, failing_count=1),
            ContractRuleSummary(1, missing_count=0, passing_count=2, failing_count=0),
        ),
    )
    assert "secret-cell-value" not in repr(summary)
    assert "another-private-value" not in repr(summary)


def test_evaluator_rejects_row_shape_before_changing_aggregate_counts() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":[{"column":"Email","kind":"required"}]}'
    )
    evaluator = ContractEvaluator(resolve_contract(contract, ["Email"], {}))

    with pytest.raises(ValueError):
        evaluator.add_row({})
    with pytest.raises(ValueError):
        evaluator.add_row({0: "person", 1: "unexpected"})
    with pytest.raises(TypeError):
        evaluator.add_row({0: 1})

    assert evaluator.summary() == ContractSummary(input_rows=0, rules=(
        ContractRuleSummary(0, missing_count=0, passing_count=0, failing_count=0),
    ))


def test_evaluator_uses_source_indexes_when_contract_rules_are_reordered() -> None:
    contract = parse_contract_json(
        '{"version":1,"rules":['
        '{"column":"Age","kind":"type","value_type":"integer"},'
        '{"column":"Status","kind":"enum","values":["Active"]},'
        '{"column":"Email","kind":"required"}]}'
    )
    resolved = resolve_contract(
        contract,
        ["Email", "Status", "Age"],
        {},
    )
    evaluator = ContractEvaluator(resolved)
    evaluator.add_row({0: "", 1: "Active", 2: "not-an-integer"})
    evaluator.add_row({0: "person@example.com", 1: "Active", 2: "42"})

    assert evaluator.summary() == ContractSummary(
        input_rows=2,
        rules=(
            ContractRuleSummary(0, missing_count=0, passing_count=1, failing_count=1),
            ContractRuleSummary(1, missing_count=0, passing_count=2, failing_count=0),
            ContractRuleSummary(2, missing_count=1, passing_count=1, failing_count=1),
        ),
    )
