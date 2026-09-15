import type { FrameLocator, Locator, Page } from '@playwright/test';

import { COURSEWARE_SELECTORS, TIMEOUTS, coursewareBlock } from '../../../config';

/**
 * Fraction of the video watched at which the platform records completion when
 * the block's own metadata does not say. Mirrors the video XBlock's default
 * `completion_percentage`.
 */
const DEFAULT_COMPLETION_PERCENTAGE = 0.95;

/**
 * Seconds short of the completion threshold to seek to. The player reports
 * completion from the first `timeupdate` at or beyond the threshold, and from
 * `ended`; starting playback just before the threshold crosses it within a frame
 * or two, whichever of the two the player is listening for.
 */
const BEFORE_THRESHOLD_SECONDS = 0.25;

/**
 * One video XBlock inside a unit's content iframe, when it plays an **HTML5
 * source**.
 *
 * The player is the platform's own JavaScript around a plain `<video>` element,
 * so the element can be driven directly: seek past the completion threshold,
 * play, and the platform's `publish_completion` call follows — the same call a
 * learner triggers by watching. Nothing here talks to the block's handlers
 * itself, so what is exercised is the platform's completion path, not a
 * re-implementation of it.
 *
 * A YouTube-only block renders a cross-origin iframe instead of a `<video>`; it
 * cannot be driven here, and the steps layer reports it rather than trying.
 * Actions only: the spec decides what completion means.
 */
export class VideoBlock {
  readonly root: Locator;
  readonly player: Locator;
  readonly video: Locator;

  constructor(
    private readonly page: Page,
    contentFrame: FrameLocator,
    readonly blockId: string,
  ) {
    this.root = contentFrame.locator(coursewareBlock(blockId));
    this.player = this.root.locator(COURSEWARE_SELECTORS.videoPlayer);
    this.video = this.player.locator(COURSEWARE_SELECTORS.videoElement);
  }

  /**
   * The fraction of the video that must be watched before the platform records
   * completion, read from the player's own `data-metadata`
   * (`completionPercentage`). Falls back to the XBlock default when absent.
   */
  async completionPercentage(): Promise<number> {
    const raw = await this.player.getAttribute('data-metadata');
    if (raw === null) {
      return DEFAULT_COMPLETION_PERCENTAGE;
    }
    try {
      const metadata = JSON.parse(raw) as { completionPercentage?: unknown };
      return typeof metadata.completionPercentage === 'number'
        ? metadata.completionPercentage
        : DEFAULT_COMPLETION_PERCENTAGE;
    } catch {
      return DEFAULT_COMPLETION_PERCENTAGE;
    }
  }

  /**
   * Waits until the `<video>` element knows its duration, and returns it in
   * seconds. Metadata arrives with the first bytes of the source, so this is a
   * bounded wait on the element's own `loadedmetadata` event rather than a sleep;
   * a source that never loads resolves to `0`, which the caller reports.
   */
  async waitForDuration(timeout: number = TIMEOUTS.action): Promise<number> {
    await this.video.waitFor({ state: 'attached', timeout });
    return this.video.evaluate(
      (element, budget) =>
        new Promise<number>((resolve) => {
          const video = element as HTMLVideoElement;
          if (Number.isFinite(video.duration) && video.duration > 0) {
            resolve(video.duration);
            return;
          }
          const timer = setTimeout(() => resolve(0), budget);
          const onReady = (): void => {
            clearTimeout(timer);
            resolve(Number.isFinite(video.duration) ? video.duration : 0);
          };
          video.addEventListener('loadedmetadata', onReady, { once: true });
          video.addEventListener('durationchange', onReady, { once: true });
          video.addEventListener('error', onReady, { once: true });
        }),
      timeout,
    );
  }

  /**
   * Watches the video "to the end" the way a learner's completion is measured:
   * seeks to just short of the completion threshold, then plays the remainder
   * muted (headless browsers refuse unmuted autoplay). The platform's own `timeupdate`/`ended`
   * handling then publishes completion. Resolves once the player's
   * `publish_completion` call for this block has been answered.
   *
   * Returns `false`, without waiting on completion, when the element never
   * reported a duration — the source did not load, so there is nothing to watch.
   */
  async watchToEnd(): Promise<boolean> {
    const duration = await this.waitForDuration();
    if (duration <= 0) {
      return false;
    }
    const threshold = duration * (await this.completionPercentage());

    // Listen before acting: a short clip can end, and publish, within the same
    // tick as the play() call.
    const published = this.page.waitForResponse(
      (response) =>
        response.url().includes(`/xblock/${this.blockId}/handler/`) &&
        response.url().includes('publish_completion') &&
        response.ok(),
      { timeout: TIMEOUTS.blockCompletion },
    );

    await this.video.evaluate(
      async (element, seekTo) => {
        const video = element as HTMLVideoElement;
        video.muted = true;
        video.currentTime = seekTo;
        await video.play();
      },
      Math.max(0, Math.min(threshold, duration) - BEFORE_THRESHOLD_SECONDS),
    );

    await published;
    return true;
  }
}
