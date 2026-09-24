import type { FrameLocator, Page, Response } from '@playwright/test';

import { ADVANCED_BLOCK_SELECTORS, TIMEOUTS } from '../../../config';
import { AdvancedBlock } from './advanced.block';

/**
 * An xblock-poll `poll` or `survey`: a learner picks an answer (a poll) or one
 * answer per question (a survey) and submits once. Answers are chosen by their
 * keys — course content the author set — never by their labels.
 */
export class PollBlock extends AdvancedBlock {
  constructor(
    private readonly page: Page,
    contentFrame: FrameLocator,
    blockId: string,
    category: 'poll' | 'survey',
  ) {
    super(contentFrame, blockId, category);
  }

  /** Chooses a poll's answer by its key. */
  async choose(key: string): Promise<void> {
    await this.rendered.locator(ADVANCED_BLOCK_SELECTORS.pollAnswer(key)).check();
  }

  /** Chooses a survey question's answer by the question's and the answer's keys. */
  async answer(question: string, answer: string): Promise<void> {
    await this.rendered.locator(ADVANCED_BLOCK_SELECTORS.surveyAnswer(question, answer)).check();
  }

  /** Submits the choice(s), returning the block's `vote` response. */
  async submit(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith('/handler/vote'), {
        timeout: TIMEOUTS.navigation,
      }),
      this.wrapper.locator(ADVANCED_BLOCK_SELECTORS.pollSubmit).click(),
    ]);
    return response;
  }
}
