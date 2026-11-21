/*
 * PDF (`pdf`) library → Studio → LMS tracer bullet.
 *
 * Steps 1–9 are the shared round trip in `./round-trip.ts`, with OLX pointing
 * the block at a unique external PDF URL (a content-scoped field, so it is not
 * in the course copy's metadata; the learner check proves it carried over).
 * Then, as the learner:
 *
 * 10. Assert the PDF block renders and its embedded viewer's src is that URL.
 */
import { expect, test } from '../../../src/fixtures';
import { ADVANCED_BLOCK_SELECTORS, TIMEOUTS } from '../../../src/config';
import { ROUND_TRIP_TAGS, libraryToLearner, xml } from './round-trip';

test.describe('xblocks-core: PDF', { tag: [...ROUND_TRIP_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('library → Studio → learner sees the PDF viewer', async ({
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
    const url = `https://example.org/e2e-${testInfo.testId}.pdf`;
    const { learner, blockKey } = await libraryToLearner(fx, testInfo, {
      blockType: 'pdf',
      olx: (name) => `<pdf display_name="${xml(name)}" url="${url}" />`,
      olxContains: [url],
    });

    const pdf = learner.unitPage.advancedBlock(blockKey, 'pdf');
    await expect(pdf.rendered).toBeVisible();
    await expect(pdf.rendered.locator(ADVANCED_BLOCK_SELECTORS.embedFrame)).toHaveAttribute(
      'src',
      url,
    );
  });
});
