import type { FrameLocator, Locator, Page, Response } from '@playwright/test';

import { ADVANCED_BLOCK_SELECTORS, TIMEOUTS } from '../../../config';
import { AdvancedBlock } from './advanced.block';

/** A `word_cloud` block: one input per word the author allows, and "Save". */
export class WordCloudBlock extends AdvancedBlock {
  readonly inputs: Locator;
  readonly saveButton: Locator;

  constructor(
    private readonly page: Page,
    contentFrame: FrameLocator,
    blockId: string,
  ) {
    super(contentFrame, blockId, 'word_cloud');
    this.inputs = this.rendered.locator(ADVANCED_BLOCK_SELECTORS.wordCloudInput);
    this.saveButton = this.rendered.locator(ADVANCED_BLOCK_SELECTORS.wordCloudSave);
  }

  /**
   * Types `words` into the first inputs and saves, returning the block's
   * `handle_submit_state` response.
   */
  async submit(words: readonly string[]): Promise<Response> {
    for (const [i, word] of words.entries()) await this.inputs.nth(i).fill(word);
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith('/handler/handle_submit_state'), {
        timeout: TIMEOUTS.navigation,
      }),
      this.saveButton.click(),
    ]);
    return response;
  }
}
