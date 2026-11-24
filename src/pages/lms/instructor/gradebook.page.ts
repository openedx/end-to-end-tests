import type { Locator, Page, Response } from '@playwright/test';

import { INSTRUCTOR_DASHBOARD_SELECTORS, TIMEOUTS } from '../../../config';

/**
 * The gradebook (`frontend-app-gradebook`), which the instructor dashboard's
 * Grading tab links to: one row per learner with their grades. Locators and
 * single-surface actions only; the spec asserts, against the gradebook API's
 * answer to the page's own search.
 */
export class GradebookPage {
  readonly searchInput: Locator;
  readonly rows: Locator;

  constructor(private readonly page: Page) {
    this.searchInput = page.locator(INSTRUCTOR_DASHBOARD_SELECTORS.gradebookSearchInput);
    this.rows = page.locator(INSTRUCTOR_DASHBOARD_SELECTORS.gradebookRow);
  }

  /**
   * Searches the gradebook for a learner (username or e-mail) and returns the
   * grades listing the page fetched for that search.
   */
  async searchLearner(term: string): Promise<Response> {
    await this.searchInput.waitFor({ timeout: TIMEOUTS.navigation });
    const listed = this.page.waitForResponse(
      (r) =>
        r.url().includes('/api/grades/v1/gradebook/') &&
        r.url().includes(encodeURIComponent(term)) &&
        r.request().method() === 'GET',
      { timeout: TIMEOUTS.navigation },
    );
    await this.searchInput.fill(term);
    await this.searchInput.press('Enter');
    return listed;
  }

  /** The learner's row, by the username the caller supplies. */
  rowFor(username: string): Locator {
    return this.rows.filter({ hasText: username });
  }
}
