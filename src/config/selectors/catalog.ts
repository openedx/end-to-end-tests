/**
 * Course catalog (`frontend-app-catalog`, served at `${APPS}/catalog/courses`;
 * the LMS `/courses` route redirects there).
 *
 * Each anchor names the localized string it stands in for, per
 * `src/config/selectors/README.md`.
 */
export const CATALOG_SELECTORS = {
  /** A single course result. Its `href` carries the course key and `/about`. */
  courseCard: '[data-testid="course-card"]',

  /**
   * The search input. `role="searchbox"` and the `name` are both stable; the
   * "Search for a course" placeholder is localized and must not be matched.
   */
  searchInput: 'input[name="searchfield-input"]',

  /** The search landmark wrapping the input and its reset control. */
  searchForm: 'form[role="search"]',

  /**
   * Clears the search. Stands in for the sheet's "clear the search icon"; its
   * `aria-label` ("clear search") is localized, `type="reset"` is not.
   */
  clearSearchButton: 'form[role="search"] button[type="reset"]',

  /**
   * Header link to the catalog — the sheet's "Discover New" link. Anchored by
   * the LMS-hosted href the MFE header renders, not by the label.
   */
  navCatalogLink: 'a.nav-link[href$="/courses"]',

  /** Header link to the learner dashboard — the sheet's "Courses" link. */
  navDashboardLink: 'a.nav-link[href$="/dashboard"]',
} as const;

/**
 * Endpoint the catalog POSTs to when a search runs. Waiting on this response is
 * how the page object sequences a search: the query lands in the URL *before* the
 * result list re-renders, so a URL wait alone reads the previous render's cards.
 */
export const CATALOG_SEARCH_PATH = '/search/unstable/v0/course_list_search/';

/** The result card for one specific course, anchored by its key. */
export function catalogCourseCard(courseKey: string): string {
  return `${CATALOG_SELECTORS.courseCard}[href*="${courseKey}"]`;
}
