import type { Locator, Page } from '@playwright/test';

import { STUDIO_CUSTOM_PAGES_SELECTORS, type AppConfig } from '../../../config';
import { TABS_PATH } from '../../../api';
import { authoringCourseBaseUrl } from '../authoring-base';
import { waitForWrite } from '../wait-for-write';

/**
 * Animation frames yielded between dnd-kit keyboard-drag steps. Its keyboard
 * sensor needs a few frames to accept the next key after the lift; 5 was the
 * measured floor, so 6 leaves a margin.
 */
const DND_SETTLE_FRAMES = 6;

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
   * index; the drop moves it past exactly one neighbour.
   */
  async dragCardDown(courseKey: string, fromIndex: number): Promise<void> {
    const handle = this.dragHandles.nth(fromIndex);
    await handle.focus();
    // Space lifts the item, an Arrow advances it one position, Space drops it.
    // dnd-kit's keyboard sensor advances one step per render frame and exposes no
    // DOM/ARIA "ready to move" signal — `aria-pressed` and its live-region
    // announcement both fire before it will accept an arrow key (measured). So
    // after confirming the lift we yield a few animation frames — the unit dnd-kit
    // actually works in — between the steps, rather than pause a wall-clock time.
    await this.page.keyboard.press('Space');
    await this.page.locator(STUDIO_CUSTOM_PAGES_SELECTORS.liftedHandle).waitFor();
    await this.settleFrames();
    await this.page.keyboard.press('ArrowDown');
    await this.settleFrames();

    await waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().includes(`${TABS_PATH}/`) && r.url().endsWith('/reorder'),
      },
      () => this.page.keyboard.press('Space'),
    );
  }

  /**
   * Resolves after `frames` animation frames have rendered — the settle dnd-kit's
   * keyboard sensor needs between key steps, tied to the browser's render loop
   * rather than a fixed duration.
   */
  private settleFrames(frames = DND_SETTLE_FRAMES): Promise<void> {
    return this.page.evaluate(
      (count) =>
        new Promise<void>((resolve) => {
          let seen = 0;
          const step = (): void => {
            seen += 1;
            if (seen >= count) resolve();
            else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
      frames,
    );
  }
}
