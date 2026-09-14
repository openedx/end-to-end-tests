import { errors, type Locator, type Page } from '@playwright/test';

import { STUDIO_CUSTOM_PAGES_SELECTORS, type AppConfig } from '../../../config';
import { TABS_PATH } from '../../../api';
import { authoringCourseBaseUrl } from '../authoring-base';
import { waitForWrite } from '../wait-for-write';

/**
 * Animation frames to yield after the lift (and after the Arrow) to give dnd-kit's
 * keyboard sensor a chance to measure the list before the next key — tied to the
 * render loop, not a wall-clock pause. Best-effort only: the whole drag is retried
 * when it does not take, so this just keeps the common case to one attempt.
 */
const DND_SETTLE_FRAMES = 6;

/**
 * How many times to run the whole lift→Arrow→drop before giving up. dnd-kit's
 * keyboard sensor silently drops an Arrow pressed before it has measured the list
 * (an unbounded delay under CI load), so the drop then reorders nothing and fires
 * no write; the only reliable "it worked" signal is the `reorder` request itself,
 * so a drag that produces none is cancelled (Escape) and retried.
 */
const DND_DRAG_ATTEMPTS = 4;

/**
 * How long one drag attempt waits for its `reorder` write before treating the move
 * as lost and retrying. Comfortably longer than the request itself, so only a drag
 * that truly reordered nothing times out — a real reorder posts at once, well
 * inside this, so a retry never follows a slow-but-successful drop (no double move).
 */
const DND_REORDER_TIMEOUT_MS = 5_000;

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
    // Run the whole lift→Arrow→drop, judged by the `reorder` write it must fire;
    // if none comes the Arrow was dropped before the sensor was ready, so cancel and
    // retry. A drag that failed reordered nothing, so a retry starts from the same
    // order — never a double move.
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.attemptDragCardDown(fromIndex);
        return;
      } catch (error) {
        const lost = error instanceof errors.TimeoutError;
        if (!lost || attempt + 1 >= DND_DRAG_ATTEMPTS) {
          if (lost) {
            throw new Error(
              `dnd-kit produced no reorder after ${DND_DRAG_ATTEMPTS} drag attempts on the card ` +
                `at index ${fromIndex}.`,
              { cause: error },
            );
          }
          throw error;
        }
        // Cancel the in-flight drag and wait for it to end before retrying.
        await this.page.keyboard.press('Escape');
        await this.page
          .locator(STUDIO_CUSTOM_PAGES_SELECTORS.liftedHandle)
          .waitFor({ state: 'detached' })
          .catch(() => undefined);
      }
    }
  }

  /**
   * One keyboard-drag of the card at `fromIndex` down past its neighbour: Space
   * lifts, an Arrow advances it, Space drops. Waits for the `reorder` write the drop
   * fires — and throws {@link errors.TimeoutError} when it does not, which
   * {@link dragCardDown} treats as a lost Arrow and retries.
   */
  private async attemptDragCardDown(fromIndex: number): Promise<void> {
    const handle = this.dragHandles.nth(fromIndex);
    await handle.focus();
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
        timeout: DND_REORDER_TIMEOUT_MS,
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
