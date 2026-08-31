import type { FrameLocator, Locator, Page } from '@playwright/test';

import { CAPA_SELECTORS, coursewareBlock } from '../../../config';

/**
 * One CAPA problem inside a unit's content iframe.
 *
 * Anchored on CAPA's server-rendered class markup — the documented locator
 * exception explained in `src/config/selectors/capa.ts`. Actions only: the spec
 * decides what a given status means.
 */
export class ProblemBlock {
  readonly root: Locator;
  readonly submitButton: Locator;
  readonly radioOptions: Locator;
  readonly checkboxOptions: Locator;
  readonly textInputs: Locator;
  readonly status: Locator;
  readonly correctStatus: Locator;
  readonly incorrectStatus: Locator;
  readonly unansweredStatus: Locator;

  constructor(
    private readonly page: Page,
    contentFrame: FrameLocator,
    blockId: string,
  ) {
    this.root = contentFrame.locator(coursewareBlock(blockId));
    this.submitButton = this.root.locator(CAPA_SELECTORS.submitButton);
    this.radioOptions = this.root.locator(CAPA_SELECTORS.radioOption);
    this.checkboxOptions = this.root.locator(CAPA_SELECTORS.checkboxOption);
    this.textInputs = this.root.locator(CAPA_SELECTORS.textInput);
    this.status = this.root.locator(CAPA_SELECTORS.status);
    this.correctStatus = this.root.locator(CAPA_SELECTORS.statusCorrect);
    this.incorrectStatus = this.root.locator(CAPA_SELECTORS.statusIncorrect);
    this.unansweredStatus = this.root.locator(CAPA_SELECTORS.statusUnanswered);
  }

  /** Selects one multiple-choice option by index. */
  async selectChoice(index: number): Promise<void> {
    await this.radioOptions.nth(index).check();
  }

  /** Ticks one multi-select option by index. */
  async selectCheckbox(index: number): Promise<void> {
    await this.checkboxOptions.nth(index).check();
  }

  /**
   * Types into one text or numerical input. The value need not be correct:
   * completion follows submission, and correctness is a separate concern.
   */
  async fillTextAnswer(index: number, value: string): Promise<void> {
    await this.textInputs.nth(index).fill(value);
  }

  /**
   * Submits the answer and waits for the platform to have graded it.
   *
   * Waits on the block's own `problem_check` call rather than on any rendered
   * feedback: the response is what changes state, and the rendering that follows
   * is what a spec may then assert.
   */
  async submit(): Promise<void> {
    const graded = this.page.waitForResponse(
      (response) => response.url().includes('problem_check') && response.ok(),
    );
    // The button carries `disabled` until a choice is selected, so this is also a
    // check that something was actually answered — no sleep needed.
    await this.submitButton.click();
    await graded;
  }
}
