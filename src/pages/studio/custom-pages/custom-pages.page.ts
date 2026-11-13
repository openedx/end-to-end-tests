import type { Locator, Page } from '@playwright/test';

import { STUDIO_CUSTOM_PAGES_SELECTORS, type AppConfig } from '../../../config';
import { TABS_PATH } from '../../../api';
import { authoringCourseBaseUrl } from '../authoring-base';
import { DND_REORDER_TIMEOUT_MS, keyboardDrag } from '../keyboard-drag';
import { waitForWrite } from '../wait-for-write';

/**
 * Custom Pages in the authoring MFE. Reached on the apps origin (Studio does not
 * redirect here), so the page derives the authoring-MFE base for the course.
 *
 * Cards carry no per-page id and share their `data-testid`s, so they are addressed
 * by index and reordered through the dnd-kit drag handle. Reordering uses the
 * keyboard sensor (focus the handle, Space to lift, Arrow to move, Space to drop) —
 * far more reliable than synthesising pointer drags against dnd-kit. The spec
 * decides the new order against the tabs API and the LMS.
 */
export class StudioCustomPagesPage {
  readonly page: Page;
  readonly cardTitles: Locator;
  readonly dragHandles: Locator;
  private base?: string;

  constructor(
    page: Page,
    private readonly config: AppConfig,
  ) {
    this.page = page;
    this.cardTitles = page.locator(STUDIO_CUSTOM_PAGES_SELECTORS.cardTitle);
    this.dragHandles = page.locator(STUDIO_CUSTOM_PAGES_SELECTORS.dragHandle);
  }

  private async courseBase(courseKey: string): Promise<string> {
    this.base ??= await authoringCourseBaseUrl(this.page, this.config, courseKey);
    return this.base;
  }

  async goto(courseKey: string): Promise<void> {
    const base = await this.courseBase(courseKey);
    await this.page.goto(`${base}/custom-pages`);
    await this.page.locator(STUDIO_CUSTOM_PAGES_SELECTORS.ready).waitFor();
  }

  /** The rendered card titles, in display order. */
  async titles(): Promise<string[]> {
    return this.cardTitles.allInnerTexts();
  }

  /**
   * Drags the card at `fromIndex` down one position with the keyboard sensor, and
   * waits for the `reorder` write the drop fires. Anchored on the handle at that
   * index; the drop moves it past exactly one neighbour. A drag that fires no
   * write is cancelled and retried (`keyboardDrag`).
   */
  async dragCardDown(courseKey: string, fromIndex: number): Promise<void> {
    void courseKey;
    await keyboardDrag(this.page, this.dragHandles.nth(fromIndex), 'ArrowDown', 1, (drop) =>
      waitForWrite(
        this.page,
        {
          method: 'POST',
          predicate: (r) => r.url().includes(`${TABS_PATH}/`) && r.url().endsWith('/reorder'),
          timeout: DND_REORDER_TIMEOUT_MS,
        },
        drop,
      ),
    );
  }
}
