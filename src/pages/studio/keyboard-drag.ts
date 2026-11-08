import { errors, type Locator, type Page, type Response } from '@playwright/test';

import { STUDIO_SHELL_SELECTORS } from '../../config';

/**
 * Animation frames to yield after the lift (and after each Arrow) to give dnd-kit's
 * keyboard sensor a chance to measure the list before the next key — tied to the
 * render loop, not a wall-clock pause. Best-effort only: the whole drag is retried
 * when it does not take, so this just keeps the common case to one attempt.
 */
const DND_SETTLE_FRAMES = 6;

/**
 * How many times to run the whole lift→Arrow→drop before giving up. dnd-kit's
 * keyboard sensor silently drops an Arrow pressed before it has measured the list
 * (an unbounded delay under CI load), so the drop then reorders nothing and fires
 * no write; the only reliable "it worked" signal is the reorder request itself,
 * so a drag that produces none is cancelled (Escape) and retried.
 */
const DND_DRAG_ATTEMPTS = 4;

/**
 * How long one drag attempt waits for its reorder write before treating the move
 * as lost and retrying. Comfortably longer than the request itself, so only a drag
 * that truly reordered nothing times out — a real reorder posts at once, well
 * inside this, so a retry never follows a slow-but-successful drop (no double move).
 */
export const DND_REORDER_TIMEOUT_MS = 5_000;

const LIFTED_HANDLE = STUDIO_SHELL_SELECTORS.dndLiftedHandle;

/**
 * Drags a dnd-kit sortable with the keyboard sensor — focus `handle`, Space to
 * lift, `steps` presses of `key`, Space to drop — and returns the reorder write
 * the drop fires, which `awaitDrop` waits for (it receives the drop action and
 * must throw {@link errors.TimeoutError} within {@link DND_REORDER_TIMEOUT_MS}
 * when no write comes). A drag that fires none was lost to the sensor's
 * measuring delay and reordered nothing, so it is cancelled and retried — never a
 * double move. Far more reliable than synthesising pointer drags against dnd-kit.
 */
export async function keyboardDrag(
  page: Page,
  handle: Locator,
  key: 'ArrowUp' | 'ArrowDown',
  steps: number,
  awaitDrop: (drop: () => Promise<void>) => Promise<Response>,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await handle.focus();
      await page.keyboard.press('Space');
      await page.locator(LIFTED_HANDLE).waitFor();
      await settleFrames(page);
      for (let i = 0; i < steps; i += 1) {
        await page.keyboard.press(key);
        await settleFrames(page);
      }
      return await awaitDrop(() => page.keyboard.press('Space'));
    } catch (error) {
      const lost = error instanceof errors.TimeoutError;
      if (!lost || attempt + 1 >= DND_DRAG_ATTEMPTS) {
        if (lost) {
          throw new Error(`dnd-kit produced no reorder after ${DND_DRAG_ATTEMPTS} drag attempts.`, {
            cause: error,
          });
        }
        throw error;
      }
      // Cancel the in-flight drag and wait for it to end before retrying.
      await page.keyboard.press('Escape');
      await page
        .locator(LIFTED_HANDLE)
        .waitFor({ state: 'detached' })
        .catch(() => undefined);
    }
  }
}

/**
 * Resolves after `frames` animation frames have rendered — the settle dnd-kit's
 * keyboard sensor needs between key steps, tied to the browser's render loop
 * rather than a fixed duration.
 */
function settleFrames(page: Page, frames = DND_SETTLE_FRAMES): Promise<void> {
  return page.evaluate(
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
