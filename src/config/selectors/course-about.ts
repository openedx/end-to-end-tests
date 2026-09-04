/**
 * Course About page (`${APPS}/catalog/courses/{courseKey}/about`).
 *
 * Note what is *not* here: there is no anchor for the sheet's "You are enrolled
 * in this course" disabled button, because on this platform version the enrolled
 * state does not render a disabled button at all — the call to action becomes a
 * link into the courseware ({@link courseAboutCoursewareLink}). Asserting on the
 * link's presence is both non-localized and closer to what the learner can
 * actually do next.
 */
export const COURSE_ABOUT_SELECTORS = {
  /**
   * The enroll call to action — the sheet's "Enroll Now" button. The MFE gives it
   * no test ID and posts through the enrollment API rather than a form, so the
   * best available anchor is Paragon's stateful-button class scoped to the page's
   * main landmark (the only other button is the header account menu). Weak by our
   * standards; an upstream test-ID request is filed as plan §4 item 5.
   */
  enrollButton: 'main button.pgn__stateful-btn',

  /** Label/value pairs in the details sidebar. Positional only — see plan §4.4. */
  detailsItemLabel: '[data-testid="sidebar-details-item-label"]',
  detailsItemValue: '[data-testid="sidebar-details-item-value"]',
} as const;

/**
 * The courseware link the page renders once the learner is enrolled — the
 * enrolled-state signal, replacing the sheet's "You are enrolled in this course"
 * copy. Corroborate with the enrollment API, which is authoritative.
 */
export function courseAboutCoursewareLink(courseKey: string): string {
  return `main a[href*="/learning/course/${courseKey}"]`;
}
