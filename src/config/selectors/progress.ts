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

  /**
   * The certificate block — "Request certificate", "View my certificate", "Your
   * certificate is being generated" and so on. Its inner element's id names the
   * state (`requestable_certificate_status`, `downloadable_certificate_status`,
   * …), which is data, not copy.
   */
  certificateStatus: 'section[data-testid="certificate-status-component"]',
  certificateStatusCase:
    'section[data-testid="certificate-status-component"] [id$="_certificate_status"]',
  certificateAction: 'section[data-testid="certificate-status-component"] :is(button, a).btn',
} as const;

/** Course tab link to the Progress page, anchored by href rather than label. */
export function progressTabLink(courseKey: string): string {
  return `a[href*="/course/${courseKey}/progress"]`;
}
