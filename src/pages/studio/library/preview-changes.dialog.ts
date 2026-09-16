import type { Locator, Page, Response } from '@playwright/test';

import { DOWNSTREAMS_PATH } from '../../../api';
import { COURSE_LIBRARY_SYNC_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { waitForWrite } from '../wait-for-write';

/** Presses "Ignore" in the open "Ignore these changes?" confirmation and waits for the decline. */
export async function confirmIgnore(page: Page): Promise<Response> {
  const s = COURSE_LIBRARY_SYNC_SELECTORS;
  await page.locator(s.ignoreConfirmModal).waitFor();
  return waitForWrite(
    page,
    {
      method: 'DELETE',
      predicate: (r) => r.url().includes(DOWNSTREAMS_PATH) && r.url().endsWith('/sync'),
      timeout: TIMEOUTS.contentWrite,
    },
    () => page.locator(s.ignoreConfirmButton).click(),
  );
}

/**
 * The "Preview changes" modal (`PreviewLibraryXBlockChanges`) a course author
 * sees for a library-linked block with a newer published version — opened
 * from the unit page's "Update available", the course Libraries Review tab,
 * or (on `main`) an outline card. It shows the old and new versions and offers
 * "Accept changes" / "Ignore changes" (plus "Keep course content" when the
 * block was customized locally).
 */
export class PreviewChangesDialog {
  private readonly s = COURSE_LIBRARY_SYNC_SELECTORS;
  readonly root: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    void this.config;
    this.root = page.locator(this.s.previewModal);
  }

  compareTab(key: 'old' | 'new'): Locator {
    return this.page.locator(this.s.compareTab(key));
  }

  async showVersion(key: 'old' | 'new'): Promise<void> {
    await this.compareTab(key).click();
  }

  /** "Accept changes", waiting for the `POST downstreams/<key>/sync`. */
  async accept(): Promise<Response> {
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().includes(DOWNSTREAMS_PATH) && r.url().endsWith('/sync'),
        timeout: TIMEOUTS.contentWrite,
      },
      () => this.page.locator(this.s.acceptButton).click(),
    );
  }

  /**
   * "Ignore changes": opens the "Ignore these changes?" confirmation, whose
   * danger button fires the `DELETE downstreams/<key>/sync` this waits for.
   */
  async ignore(): Promise<Response> {
    await this.page.locator(this.s.ignoreButton).click();
    return confirmIgnore(this.page);
  }
}
