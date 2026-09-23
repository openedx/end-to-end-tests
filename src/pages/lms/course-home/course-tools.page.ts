import type { Locator, Page } from '@playwright/test';

import type { AppConfig } from '../../../config';

/**
 * The course tools the course home links to that are still LMS pages rather
 * than learning-MFE routes: Bookmarks (`/courses/<key>/bookmarks/`) and Updates
 * (`/courses/<key>/course/updates`). They are reached by the link the outline
 * API gives each tool, never by a hard-coded path. Locators and single-surface
 * actions only.
 *
 * Their markup is the LMS's own (themable) template, so the anchors are the
 * structural classes and data attributes the page's scripts key off.
 */
export class CourseToolsPage {
  /** A bookmarked unit's row, keyed by the unit's usage id (a data attribute). */
  readonly bookmarkRows: Locator;
  /** "You have not bookmarked any courseware pages yet". */
  readonly bookmarksEmpty: Locator;
  /** The course updates, one `article` each (date and content). */
  readonly updates: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.bookmarkRows = page.locator('a.bookmarks-results-list-item[data-usage-id]');
    this.bookmarksEmpty = page.locator('.bookmarks-empty');
    this.updates = page.locator('article');
  }

  /** The row for one bookmarked unit. */
  bookmarkRow(usageId: string): Locator {
    return this.page.locator(`a.bookmarks-results-list-item[data-usage-id="${usageId}"]`);
  }

  /**
   * Opens the Bookmarks page at the URL the course tool gives it and waits for
   * the page's own read of the bookmarks API, which the list renders from.
   */
  async gotoBookmarks(url: string): Promise<void> {
    const listed = this.page.waitForResponse(
      (r) =>
        r.url().startsWith(`${this.config.baseUrls.lms}/api/bookmarks/v1/bookmarks/`) &&
        r.request().method() === 'GET',
    );
    await this.page.goto(url);
    await listed;
    await this.bookmarkRows.first().or(this.bookmarksEmpty).waitFor();
  }

  /** Opens the course Updates page at the URL the course tool gives it. */
  async gotoUpdates(url: string): Promise<void> {
    await this.page.goto(url);
    await this.updates.first().waitFor();
  }

  /** Opens a bookmarked unit from its row and waits for the courseware to load it. */
  async openBookmark(usageId: string): Promise<void> {
    await this.bookmarkRow(usageId).click();
    await this.page.waitForURL((url) => url.pathname.includes(usageId));
  }
}
