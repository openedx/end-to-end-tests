import type { Locator, Page, Response } from '@playwright/test';

import { DOWNSTREAMS_PATH } from '../../../api';
import {
  COURSE_LIBRARY_SYNC_SELECTORS,
  TIMEOUTS,
  courseLibrariesPath,
  type AppConfig,
} from '../../../config';
import { waitForWrite } from '../wait-for-write';
import { confirmIgnore } from './preview-changes.dialog';

/**
 * The course's Libraries page (`/course/<key>/libraries`, "Content →
 * Libraries"): the "Libraries" tab lists every library the course reuses
 * content from; the "Review Content Updates" tab lists each linked block with
 * a newer published version, with "Review Updates" (opens the preview modal),
 * "Ignore" and "Update" per card. Present on `main` and `verawood`.
 */
export class CourseLibrariesPage {
  private readonly s = COURSE_LIBRARY_SYNC_SELECTORS;
  readonly reviewCards: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.reviewCards = page.locator(this.s.reviewItemCard);
  }

  async goto(courseKey: string, tab?: 'all' | 'review'): Promise<void> {
    await this.page.goto(courseLibrariesPath(this.config, courseKey, tab));
    await this.page.locator(this.s.librariesTab('all')).waitFor();
  }

  tab(key: 'all' | 'review'): Locator {
    return this.page.locator(this.s.librariesTab(key));
  }

  async openTab(key: 'all' | 'review'): Promise<void> {
    await this.tab(key).click();
  }

  /** The Review card for the block linked to `usageKey` (matched through its unit link) or titled `title`. */
  reviewCardFor(title: string): Locator {
    return this.reviewCards.filter({ hasText: title });
  }

  /**
   * Opens the Review tab and waits for the card titled `title`, reloading the
   * tab as it polls. The tab is populated from the course-content search index,
   * which lags the downstream's own `ready_to_sync` under load; a page loaded
   * before the index caught up shows "All components are up to date" and does
   * not refresh itself, so a reload is the only way to see the card arrive.
   */
  async waitForReviewCard(courseKey: string, title: string): Promise<void> {
    const card = this.reviewCardFor(title).first();
    const deadline = Date.now() + TIMEOUTS.libraryReviewIndex;
    const appears = () =>
      card
        .waitFor({ timeout: TIMEOUTS.optionalOverlay })
        .then(() => true)
        .catch(() => false);
    await this.goto(courseKey, 'review');
    // Each pass gives the freshly loaded tab a short, condition-based wait for
    // the card, then reloads it: a tab loaded before the index caught up shows
    // "all up to date" and does not refresh itself.
    while (!(await appears())) {
      if (Date.now() > deadline) break;
      await this.goto(courseKey, 'review');
    }
    // One last wait so the failure is the card locator, not a silent fall-through.
    await card.waitFor({ timeout: TIMEOUTS.optionalOverlay });
  }

  /** "Review Updates" on a card — opens the preview-changes modal. */
  async reviewUpdates(title: string): Promise<void> {
    await this.reviewCardFor(title).first().locator(this.s.reviewCardReviewButton).click();
  }

  /** "Update" on a card, waiting for the `POST downstreams/<key>/sync`. */
  async update(title: string): Promise<Response> {
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().includes(DOWNSTREAMS_PATH) && r.url().endsWith('/sync'),
        timeout: TIMEOUTS.contentWrite,
      },
      () => this.reviewCardFor(title).first().locator(this.s.reviewCardUpdateButton).click(),
    );
  }

  /** "Ignore" on a card → the "Ignore these changes?" confirmation → the `DELETE downstreams/<key>/sync`. */
  async ignore(title: string): Promise<Response> {
    await this.reviewCardFor(title).first().locator(this.s.reviewCardIgnoreButton).click();
    return confirmIgnore(this.page);
  }
}
