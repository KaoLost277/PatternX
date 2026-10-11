import type { ColumnProfileScopeKey } from "./columnProfileScope";

export interface ProfileColumnSelection {
  readonly scope: ColumnProfileScopeKey;
  readonly columnName: string;
}

export type ProfileColumnSelectionOutcome =
  | "selected"
  | "stale_scope"
  | "column_unavailable";

export interface FormalTermsSelectionHandle {
  selectProfileColumn(command: ProfileColumnSelection): ProfileColumnSelectionOutcome;
}

export function profileColumnSelectionOutcome(
  currentScope: ColumnProfileScopeKey,
  columnNames: readonly string[],
  command: ProfileColumnSelection,
): ProfileColumnSelectionOutcome {
  if (command.scope !== currentScope) {
    return "stale_scope";
  }

  if (!columnNames.includes(command.columnName)) {
    return "column_unavailable";
  }

  return "selected";
}
