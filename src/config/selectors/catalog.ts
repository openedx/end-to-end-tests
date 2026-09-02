/**
 * Course catalog (`frontend-app-catalog`, served at `${APPS}/catalog/courses`;
 * the LMS `/courses` route redirects there).
 *
 * Each anchor names the localized string it stands in for, per
 * `src/config/selectors/README.md`.
 */
/**
 * The arrow pagination control in the results footer. Split out because both
 * arrows are scoped to it — see `nextPageButton` for why the variant matters.
 */
const PAGINATION_ARROWS = '[data-testid="table-footer"] nav.pagination-minimal ul.pagination';

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

  /**
   * The status bar above the result grid — the sheet's "Showing 1 - 20 of N"
   * line. Rendered whether or not search is enabled, which is what makes it the
   * anchor a catalog page load waits on: the search field is not.
   */
  resultsStatusBar: '[data-testid="table-control-bar"]',

  /** The footer below the result grid, carrying the pagination control. */
  resultsFooter: '[data-testid="table-footer"]',

  /**
   * Next / previous page — the sheet's ">" and "<" arrows.
   *
   * The footer holds **two** pagination controls once there is more than one
   * page: a `reduced` one (a "1 of 3" page dropdown, which Paragon drops
   * entirely on a single-page table) and a `minimal` one (the arrows). Only the
   * `minimal` one pages forward, so the variant class — structural, and not
   * something the platform translates — is what scopes these; an unscoped
   * `ul.pagination` matches both and the dropdown's toggle would be taken for
   * the next-page button.
   *
   * Within that control the arrows are anchored by position, because nothing on
   * the buttons themselves distinguishes them: the `aria-label`s ("Next",
   * "Previous") are localized, and Paragon gives *both* buttons the same
   * `previous` class. The list is always `[previous, next]`.
   */
  nextPageButton: PAGINATION_ARROWS + ' > li:last-child button',
  previousPageButton: PAGINATION_ARROWS + ' > li:first-child button',
} as const;

/**
 * Endpoint the catalog POSTs to for every result set it renders — the initial
 * list, a search, and each page of the list alike. Waiting on this response is
 * how the page object sequences both: the query lands in the URL *before* the
 * result list re-renders, so a URL wait alone reads the previous render's cards,
 * and paging does not touch the URL at all (the page index is component state),
 * so the response is the only signal there is.
 */
export const CATALOG_SEARCH_PATH = '/search/unstable/v0/course_list_search/';

/** The result card for one specific course, anchored by its key. */
export function catalogCourseCard(courseKey: string): string {
  return `${CATALOG_SELECTORS.courseCard}[href*="${courseKey}"]`;
}
