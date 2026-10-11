from app.completeness import is_missing_value, normalize_missing_markers


def test_missing_value_matches_existing_null_whitespace_and_marker_rules() -> None:
    markers = normalize_missing_markers([" N/A "])

    assert is_missing_value(None, markers) is True
    assert is_missing_value("", markers) is True
    assert is_missing_value(" \t ", markers) is True
    assert is_missing_value(" n/a ", markers) is True
    assert is_missing_value("0", markers) is False
    assert is_missing_value("N/Ax", markers) is False
