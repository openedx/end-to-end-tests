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
   * The status bar above the result grid. Unlike {@link searchInput} it is there
   * whether or not the installation enables catalog search, so it is what a
   * catalog page load waits on.
   */
  readonly resultsStatusBar: Locator;
  readonly nextPageButton: Locator;
  readonly previousPageButton: Locator;
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
    this.resultsStatusBar = page.locator(CATALOG_SELECTORS.resultsStatusBar);
    this.nextPageButton = page.locator(CATALOG_SELECTORS.nextPageButton);
    this.previousPageButton = page.locator(CATALOG_SELECTORS.previousPageButton);
    this.noResultsAlert = page.getByRole('alert');
  }

  /** The catalog's own URL. */
  get url(): string {
    return `${this.config.baseUrls.apps}/catalog/courses`;
  }

  /**
   * Navigates straight to the catalog.
   *
   * Waits for the result status bar rather than the search field: the field is
   * only rendered where the installation enables catalog search (the
   * `catalog-search` capability), so waiting for it would hang on every install
   * that does not — including a default one.
   */
  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.resultsStatusBar.waitFor();
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
   * wait for the catalog's own result status bar rather than for a URL (and not
   * for the search field, which {@link goto} explains).
   */
  async gotoViaNavLink(): Promise<void> {
    await this.navCatalogLink.click();
    await this.resultsStatusBar.waitFor();
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
    const results = this.pendingResults();
    await this.searchInput.fill(term);
    await this.searchInput.press('Enter');
    await results;
    await this.page.waitForURL((url) => url.searchParams.get('search_query') === term);
  }

  /**
   * A promise for the next result-set response — the state the card list is
   * derived from. Started *before* the action that triggers it, so the listener
   * is in place by the time the request goes out.
   */
  private pendingResults(): Promise<unknown> {
    return this.page.waitForResponse(
      (response) =>
        response.url().startsWith(`${this.config.baseUrls.lms}${CATALOG_SEARCH_PATH}`) &&
        response.request().method() === 'POST',
    );
  }

  /** Whether the catalog offers a further page of results. */
  async hasNextPage(): Promise<boolean> {
    return this.nextPageButton.isEnabled();
  }

  /**
   * Advances to the next page of results and waits for them to render.
   *
   * The page index is component state rather than a URL parameter, so — unlike
   * {@link search} — there is no URL change to wait for. Nor is the response
   * enough on its own: the MFE renders the *previous* page's cards as placeholder
   * data while the next page is in flight and for a beat after it lands, so
   * reading the cards straight after the response reads the page we came from.
   * So we also wait for a card that is not the one this page started with —
   * which, unlike a timeout, is the actual state change being waited for.
   */
  async gotoNextPage(): Promise<void> {
    const previousFirstCardHref = await this.courseCards.first().getAttribute('href');
    const results = this.pendingResults();
    await this.nextPageButton.click();
    await results;

    if (previousFirstCardHref !== null) {
      await this.page
        .locator(`${CATALOG_SELECTORS.courseCard}:not([href="${previousFirstCardHref}"])`)
        .first()
        .waitFor();
    }
  }

  /**
   * Pages forward through the catalog until the given course's card is on screen,
   * and reports whether it was found.
   *
   * This is the route to a specific course on an installation that does not
   * enable catalog search (see the `catalog-search` capability): with no search
   * field, the catalog is a plain paginated list. Returns `false` rather than
   * throwing when the whole catalog has been walked without a match — a page
   * object reports what it saw and the caller decides whether that is a failure.
   *
   * @param pageLimit Pages to walk before giving up. The walk already terminates
   * on its own when the next-page control goes disabled; this only bounds the
   * damage if a defect leaves it permanently enabled, so it is deliberately far
   * above any realistic catalog rather than a tuned value.
   */
  async pageToCourseCard(courseKey: string, pageLimit = 200): Promise<boolean> {
    const card = this.courseCard(courseKey);

    for (let visited = 1; visited <= pageLimit; visited += 1) {
      // The card grid renders after the status bar `goto` waits for, so settle on
      // this page having cards before reading whether the wanted one is among
      // them: `count()` does not retry, and would otherwise read an empty grid.
      await this.courseCards.first().waitFor();

      if ((await card.count()) > 0) {
        return true;
      }
      if (!(await this.hasNextPage())) {
        return false;
      }
      await this.gotoNextPage();
    }

    throw new Error(
      `Walked ${pageLimit} catalog pages looking for "${courseKey}" and the catalog still ` +
        'offers a next page. Either the catalog is larger than this suite expects or its ' +
        'pagination control never reaches its last page.',
    );
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
