import type { Page } from '@playwright/test';

import { STUDIO_EDITOR_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { XBLOCK_PATH } from '../../../api';
import { waitForWrite } from '../wait-for-write';

/**
 * The text (TinyMCE) component editor the MFE opens after the "Text"
 * add-component tile picks a template.
 *
 * TinyMCE's toolbar buttons carry only localized labels, so formatting is applied
 * with keyboard shortcuts (Ctrl+B / Ctrl+I), which produce `<strong>` / `<em>` in
 * the saved OLX (measured) — the spec asserts on that HTML, never on the toolbar.
 */
export class StudioTextEditor {
  private readonly s = STUDIO_EDITOR_SELECTORS;
  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    void this.config;
  }

  /**
   * Picks the text-component template (e.g. `html` for the rich-text editor),
   * opens it, and places the caret in the editor body. Type and formatting calls
   * after this must not re-click the body — that would reset the caret and cancel
   * an active bold/italic run.
   */
  async chooseTemplate(value: string): Promise<void> {
    await this.page.locator(this.s.textTemplateRadio(value)).check();
    await this.page.locator(this.s.textTemplateSelect).first().click();
    await this.body().waitFor();
    await this.body().click();
  }

  private body() {
    return this.page.frameLocator(this.s.tinyMceFrame).locator('body');
  }

  /** Types `text` at the caret (does not move the caret — {@link chooseTemplate} placed it). */
  async type(text: string): Promise<void> {
    await this.page.keyboard.type(text);
  }

  /** Wraps subsequently typed text in bold (`<strong>`) via Ctrl+B. */
  async bold(): Promise<void> {
    await this.page.keyboard.press('Control+b');
  }

  /** Wraps subsequently typed text in italic (`<em>`) via Ctrl+I. */
  async italic(): Promise<void> {
    await this.page.keyboard.press('Control+i');
  }

  /** Saves the editor, waiting for the `POST /xblock/<html>` carrying the content. */
  async save(): Promise<void> {
    await waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => new RegExp(`${XBLOCK_PATH}block-v1:`).test(r.url()),
        timeout: TIMEOUTS.xblockEditorSave,
      },
      () => this.page.locator(this.s.saveButton).click(),
    );
  }
}
