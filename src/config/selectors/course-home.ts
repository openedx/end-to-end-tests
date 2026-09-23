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

  /**
   * First-visit tour modal. Its `aria-label` ("New user course home prompt") is
   * localized, so the dialog is anchored by its own class instead. Its backdrop
   * swallows clicks aimed at the page beneath, which is why it has to be dismissed
   * before anything else on course home can be driven.
   */
  tourDialog: '.new-user-tour-dialog',
  modalBackdrop: '[data-testid="modal-backdrop"]',

  /** The tour dialog's "Begin tour" (brand) button; "Skip for now" is tertiary. */
  tourBegin: '.new-user-tour-dialog button.btn-brand',

  /**
   * One step of the product tour — a Paragon checkpoint, "1 of 3" and so on.
   * Its title and body are localized.
   */
  tourCheckpoint: '#pgn__checkpoint[role="dialog"]',

  /** The checkpoint's advance button — "Next", and "Okay" on the last step. */
  tourAdvance: '#pgn__checkpoint .pgn__checkpoint-button_advance',

  /** "Launch tour" in the course-home sidebar. */
  tourLaunch: '#courseHome-launchTourLink button',

  /**
   * The link inside the Begin/Resume card — "Start Course" / "Resume Course" —
   * pointing at the block the learner resumes at.
   */
  resumeLink: '[data-testid="start-resume-card"] a',

  /**
   * The course's tabs — "Course", "Progress", "Dates", "Discussion", "Wiki" —
   * read by the URL each tab links to.
   */
  courseTab: '#courseTabsNavigation a.nav-link[href]',
} as const;

/**
 * The course-home fragment frame (handouts, welcome message) whose HTML holds
 * `text` — the course home renders author HTML in `srcdoc` iframes, so the
 * test's own content in that HTML is what picks the frame out.
 */
export function courseHomeFragmentHolding(text: string): string {
  return `iframe[srcdoc*="${text}"]`;
}

/**
 * The effort estimate beside one subsection in the outline ("5 min + 2
 * activities"), anchored by the subsection's own link.
 */
export function subsectionEffort(sequenceId: string): string {
  return `.row:has(a[href$="/${sequenceId}"]) .text-monospace`;
}

/**
 * A course-home tool link ("Bookmarks", "Updates") — anchored by the URL the
 * outline API gives the tool, never by its title.
 */
export function courseToolLink(url: string): string {
  return `a[href="${url}"]`;
}
