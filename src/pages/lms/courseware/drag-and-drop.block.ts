import type { FrameLocator, Locator, Page, Response } from '@playwright/test';

import { ADVANCED_BLOCK_SELECTORS, TIMEOUTS } from '../../../config';
import { AdvancedBlock } from './advanced.block';

/**
 * An xblock-drag-and-drop-v2 problem: a bank of items and the zones of a
 * target image. Items and zones are addressed by the ids the block's own data
 * gives them (course content), never by their labels.
 */
export class DragAndDropBlock extends AdvancedBlock {
  constructor(
    private readonly page: Page,
    contentFrame: FrameLocator,
    blockId: string,
  ) {
    super(contentFrame, blockId, 'drag-and-drop-v2');
  }

  /** An item, wherever it currently sits (the bank or a zone). */
  item(itemId: number): Locator {
    return this.rendered.locator(ADVANCED_BLOCK_SELECTORS.dragAndDropItem(itemId));
  }

  /** A drop zone of the target image. */
  zone(zoneUid: string): Locator {
    return this.rendered.locator(ADVANCED_BLOCK_SELECTORS.dragAndDropZone(zoneUid));
  }

  /** An item as placed inside a zone; absent while it is in the bank. */
  placedItem(itemId: number, zoneUid: string): Locator {
    return this.zone(zoneUid).locator(ADVANCED_BLOCK_SELECTORS.dragAndDropItem(itemId));
  }

  /**
   * Drags an item onto a zone with the pointer, returning the block's
   * `drop_item` response (whose `correct` says whether the drop was accepted).
   */
  async drop(itemId: number, zoneUid: string): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith('/handler/drop_item'), {
        timeout: TIMEOUTS.navigation,
      }),
      this.item(itemId).dragTo(this.zone(zoneUid)),
    ]);
    return response;
  }
}
