import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import type { CourseUnit } from '../api';

/**
 * A two-second, 64×36 VP8 clip — under 3 KB — served in place of a course's
 * HTML5 video sources. Regenerate with `node scripts/generate-video-clip.mjs`.
 */
const CLIP_PATH = path.join(__dirname, 'assets', 'short-clip.webm');
const CLIP_CONTENT_TYPE = 'video/webm';

let clipBytes: Buffer | undefined;

function clip(): Buffer {
  clipBytes ??= readFileSync(CLIP_PATH);
  return clipBytes;
}

/**
 * Answers every request for the HTML5 sources of the given units' videos with the
 * bundled clip, on the page's own network layer (routes apply inside the unit
 * iframe too).
 *
 * The demo course's one HTML5 video is hosted on a third-party bucket, and a
 * provider's own courses will point wherever their media lives. Neither should
 * decide whether the suite runs: a runner without that egress, or a bucket that
 * moves, would otherwise fail the completion coverage for reasons unrelated to
 * the platform. Only the **bytes** are swapped — the block, its player and the
 * platform's completion record are all the real thing, and a `<video>` element
 * plays a WebM behind an `.mp4` URL because browsers sniff the container.
 *
 * The clip's own length does not matter to what is under test: completion is a
 * fraction of the duration the player reads from the element, whatever it is.
 */
export async function stubVideoSources(page: Page, units: readonly CourseUnit[]): Promise<void> {
  const sources = new Set(units.flatMap((unit) => Object.values(unit.videoSources).flat()));
  for (const source of sources) {
    // Match on the URL up to its query: the player appends a cache-busting
    // timestamp to the source it puts on the element.
    const bare = source.split('?')[0] ?? source;
    await page.route(
      (url) => `${url.origin}${url.pathname}` === bare,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: CLIP_CONTENT_TYPE,
          body: clip(),
          // No range support: the whole clip is small enough to send at once, and
          // a `206` negotiation the stub does not honour would stall playback.
          headers: { 'Accept-Ranges': 'none' },
        }),
    );
  }
}
