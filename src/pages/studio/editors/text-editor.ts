import type { Page } from '@playwright/test';

import { STUDIO_EDITOR_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { XBLOCK_PATH } from '../../../api';
import { waitForWrite } from '../wait-for-write';

/**
 * The text (TinyMCE) component editor the MFE opens after the "Text"
 * add-component tile picks a template.
 *
 * TinyMCE's toolbar buttons carry only localized labels, so formatting is applied
 * with TinyMCE's default keyboard shortcuts — bold, italic, underline, headings —
 * whose markup lands in the saved OLX (measured; the alignment shortcuts do
 * nothing in this editor) — the spec asserts on that HTML, never on the toolbar.
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

  /**
   * Places the caret in an editor that opened without the template picker (the
   * library MFE opens the rich-text editor directly). Same caret rule as
   * {@link chooseTemplate}: do not click the body again afterwards.
   */
  async focus(): Promise<void> {
    await this.body().waitFor();
    await this.body().click();
  }

  /** Renames the component through the editor header's title control (committed with Enter). */
  async setTitle(title: string): Promise<void> {
    await this.page.locator(this.s.editorTitleEditButton).first().click();
    const input = this.page.locator(this.s.editorTitleInput).first();
    await input.fill(title);
    await input.press('Enter');
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

  /** Underlines subsequently typed text via Ctrl+U (a `text-decoration: underline` span). */
  async underline(): Promise<void> {
    await this.page.keyboard.press('Control+u');
  }

  /** Turns the caret's block into a heading of `level` via Alt+Shift+<level> (`<h1>`–`<h6>`). */
  async heading(level: 1 | 2 | 3 | 4 | 5 | 6): Promise<void> {
    await this.page.keyboard.press(`Alt+Shift+${level}`);
  }

  /** Starts a new block at the caret (Enter). */
  async newParagraph(): Promise<void> {
    await this.page.keyboard.press('Enter');
  }

  /** Saves the editor, waiting for the `POST /xblock/<html>` carrying the content. */
  async save(): Promise<void> {
    await waitForWrite(
      this.page,
      {
        method: 'POST',
        urlIncludes: `${XBLOCK_PATH}block-v1:`,
        timeout: TIMEOUTS.xblockEditorSave,
      },
      () => this.page.locator(this.s.saveButton).click(),
    );
  }
}
