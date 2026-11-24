import type { Locator, Page, Response } from '@playwright/test';

import { STUDIO_EDITOR_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { XBLOCK_PATH } from '../../../api';
import { waitForWrite } from '../wait-for-write';

/**
 * The problem editor the MFE opens after the "Problem" add-component tile: a
 * type picker, then the visual editor — a question, a list of answers each
 * with a "correct" control, and Save.
 *
 * Answers are addressed by the key the editor gives them (`A`, `B`, `C`, …),
 * which is also what the saved OLX orders them by. The question and, for the
 * choice types, each answer are TinyMCE fields; the numerical and text types
 * take their answers in plain inputs.
 */
export class StudioProblemEditor {
  private readonly s = STUDIO_EDITOR_SELECTORS;
  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    void this.config;
  }

  /** The answer rows of the open editor. */
  get answers(): Locator {
    return this.page.locator(this.s.problemAnswerRow);
  }

  /**
   * Picks a problem type in the picker (by its OLX response tag) and opens its
   * editor, waiting for the question field and the answers to render.
   */
  async chooseType(type: string): Promise<void> {
    await this.page.locator(this.s.problemTypeOption(type)).click();
    await this.page.locator(this.s.problemTypeSelect).click();
    await this.page.locator(this.s.problemQuestionFrame).waitFor();
    await this.answers.first().waitFor();
  }

  /** Writes the question. */
  async setQuestion(text: string): Promise<void> {
    await this.typeInto(this.s.problemQuestionFrame, text);
  }

  /**
   * Writes an answer by its key. `rich` answers (single and multi-select) are
   * TinyMCE fields; `plain` ones (dropdown, numerical, text input) plain fields.
   */
  async setAnswer(key: string, text: string, field: 'rich' | 'plain'): Promise<void> {
    if (field === 'rich') await this.typeInto(this.s.problemAnswerFrame(key), text);
    else await this.page.locator(this.s.problemAnswerInput(key)).fill(text);
  }

  /** Marks an answer as correct (the radio or checkbox beside it). */
  async markCorrect(key: string): Promise<void> {
    await this.page.locator(this.s.problemAnswerCorrect(key)).check();
  }

  /** Saves the editor, returning the `POST /xblock/<problem>` carrying the OLX. */
  async save(): Promise<Response> {
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        urlIncludes: `${XBLOCK_PATH}block-v1:`,
        timeout: TIMEOUTS.xblockEditorSave,
      },
      () => this.page.locator(this.s.saveButton).click(),
    );
  }

  private async typeInto(frameSelector: string, text: string): Promise<void> {
    const body = this.page.frameLocator(frameSelector).locator('body');
    await body.click();
    await this.page.keyboard.type(text);
  }
}
