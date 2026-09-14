import type { Locator, Page } from '@playwright/test';

import { STUDIO_CHECKLISTS_SELECTORS, type AppConfig } from '../../../config';
import { studioOrigin } from '../../../api';

/**
 * The Launch and Best-practices checklists in the authoring MFE
 * (`/checklists/<key>` on Studio, redirected to the MFE). Each item renders as
 * complete or incomplete from the course's validation / quality data; the spec
 * decides the truth against those APIs and this page reads what the MFE drew. An
 * item is identified by the platform's item id (e.g. `courseDates`), never its
 * localized label. The Best-practices section renders only where the platform's
 * quality checklist is enabled — {@link hasItem} lets a spec detect that.
 */
export class StudioChecklistsPage {
  readonly page: Page;

  constructor(
    page: Page,
    private readonly config: AppConfig,
  ) {
    this.page = page;
  }

  url(courseKey: string): string {
    return `${studioOrigin(this.config)}/checklists/${courseKey}`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    // The "N of M completed" subheader paints before the item rows, so wait for a
    // row that is always present (course dates is never filtered out) — otherwise
    // an immediate `hasItem` count can miss rows that are still mounting.
    await this.page.locator(STUDIO_CHECKLISTS_SELECTORS.item('courseDates')).waitFor();
  }

  /** The row for `itemId`. */
  item(itemId: string): Locator {
    return this.page.locator(STUDIO_CHECKLISTS_SELECTORS.item(itemId));
  }

  /** Whether `itemId`'s row is present (a section may be absent when disabled). */
  async hasItem(itemId: string): Promise<boolean> {
    return (await this.item(itemId).count()) > 0;
  }

  /**
   * Whether the MFE drew `itemId` as complete, read from the row's completion
   * class (the completed rows carry it, incomplete rows do not).
   */
  async isComplete(itemId: string): Promise<boolean> {
    const cls = (await this.item(itemId).getAttribute('class')) ?? '';
    return cls.split(/\s+/).includes(STUDIO_CHECKLISTS_SELECTORS.completeClass);
  }
}
