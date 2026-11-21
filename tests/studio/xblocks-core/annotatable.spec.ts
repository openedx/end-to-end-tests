/*
 * Annotatable (`annotatable`) library → Studio → LMS tracer bullet.
 *
 * Steps 1–9 are the shared round trip in `./round-trip.ts`, with OLX holding
 * instructions and a passage with two annotations. Then, as the learner:
 *
 * 10. Assert the instructions render exactly once (plan C3.1 regression).
 * 11. Assert both annotations render as highlighted spans carrying their titles.
 */
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { ROUND_TRIP_TAGS, libraryToLearner, xml } from './round-trip';

test.describe('xblocks-core: Annotatable', { tag: [...ROUND_TRIP_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('library → Studio → learner sees annotations', async ({
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
    const instructions = `E2E instructions ${testInfo.testId}`;
    const { learner, blockKey } = await libraryToLearner(fx, testInfo, {
      blockType: 'annotatable',
      olx: (name) =>
        `<annotatable display_name="${xml(name)}">` +
        `<instructions><p>${xml(instructions)}</p></instructions>` +
        `<p>Some <annotation title="First" body="One" highlight="yellow">annotated</annotation>` +
        ` and <annotation title="Second" body="Two" highlight="green">more</annotation> text.</p>` +
        `</annotatable>`,
      olxContains: ['title="First"', 'title="Second"', instructions],
    });

    const block = learner.unitPage.annotatableBlock(blockKey);
    await expect(block.rendered).toBeVisible();
    await expect(block.rendered.getByText(instructions)).toHaveCount(1);
    await expect(block.annotations).toHaveCount(2);
  });
});
