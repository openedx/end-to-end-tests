import type { FrameLocator, Locator } from '@playwright/test';

import { ADVANCED_BLOCK_SELECTORS } from '../../../config';
import { AdvancedBlock } from './advanced.block';

/**
 * An `annotatable` block: its text, with one highlighted span per annotation the
 * author wrote. Each span carries the annotation's title and body as attributes
 * (course content the test authored), which the tooltip shows on hover.
 */
export class AnnotatableBlock extends AdvancedBlock {
  readonly annotations: Locator;

  constructor(contentFrame: FrameLocator, blockId: string) {
    super(contentFrame, blockId, 'annotatable');
    this.annotations = this.rendered.locator(ADVANCED_BLOCK_SELECTORS.annotatableSpan);
  }
}
