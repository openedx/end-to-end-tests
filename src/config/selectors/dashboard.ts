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
   * The markup differs by release, so this matches both shapes:
   *
   * - up to and including **verawood**: `<a href="#" role="button"
   *   class="btn btn-primary">`, navigating from JavaScript;
   * - on **main**: `<a class="btn btn-primary"
   *   href=".../learning/course/{key}/home">` — a real link, no `role`.
   *
   * Keying on either shape alone breaks the other, which is what happened in
   * both directions. Both branches are structural and neither reads platform
   * copy, so a union is the whole fix — no capability is warranted, since every
   * supported release has this affordance.
   *
   * Written with `:is()` rather than a comma so it stays one compound selector:
   * {@link dashboardCourseCardCta} concatenates it after a card selector, and a
   * comma list would silently drop that scoping from the second branch.
   *
   * Still no test ID on it, so an upstream request remains warranted.
   *
   * Relative to a card, so it must be scoped to one — see
   * {@link dashboardCourseCardCta} for the standalone form.
   */
  courseCardCta: 'a.btn-primary:is([role="button"], [href*="/course/"])',
} as const;

/** The card call to action, scoped to the cards region rather than to one card. */
export function dashboardCourseCardCta(): string {
  return `${DASHBOARD_SELECTORS.courseCard} ${DASHBOARD_SELECTORS.courseCardCta}`;
}
