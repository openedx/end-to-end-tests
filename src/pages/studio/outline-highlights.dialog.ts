import type { Locator, Page } from '@playwright/test';

import { STUDIO_OUTLINE_PAGE_SELECTORS, TIMEOUTS, type AppConfig } from '../../config';
import { XBLOCK_PATH } from '../../api';
import { waitForWrite } from './wait-for-write';

/** How many highlight fields the dialog offers (the platform's per-section maximum). */
export const SECTION_HIGHLIGHT_FIELDS = 5;

/**
 * Course highlight e-mails in the course outline: the status bar's "Enable now"
 * (with its confirm) that turns highlights-for-messaging on for the course, and
 * the per-section highlights dialog a section card's "Section highlights" badge
 * opens.
 *
 * One dialog is open at a time, so its controls are page-scoped. Locators and
 * single-surface actions only; the spec asserts against `course_index` and the
 * section's `xblock/outline`. Both writes wait for the `/xblock/` request they
 * trigger.
 */
export class StudioOutlineHighlightsDialog {
  private readonly s = STUDIO_OUTLINE_PAGE_SELECTORS;
  readonly enableButton: Locator;
  readonly enabledStatus: Locator;
  readonly modal: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    void this.config;
    this.enableButton = page.locator(this.s.highlightsEnableButton);
    this.enabledStatus = page.locator(this.s.highlightsEnabledStatus);
    this.modal = page.locator(this.s.highlightsModal);
  }

  /**
   * Turns course highlight e-mails on from the status bar: "Enable now", then the
   * confirm's "Enable", waiting for the course-block write it fires.
   */
  async enableForCourse(): Promise<void> {
    await this.enableButton.click();
    await waitForWrite(
      this.page,
      {
        method: ['POST', 'PATCH'],
        urlIncludes: `${XBLOCK_PATH}block-v1:`,
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => this.page.locator(this.s.dialogPrimaryButton).click(),
    );
  }

  /** Opens a section card's highlights dialog from its "Section highlights" badge. */
  async open(sectionCard: Locator): Promise<void> {
    await sectionCard.locator(this.s.sectionHighlightsButton).click();
    await this.modal.waitFor();
  }

  /**
   * Fills the open dialog's fields with `highlights` (in order; the rest are
   * cleared) and saves, waiting for the section write the save fires.
   */
  async save(highlights: readonly string[]): Promise<void> {
    if (highlights.length > SECTION_HIGHLIGHT_FIELDS) {
      throw new Error(`A section takes at most ${SECTION_HIGHLIGHT_FIELDS} highlights.`);
    }
    for (let i = 0; i < SECTION_HIGHLIGHT_FIELDS; i += 1) {
      await this.modal.locator(`textarea[name="highlight_${i + 1}"]`).fill(highlights[i] ?? '');
    }
    await waitForWrite(
      this.page,
      {
        method: ['POST', 'PATCH'],
        urlIncludes: `${XBLOCK_PATH}block-v1:`,
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => this.modal.locator(this.s.highlightsSaveButton).click(),
    );
  }
}
