import type { FrameLocator, Locator } from '@playwright/test';

import { advancedBlockRoot, coursewareBlock } from '../../../config';

/**
 * One advanced component (a legacy XBlock: poll, word cloud, annotatable, an
 * embed, …) inside a unit's content iframe, as a learner sees it.
 *
 * `rendered` is the markup the block's own template emits inside its
 * `[data-usage-id]` wrapper (`src/config/selectors/advanced-blocks.ts`), so a
 * spec can tell "the block rendered" from "the wrapper is there but empty".
 * Blocks with learner controls extend this with their actions.
 */
export class AdvancedBlock {
  readonly wrapper: Locator;
  readonly rendered: Locator;

  constructor(contentFrame: FrameLocator, blockId: string, category: string) {
    this.wrapper = contentFrame.locator(coursewareBlock(blockId));
    this.rendered = this.wrapper.locator(advancedBlockRoot(category));
  }
}
