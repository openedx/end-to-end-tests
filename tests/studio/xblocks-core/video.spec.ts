/*
 * Video (`video`) library → Studio → LMS tracer bullet.
 *
 * Steps 1–9 are the shared round trip in `./round-trip.ts`, with OLX for an
 * HTML5-only video (no YouTube ID) whose one source is a URL the learner's
 * browser has stubbed to serve the suite's 2-second WebM clip, and downloads
 * allowed; step 6 asserts the course copy carries the source and download flag.
 * Then, as the learner:
 *
 * 10. Assert the player's <video> element loads the clip (has a duration).
 * 11. Seek to just before the completion threshold and play; wait for the
 *     block's `publish_completion` handler to return 2xx.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { VideoBlock } from '../../../src/pages/lms/courseware/video.block';
import { ROUND_TRIP_TAGS, libraryToLearner, xml } from './round-trip';

const CLIP = readFileSync(path.join(__dirname, '../../../src/fixtures/assets/short-clip.webm'));

test.describe('xblocks-core: Video', { tag: [...ROUND_TRIP_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('library → Studio → learner watches to completion', async ({
    page,
    config,
    studioAuthorSession,
    resyncStudioAuthor,
    contentCourse,
    roundTripLearnerLater,
    studioUnitPage,
    libraryPicker,
  }, testInfo) => {
    void studioAuthorSession;
    const fx = {
      page,
      config,
      resyncStudioAuthor,
      contentCourse,
      roundTripLearnerLater,
      studioUnitPage,
      libraryPicker,
    };
    const source = `https://example.org/e2e-${testInfo.testId}.mp4`;
    const { learner, blockKey } = await libraryToLearner(fx, testInfo, {
      blockType: 'video',
      olx: (name) =>
        `<video display_name="${xml(name)}" youtube_id_1_0="" download_video="true">` +
        `<source src="${source}"/></video>`,
      olxContains: [source],
      courseMetadata: { html5_sources: [source], download_video: true },
      beforeLearnerVisit: async ({ page }) => {
        // Match up to the query: the player appends a cache-busting timestamp.
        await page.route(
          (url) => `${url.origin}${url.pathname}` === source,
          (route) =>
            route.fulfill({
              status: 200,
              contentType: 'video/webm',
              body: CLIP,
              headers: { 'Accept-Ranges': 'none' },
            }),
        );
      },
    });

    const video = new VideoBlock(learner.page, learner.unitPage.contentFrame, blockKey);
    await expect(video.video).toBeAttached();
    expect(await video.watchToEnd()).toBe(true);
  });
});
