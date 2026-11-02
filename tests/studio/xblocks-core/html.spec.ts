/*
 * Text (`html`) library → Studio → LMS tracer bullet.
 *
 * Steps 1–9 are the shared round trip in `./round-trip.ts`, with OLX holding a
 * paragraph with a unique marker and a `/static/` image. Then, as the learner:
 *
 * 10. Assert the marker text renders inside the block.
 * 11. Assert the `/static/` image URL was rewritten to a course asset URL
 *     (regression plan C5 "/static/ URL rewriting").
 */
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { ROUND_TRIP_TAGS, libraryToLearner, xml } from './round-trip';

test.describe('xblocks-core: Text (html)', { tag: [...ROUND_TRIP_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('library → Studio → learner reads the text', async ({
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
    const marker = `E2E html body ${testInfo.testId}`;
    const { learner, blockKey } = await libraryToLearner(fx, testInfo, {
      blockType: 'html',
      olx: (name) =>
        `<html display_name="${xml(name)}"><p>${xml(marker)}</p>` +
        `<img src="/static/e2e-missing.png" alt="e2e"/></html>`,
      olxContains: [marker],
    });

    const block = learner.unitPage.block(blockKey);
    await expect(block.getByText(marker)).toBeVisible();
    await expect(block.locator('img[alt="e2e"]')).not.toHaveAttribute(
      'src',
      '/static/e2e-missing.png',
    );
  });
});
