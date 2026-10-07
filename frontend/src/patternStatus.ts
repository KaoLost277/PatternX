export const PATTERN_STATUS_PRESENT = "present" as const;
export const PATTERN_STATUS_MISSING = "missing" as const;

export type PatternStatus =
  | typeof PATTERN_STATUS_PRESENT
  | typeof PATTERN_STATUS_MISSING;

interface PatternStatusPresentation {
  className: string;
  label: string;
}

const PATTERN_STATUS_PRESENTATION_BY_STATUS: Record<PatternStatus, PatternStatusPresentation> = {
  [PATTERN_STATUS_PRESENT]: {
    className: "pattern-status pattern-status-present",
    label: "Present",
  },
  [PATTERN_STATUS_MISSING]: {
    className: "pattern-status pattern-status-missing",
    label: "Missing",
  },
};

export function patternStatusPresentation(status: PatternStatus): PatternStatusPresentation {
  return PATTERN_STATUS_PRESENTATION_BY_STATUS[status];
}
