import pytest
from app.transformations import (
    TransformRule,
    apply_transformations_to_rows,
    transform_cell,
    TRANSFORM_DATE_TRUNCATE,
    TRANSFORM_DELIMITER_SPLIT,
    TRANSFORM_SUBSTRING,
    TRANSFORM_REGEX,
    TARGET_MODE_NEW_COLUMN,
    TARGET_MODE_OVERWRITE,
)


def test_date_truncate_with_colon():
    rule = TransformRule(
        id="r1",
        source_column="date_col",
        target_mode=TARGET_MODE_NEW_COLUMN,
        target_column="date_only",
        transform_type=TRANSFORM_DATE_TRUNCATE,
        config={"part": "date_only", "delimiter": ":"},
    )
    val, matched = transform_cell("13/06/26:23:30:32", rule)
    assert matched is True
    assert val == "13/06/26"


def test_date_truncate_smart_detection():
    rule = TransformRule(
        id="r1",
        source_column="timestamp",
        target_mode=TARGET_MODE_NEW_COLUMN,
        target_column="date",
        transform_type=TRANSFORM_DATE_TRUNCATE,
        config={"part": "date_only"},
    )
    val1, m1 = transform_cell("2026-06-13 23:30:32", rule)
    assert m1 is True
    assert val1 == "2026-06-13"

    val2, m2 = transform_cell("13/06/2026:10:15:00", rule)
    assert m2 is True
    assert val2 == "13/06/2026"


def test_delimiter_split_after_underscore():
    rule = TransformRule(
        id="r2",
        source_column="code",
        target_mode=TARGET_MODE_NEW_COLUMN,
        target_column="id_part",
        transform_type=TRANSFORM_DELIMITER_SPLIT,
        config={"delimiter": "_", "position": "after"},
    )
    val, matched = transform_cell("ADWD_1", rule)
    assert matched is True
    assert val == "1"


def test_delimiter_split_after_last():
    rule = TransformRule(
        id="r3",
        source_column="sku",
        target_mode=TARGET_MODE_NEW_COLUMN,
        target_column="suffix",
        transform_type=TRANSFORM_DELIMITER_SPLIT,
        config={"delimiter": "_", "position": "after_last"},
    )
    val, matched = transform_cell("INV_2026_BKK_999", rule)
    assert matched is True
    assert val == "999"


def test_delimiter_split_part_index():
    rule = TransformRule(
        id="r4",
        source_column="sku",
        target_mode=TARGET_MODE_NEW_COLUMN,
        target_column="city",
        transform_type=TRANSFORM_DELIMITER_SPLIT,
        config={"delimiter": "_", "position": "part_index", "part_index": 3},
    )
    val, matched = transform_cell("INV_2026_BKK_999", rule)
    assert matched is True
    assert val == "BKK"


def test_regex_extract():
    rule = TransformRule(
        id="r5",
        source_column="ref",
        target_mode=TARGET_MODE_NEW_COLUMN,
        target_column="num",
        transform_type=TRANSFORM_REGEX,
        config={"pattern": r"_(\d+)$", "group": 1},
    )
    val, matched = transform_cell("ITEM_CODE_4567", rule)
    assert matched is True
    assert val == "4567"


def test_unmatched_value_falls_back_safely():
    rule = TransformRule(
        id="r6",
        source_column="code",
        target_mode=TARGET_MODE_NEW_COLUMN,
        target_column="id_part",
        transform_type=TRANSFORM_DELIMITER_SPLIT,
        config={"delimiter": "_", "position": "after"},
    )
    val, matched = transform_cell("NO_DELIMITER_MATCH", rule)
    assert matched is True
    assert val == "DELIMITER_MATCH"

    val2, matched2 = transform_cell("PLAINSTRING", rule)
    assert matched2 is False
    assert val2 == "PLAINSTRING"


