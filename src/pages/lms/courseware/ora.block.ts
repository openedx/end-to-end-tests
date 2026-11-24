import type { Dialog, FrameLocator, Locator, Page, Response } from '@playwright/test';

import { ADVANCED_BLOCK_SELECTORS, TIMEOUTS } from '../../../config';
import { AdvancedBlock } from './advanced.block';

/**
 * An Open Response Assessment (edx-ora2) in its legacy learner view: the
 * response step a learner writes and submits, and the grade step that
 * completes once the response has been assessed.
 */
export class OraBlock extends AdvancedBlock {
  /** The response field of the "Your Response" step. */
  readonly responseText: Locator;
  /** The "Your Grade" step, present only once the response has its final grade. */
  readonly gradeComplete: Locator;

  constructor(
    private readonly page: Page,
    private readonly contentFrame: FrameLocator,
    blockId: string,
  ) {
    super(contentFrame, blockId, 'openassessment');
    this.responseText = this.rendered.locator(ADVANCED_BLOCK_SELECTORS.oraResponseText);
    this.gradeComplete = this.rendered.locator(ADVANCED_BLOCK_SELECTORS.oraGradeComplete);
  }

  /**
   * Writes a response and submits it, returning the block's `submit` response.
   * The block asks the learner to confirm first (a submitted response cannot be
   * edited), and the learner confirms: in the block's own dialog, or — where an
   * ora2 build asks through the browser instead — in the native one.
   */
  async respond(text: string): Promise<Response> {
    // Typed, not filled: the block enables Submit on the field's key events.
    await this.responseText.pressSequentially(text);
    const acceptNative = (dialog: Dialog) => void dialog.accept();
    this.page.on('dialog', acceptNative);
    try {
      const submitted = this.page.waitForResponse((r) => r.url().endsWith('/handler/submit'), {
        timeout: TIMEOUTS.navigation,
      });
      await this.rendered.locator(ADVANCED_BLOCK_SELECTORS.oraSubmit).click();
      const confirm = this.contentFrame.locator(ADVANCED_BLOCK_SELECTORS.oraSubmitConfirm);
      await Promise.race([
        submitted,
        confirm
          .click({ timeout: TIMEOUTS.navigation })
          // No in-page prompt on this build: the native one was accepted above.
          .catch(() => undefined),
      ]);
      return await submitted;
    } finally {
      this.page.off('dialog', acceptNative);
    }
  }
}
