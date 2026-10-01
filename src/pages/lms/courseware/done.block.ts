import type { FrameLocator, Locator, Page, Response } from '@playwright/test';

import { ADVANCED_BLOCK_SELECTORS, TIMEOUTS } from '../../../config';
import { AdvancedBlock } from './advanced.block';

/** A `done` ("Completion") block: the learner's "Mark as complete" switch. */
export class DoneBlock extends AdvancedBlock {
  readonly switch: Locator;

  constructor(
    private readonly page: Page,
    contentFrame: FrameLocator,
    blockId: string,
  ) {
    super(contentFrame, blockId, 'done');
    this.switch = this.rendered.locator(ADVANCED_BLOCK_SELECTORS.doneSwitch);
  }

  /** Flips the switch, returning the block's `toggle_button` response. */
  async toggle(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith('/handler/toggle_button'), {
        timeout: TIMEOUTS.navigation,
      }),
      this.switch.click(),
    ]);
    return response;
  }
}
