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

  /**
   * Accepts the library update (takes the published version), waiting for the
   * `POST downstreams/<key>/sync`. The footer's sync button is "Accept changes"
   * for an untouched block, but "Update to published library content" when the
   * block was customized in the course — and that one first opens a "discard
   * local edits" confirmation whose danger button fires the sync. Handles both.
   */
  async accept(): Promise<Response> {
    const syncButton = this.page
      .locator(`${this.s.previewModal} .pgn__modal-footer button`)
      .filter({ hasText: /Accept changes|Update to published library content/ })
      .last();
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().includes(DOWNSTREAMS_PATH) && r.url().endsWith('/sync'),
        timeout: TIMEOUTS.contentWrite,
      },
      async () => {
        await syncButton.click();
        // A customized block asks to confirm discarding the local edits first.
        const confirm = this.page.locator(
          `${this.s.ignoreConfirmModal} .pgn__modal-footer button.btn-danger`,
        );
        if (await confirm.isVisible().catch(() => false)) await confirm.click();
      },
    );
  }

  /**
   * "Keep course content" — the customized-block choice that declines the
   * update and preserves the course's local edits. Opens a confirmation whose
   * primary button commits it; resolves once the preview modal has closed. Used
   * where the point is that an override survives an available library update.
   */
  async keepCourseContent(): Promise<void> {
    await this.page
      .locator(`${this.s.previewModal} .pgn__modal-footer button`)
      .filter({ hasText: 'Keep course content' })
      .last()
      .click();
    await this.page
      .locator(`${this.s.ignoreConfirmModal} .pgn__modal-footer button`)
      .filter({ hasText: 'Keep course content' })
      .last()
      .click();
    await this.root.waitFor({ state: 'hidden' });
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
