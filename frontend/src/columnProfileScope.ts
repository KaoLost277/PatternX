declare const columnProfileScopeKeyBrand: unique symbol;

export type ColumnProfileScopeKey = string & {
  readonly [columnProfileScopeKeyBrand]: true;
};

export function columnProfileScopeKey(
  datasetVersion: number,
  missingValueMarkers: Record<string, string[]>,
): ColumnProfileScopeKey {
  return JSON.stringify([datasetVersion, missingValueMarkers]) as ColumnProfileScopeKey;
}
