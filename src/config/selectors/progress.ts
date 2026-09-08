/**
 * Course Progress tab (`frontend-app-learning`).
 *
 * Grade *state* is asserted from `/api/course_home/progress/{key}` — numeric and
 * non-localized. These anchors exist to prove the page rendered that state, not to
 * decide whether it is right.
 */
export const PROGRESS_SELECTORS = {
  /** Weighted course total in the grade-summary footer, e.g. `0%`. */
  totalGrade: '[data-testid="gradeSummaryFooterTotalWeightedGrade"]',

  /** Grade tables (assignment-type summary and per-subsection scores). */
  tableFooter: '[data-testid="table-footer"]',
  table: 'table[role="table"]',
  tableRow: 'tbody tr[role="row"]',
} as const;

/** Course tab link to the Progress page, anchored by href rather than label. */
export function progressTabLink(courseKey: string): string {
  return `a[href*="/course/${courseKey}/progress"]`;
}