def test_apply_transformations_to_rows_new_column_and_overwrite():
    columns = ["id", "created_at", "code"]
    rows = [
        ["1", "13/06/26:23:30:32", "ADWD_101"],
        ["2", "14/06/26:10:00:00", "ADWD_102"],
        ["3", "not_a_date", "PLAIN"],
    ]

    rules = [
        TransformRule(
            id="rule_date",
            source_column="created_at",
            target_mode=TARGET_MODE_NEW_COLUMN,
            target_column="date_only",
            transform_type=TRANSFORM_DATE_TRUNCATE,
            config={"part": "date_only", "delimiter": ":"},
        ),
        TransformRule(
            id="rule_code",
            source_column="code",
            target_mode=TARGET_MODE_OVERWRITE,
            target_column="code",
            transform_type=TRANSFORM_DELIMITER_SPLIT,
            config={"delimiter": "_", "position": "after"},
        ),
    ]

    new_cols, trans_rows, stats = apply_transformations_to_rows(columns, rows, rules)

    assert new_cols == ["id", "created_at", "code", "date_only"]
    # Row 1
    assert trans_rows[0][1] == "13/06/26:23:30:32"  # created_at kept because date_only was new_column
    assert trans_rows[0][2] == "101"                 # code overwritten
    assert trans_rows[0][3] == "13/06/26"            # date_only added
    # Row 3 (unmatched fallbacks)
    assert trans_rows[2][2] == "PLAIN"               # fallback
    assert trans_rows[2][3] == "not_a_date"          # fallback

    assert stats["rule_date"].matched_count == 2
    assert stats["rule_date"].unmatched_count == 1
    assert stats["rule_code"].matched_count == 2
    assert stats["rule_code"].unmatched_count == 1


def test_api_transformations_preview_and_apply(tmp_path):
    import json
    from fastapi.testclient import TestClient
    from app.main import create_application

    app = create_application(tmp_path)
    client = TestClient(app)

    csv_data = b"order_id,raw_date,item_code\n1,13/06/26:23:30:32,ADWD_1\n2,14/06/26:10:00:00,ADWD_2\n"

    rules = [
        {
            "id": "r_date",
            "source_column": "raw_date",
            "target_mode": "new_column",
            "target_column": "date_only",
            "transform_type": "date_truncate",
            "config": {"part": "date_only", "delimiter": ":"},
        },
        {
            "id": "r_code",
            "source_column": "item_code",
            "target_mode": "overwrite",
            "target_column": "item_code",
            "transform_type": "delimiter_split",
            "config": {"delimiter": "_", "position": "after"},
        },
    ]

    # Test Preview
    preview_res = client.post(
        "/api/transformations/preview",
        files={"file": ("test.csv", csv_data, "text/csv")},
        data={"rules": json.dumps(rules)},
    )
    assert preview_res.status_code == 200
    preview_data = preview_res.json()
    assert preview_data["original_columns"] == ["order_id", "raw_date", "item_code"]
    assert preview_data["transformed_columns"] == ["order_id", "raw_date", "item_code", "date_only"]
    assert len(preview_data["preview_rows"]) == 2
    assert preview_data["preview_rows"][0]["transformed"]["date_only"] == "13/06/26"
    assert preview_data["preview_rows"][0]["transformed"]["item_code"] == "1"

    # Test Apply
    apply_res = client.post(
        "/api/transformations/apply",
        files={"file": ("test.csv", csv_data, "text/csv")},
        data={"rules": json.dumps(rules)},
    )
    assert apply_res.status_code == 200
    transformed_text = apply_res.content.decode("utf-8-sig")
    lines = [line.strip() for line in transformed_text.strip().splitlines()]
    assert lines[0] == "order_id,raw_date,item_code,date_only"
    assert lines[1] == "1,13/06/26:23:30:32,1,13/06/26"
    assert lines[2] == "2,14/06/26:10:00:00,2,14/06/26"

