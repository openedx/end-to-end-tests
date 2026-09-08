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
  readonly dropdowns: Locator;
  readonly showAnswerButton: Locator;

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
    this.dropdowns = this.root.locator(CAPA_SELECTORS.dropdown);
    this.showAnswerButton = this.root.locator(CAPA_SELECTORS.showAnswerButton);
  }

  /**
   * Waits for the problem's markup to be present, so the control `count()`s a
   * caller branches on are taken against a rendered problem rather than an empty
   * wrapper. Every CAPA problem renders a submit control, whatever its input
   * type, so that is the marker; a problem that never shows one within the budget
   * has nothing the suite can drive, and the caller is told so.
   */
  async waitForControls(timeout: number): Promise<boolean> {
    try {
      await this.submitButton.waitFor({ state: 'attached', timeout });
      return true;
    } catch {
      return false;
    }
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
   * Picks a real answer from a dropdown by position.
   *
   * Two placeholders have to be stepped over, and neither is matched by label
   * (that is course copy): a genuinely empty value, and the platform's own
   * pre-selected placeholder, whose value ends in `_dummy_default`. Selecting the
   * latter looks like an answer but changes nothing, so no `change` event fires and
   * the submit control stays disabled — which is exactly how this bit once.
   */
  async selectDropdownOption(index: number, optionPosition = 1): Promise<void> {
    const dropdown = this.dropdowns.nth(index);
    const current = await dropdown.inputValue();
    const values = await dropdown
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));

    const value = values.filter(
      (candidate) =>
        candidate !== '' && candidate !== current && !candidate.endsWith('_dummy_default'),
    )[optionPosition - 1];

    if (value === undefined) {
      throw new Error('The dropdown offers no option other than its placeholder.');
    }
    await dropdown.selectOption(value);
  }

  /**
   * Reveals the correct answer, for problems whose `showanswer` setting allows it,
   * and waits for the platform to have supplied it.
   *
   * Waits on the `problem_show` call rather than on rendered text: the response is
   * what puts the answer in the page.
   */
  async revealAnswer(): Promise<void> {
    const shown = this.page.waitForResponse(
      (response) => response.url().includes('problem_show') && response.ok(),
    );
    await this.showAnswerButton.click();
    await shown;
  }

  /** Whether the submit control has become usable, i.e. something was answered. */
  async submitIsEnabled(timeout: number): Promise<boolean> {
    try {
      await this.submitButton.waitFor({ state: 'visible', timeout });
      return await this.submitButton.isEnabled({ timeout });
    } catch {
      return false;
    }
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
