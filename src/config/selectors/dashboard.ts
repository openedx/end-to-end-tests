/**
 * Learner dashboard (`frontend-app-learner-dashboard`, served at
 * `${APPS}/learner-dashboard/`; the LMS `/dashboard` route redirects there).
 */
export const DASHBOARD_SELECTORS = {
  /** The dashboard's main content region. */
  content: '[data-testid="dashboard-content"]',

  /** One enrolled-course card. */
  courseCard: '[data-testid="CourseCard"]',

  /** The card's course-name link — the sheet's "course name is a link". */
  courseCardTitle: '[data-testid="CourseCardTitle"]',

  /** Status banners on a card (enrollment, audit access, and similar). */
  courseCardBanners: '[data-testid="CourseCardBanners"]',

  /** Run dates and enrollment detail on a card. */
  courseCardDetails: '[data-testid="CourseCardDetails"]',

  /**
   * The card's primary call to action — the sheet's "Begin Course" / "Resume
   * Course" / "View Course" button, which are one affordance in three states.
   *
   * Anchored on the Paragon primary-button class scoped to the card, because the
   * MFE gives it no test ID and renders it as `<a href="#" role="button">` with
   * the navigation done in JavaScript, so there is no href to key on either.
   * Weak by our standards; an upstream test-ID request is warranted.
   *
   * Relative to a card, so it must be scoped to one — see
   * {@link dashboardCourseCardCta} for the standalone form.
   */
  courseCardCta: 'a.btn-primary[role="button"]',
} as const;

/** The card call to action, scoped to the cards region rather than to one card. */
export function dashboardCourseCardCta(): string {
  return `${DASHBOARD_SELECTORS.courseCard} ${DASHBOARD_SELECTORS.courseCardCta}`;
}
