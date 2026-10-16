/*
 * Discussion (`discussion`) library → Studio → LMS tracer bullet.
 *
 * Steps 1–9 are the shared round trip in `./round-trip.ts`, with OLX setting a
 * discussion category and target; step 6 asserts the course copy carries them.
 * Then, as the learner:
 *
 * 10. Assert the block's wrapper is in the unit. Whether it shows inline content
 *     depends on the course's discussion provider: `legacy` renders
 *     `.discussion-module`; `openedx` renders nothing inline (plan C8.9) and uses
 *     the sidebar instead. Either is accepted here; a server error is not.
 */
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { ROUND_TRIP_TAGS, libraryToLearner, xml } from './round-trip';

test.describe('xblocks-core: Discussion', { tag: ROUND_TRIP_TAGS }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('library → Studio → learner unit renders', async ({
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
    const category = `E2E ${testInfo.testId.slice(-6)}`;
    const { learner, blockKey } = await libraryToLearner(fx, testInfo, {
      blockType: 'discussion',
      olx: (name) =>
        `<discussion display_name="${xml(name)}" discussion_category="${xml(category)}"` +
        ` discussion_target="Tracer" />`,
      olxContains: [`discussion_category="${category}"`],
      courseMetadata: { discussion_category: category, discussion_target: 'Tracer' },
    });

    const block = learner.unitPage.block(blockKey);
    await expect(block).toBeAttached();
    await expect(block.locator('.xblock-error, .xmodule_error')).toHaveCount(0);
  });
});
