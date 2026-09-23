import type { Locator, Page } from '@playwright/test';

import { CATALOG_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';

/**
 * The catalog MFE's home — the public landing page. The LMS answers its root
 * (`/`) with a redirect here wherever the catalog MFE is enabled (Tutor's
 * default from teak), so this is what an anonymous visitor lands on.
 *
 * Locators and single-surface actions only; specs own the assertions.
 */
export class CatalogHomePage {
  readonly banner: Locator;
  /** The home search field — present only where course discovery is on. */
  readonly searchInput: Locator;
  readonly courseCards: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.banner = page.locator(CATALOG_SELECTORS.homeBanner);
    this.searchInput = this.banner.locator(CATALOG_SELECTORS.searchInput);
    this.courseCards = page.locator(CATALOG_SELECTORS.courseCard);
  }

  /** Opens the LMS root, which lands on the catalog home. */
  async goto(): Promise<void> {
    await this.page.goto(`${this.config.baseUrls.lms}/`);
    await this.banner.waitFor({ timeout: TIMEOUTS.navigation });
  }

  /**
   * Searches from the home field. The home page does not search in place: it
   * hands the term to the catalog page (`/catalog/courses?search_query=`).
   */
  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    await this.searchInput.press('Enter');
    await this.page.waitForURL(
      (url) => url.pathname.endsWith('/courses') && url.searchParams.get('search_query') === term,
    );
  }
}
