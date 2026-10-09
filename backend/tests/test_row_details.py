from app.row_details import source_column_projection


def test_analysis_projection_keeps_source_order_for_names_and_sql_columns():
    projection = source_column_projection(
        ["record_id", "email", "phone", "notes"],
        ("phone", "email"),
        "analysis",
    )

    assert projection.names == ("email", "phone")
    assert projection.sqlite_columns == ('"input_column_1"', '"input_column_2"')


def test_all_columns_projection_includes_every_source_column():
    projection = source_column_projection(
        ["record_id", "email", "notes"],
        ("email",),
        "all",
    )

    assert projection.names == ("record_id", "email", "notes")
    assert projection.sqlite_columns == (
        '"input_column_0"',
        '"input_column_1"',
        '"input_column_2"',
    )


def test_analysis_projection_falls_back_to_all_columns_when_nothing_matches():
    projection = source_column_projection(
        ["record_id", "email"],
        ("stale_column",),
        "analysis",
    )

    assert projection.names == ("record_id", "email")
    assert projection.sqlite_columns == ('"input_column_0"', '"input_column_1"')
