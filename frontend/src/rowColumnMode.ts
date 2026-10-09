export type RowColumnMode = "all" | "analysis";

export function visibleColumnIndexes(
  sourceColumns: string[],
  analysisColumns: string[],
  mode: RowColumnMode,
): number[] {
  const allIndexes = sourceColumns.map((_, index) => index);
  if (mode === "all") {
    return allIndexes;
  }

  const analysisColumnSet = new Set(analysisColumns);
  const analysisIndexes = sourceColumns.flatMap((columnName, index) =>
    analysisColumnSet.has(columnName) ? [index] : [],
  );

  // Keep the table interpretable if analysis metadata would hide every column.
  return analysisIndexes.length > 0 ? analysisIndexes : allIndexes;
}
