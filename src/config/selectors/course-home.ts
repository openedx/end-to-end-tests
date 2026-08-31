/**
 * Course home (the learning MFE's course outline tab).
 */
export const COURSE_HOME_SELECTORS = {
  /** One collapsible section in the outline. `aria-expanded` carries its state. */
  sectionTrigger: '.collapsible-trigger[aria-expanded]',

  /** Sections currently expanded — the state the expand/collapse control changes. */
  expandedSectionTrigger: '.collapsible-trigger[aria-expanded="true"]',

  /**
   * The one control that expands or collapses every section — the sheet's "Expand
   * all" / "Collapse all", which is a single button whose label alternates. It is
   * anchored on Paragon's block-button class scoped to the main landmark (the only
   * such button on the page) because the MFE gives it no test ID; the assertion is
   * on the resulting `aria-expanded` counts, never on the label.
   */
  expandAllToggle: 'main button.btn-block',

  /** Begin/Resume card — one affordance whose label changes with progress. */
  startResumeCard: '[data-testid="start-resume-card"]',

  /** Welcome message alert. */
  welcomeAlert: '[data-testid="alert-container-welcome"]',

  /**
   * First-visit tour modal. Its `aria-label` ("New user course home prompt") is
   * localized, so the dialog is anchored by its own class instead. Its backdrop
   * swallows clicks aimed at the page beneath, which is why it has to be dismissed
   * before anything else on course home can be driven.
   */
  tourDialog: '.new-user-tour-dialog',
  modalBackdrop: '[data-testid="modal-backdrop"]',
} as const;
