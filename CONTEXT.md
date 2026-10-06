# Data Completeness Profiling

This project identifies recurring completeness patterns in tabular data by evaluating whether selected fields contain values for each input row.

## Language

**Input Row**:
One row parsed from an imported dataset. Each input row is counted separately, including rows whose identifier values repeat.
_Avoid_: Entity, when referring to the unit being counted

**Identifier Column**:
An optional column used to identify or display an input row. Its values do not change row counts or combine rows.
_Avoid_: Entity Key

**Completeness Pattern**:
The combination of present and missing statuses across selected columns for one input row. Input rows with the same pattern can be reported together.

**Completeness Summary**:
A descriptive report that groups input rows by completeness pattern and shows each group's count and share. It does not label a pattern as anomalous.

**Column Completeness Summary**:
A per-column count and share of input rows with a present value. Users can use it to choose a subset of columns for a cross-column completeness summary.

**Missing Value**:
A null, empty, or whitespace-only field value by default. Additional markers can be configured per column and are matched after trimming surrounding whitespace without case sensitivity. Zero is a value unless explicitly configured otherwise.
