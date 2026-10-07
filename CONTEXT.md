# Data Completeness Profiling

This project profiles tabular data through three separate views: completeness patterns, formal terms in selected columns, and groups of input rows that share selected values.

## Language

**Input Row**:
One row parsed from an imported dataset. Each input row is counted separately, including rows whose identifier values repeat.
_Avoid_: Entity, when referring to the unit being counted

**Identifier Column**:
An optional column used to identify or display an input row. Its values do not change row counts or combine rows.
_Avoid_: Entity Key

**Completeness Pattern**:
The combination of present and missing statuses across selected columns for one input row. Input rows with the same pattern can be reported together.

**Formal Term**:
One distinct raw value in a selected column. Repeated occurrences contribute to the term's count; non-missing values remain distinct when their text differs, including by letter case or surrounding whitespace.

**Structural Format Pattern**:
A repeated form shared by distinct Formal Terms in one column. Literal text, separators, and the widths of digit runs distinguish one format from another. Ordinary word values are not treated as structural formats.

**Formal Terms Summary**:
A per-column report of distinct Formal Terms and their counts, plus repeated Structural Format Patterns and their occurrence and distinct-term counts.

**Group Data Key**:
The ordered combination of values from the selected columns for one Input Row. Missing Values use one shared missing key; other values are compared as their original text.

**Group Data Summary**:
A report that groups Input Rows with the same Group Data Key, showing exact counts and shares. It includes only value combinations observed in the input data.

**Completeness Summary**:
A descriptive report that groups input rows by completeness pattern and shows each group's count and share. It does not label a pattern as anomalous.

**Column Completeness Summary**:
A per-column count and share of input rows with a present value. Users can use it to choose a subset of columns for a cross-column completeness summary.

**Missing Value**:
A null, empty, or whitespace-only field value by default. Additional markers can be configured per column and are matched after trimming surrounding whitespace without case sensitivity. Zero is a value unless explicitly configured otherwise.
