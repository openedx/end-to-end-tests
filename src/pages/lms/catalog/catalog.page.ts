import type { Locator, Page } from '@playwright/test';

import {
  CATALOG_SEARCH_PATH,
  CATALOG_SELECTORS,
  catalogCourseCard,
  type AppConfig,
} from '../../../config';

/**
 * The course catalog (`frontend-app-catalog`). Locators and single-surface
 * actions only — specs own the assertions.
 *
 * The catalog is reached at `${APPS}/catalog/courses`; the LMS `/courses` route
 * redirects there, which is also where the header's catalog link points, so
 * {@link gotoViaNavLink} exercises the same journey a learner takes.
 */
export class CatalogPage {
  readonly courseCards: Locator;
  readonly searchInput: Locator;
  readonly clearSearchButton: Locator;
  readonly navCatalogLink: Locator;
  readonly navDashboardLink: Locator;
  /**
   * The region the MFE renders when a search matches nothing. Its copy is
   * localized, so specs assert on its presence together with a zero card count,
   * never on what it says.
   */
  readonly noResultsAlert: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.courseCards = page.locator(CATALOG_SELECTORS.courseCard);
    this.searchInput = page.locator(CATALOG_SELECTORS.searchInput);
    this.clearSearchButton = page.locator(CATALOG_SELECTORS.clearSearchButton);
    this.navCatalogLink = page.locator(CATALOG_SELECTORS.navCatalogLink);
    this.navDashboardLink = page.locator(CATALOG_SELECTORS.navDashboardLink);
    this.noResultsAlert = page.getByRole('alert');
  }

  /** The catalog's own URL. */
  get url(): string {
    return `${this.config.baseUrls.apps}/catalog/courses`;
  }

  /** Navigates straight to the catalog. */
  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.searchInput.waitFor();
  }

  /**
   * Opens the catalog on a search already applied, as a shared or bookmarked
   * result link does. Renders the results from the query rather than through the
   * in-page transition {@link search} exercises.
   *
   * Deliberately does not wait for the search field: when the query matches
   * nothing, the MFE renders an empty state that drops the field altogether, so
   * waiting for it would hang on exactly the case this method exists to reach.
   * Callers wait on whatever they assert.
   */
  async gotoWithSearch(term: string): Promise<void> {
    await this.page.goto(`${this.url}?search_query=${encodeURIComponent(term)}`);
  }

  /**
   * Reaches the catalog the way a learner does: from the header's catalog link on
   * whatever page is currently open. The link is LMS-hosted and redirects, so we
   * wait for the catalog's own search input rather than for a URL.
   */
  async gotoViaNavLink(): Promise<void> {
    await this.navCatalogLink.click();
    await this.searchInput.waitFor();
  }

  /**
   * Runs a catalog search and waits for the results to be rendered.
   *
   * Sequencing matters here: the query string lands in the URL *before* the
   * search request returns, so a URL wait alone leaves `courseCards` reading the
   * previous render. We wait on the search response instead — the state the list
   * is derived from — which is the web-first alternative to a sleep.
   */
  async search(term: string): Promise<void> {
    const searchResponse = this.page.waitForResponse(
      (response) =>
        response.url().startsWith(`${this.config.baseUrls.lms}${CATALOG_SEARCH_PATH}`) &&
        response.request().method() === 'POST',
    );
    await this.searchInput.fill(term);
    await this.searchInput.press('Enter');
    await searchResponse;
    await this.page.waitForURL((url) => url.searchParams.get('search_query') === term);
  }

  /**
   * Clears the search through its reset control, activated from the keyboard.
   *
   * The control is activated with the keyboard rather than the mouse because the
   * MFE's search field paints its own wrapper above the reset button: a pointer
   * click lands on the wrapper, not the button (`elementFromPoint` at the
   * button's centre returns `div.pgn__searchfield`), so clearing by mouse takes
   * two clicks — one to move focus, one to activate. Keyboard activation reaches
   * the control in one go and is a real user path; clicking would need `force`,
   * which would hide the defect rather than work around it.
   *
   * @see https://github.com/openedx/frontend-app-catalog/issues/160
   */
  async clearSearch(): Promise<void> {
    await this.clearSearchButton.focus();
    await this.page.keyboard.press('Enter');
  }

  /**
   * Clears the search with a single pointer click — the affordance as a mouse user
   * meets it. Separate from {@link clearSearch} because this is the path
   * openedx/frontend-app-catalog#160 breaks, and the spec covering that defect
   * needs to drive it directly rather than through the keyboard workaround.
   */
  async clearSearchByClick(): Promise<void> {
    await this.clearSearchButton.click();
  }

  /** The result card for one course, anchored by course key rather than title. */
  courseCard(courseKey: string): Locator {
    return this.page.locator(catalogCourseCard(courseKey));
  }

  /** Opens a course's About page from its result card. */
  async openCourseAbout(courseKey: string): Promise<void> {
    await this.courseCard(courseKey).click();
    await this.page.waitForURL((url) => url.pathname.endsWith('/about'));
  }
}
