export type RowColumnMode = "all" | "analysis";

export interface VisibleRowsProjection {
  columns: string[];
  rows: (string | null)[][];
}

export function projectVisibleRows(
  sourceColumns: string[],
  sourceRows: (string | null)[][],
  analysisColumns: string[],
  mode: RowColumnMode,
): VisibleRowsProjection {
  const allIndexes = sourceColumns.map((_, index) => index);
  let visibleIndexes = allIndexes;
  if (mode === "analysis") {
    const analysisColumnSet = new Set(analysisColumns);
    const analysisIndexes = sourceColumns.flatMap((columnName, index) =>
      analysisColumnSet.has(columnName) ? [index] : [],
    );
    if (analysisIndexes.length > 0) {
      visibleIndexes = analysisIndexes;
    }
  }

  // Keep the table interpretable if analysis metadata would hide every column.
  return {
    columns: visibleIndexes.map((index) => sourceColumns[index]),
    rows: sourceRows.map((row) =>
      visibleIndexes.map((index) => row[index] ?? null),
    ),
  };
}
