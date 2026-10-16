/*
 * Word Cloud (`word_cloud`) library → Studio → LMS tracer bullet.
 *
 * Steps 1–9 are the shared round trip in `./round-trip.ts`, with OLX setting
 * num_inputs=3, num_top_words=7, display_student_percents=false. Step 2 asserts
 * those persist (display_student_percents as the boolean "false"); step 6 that
 * the course copy carries them. Then, as the learner:
 *
 * 10. Assert the word cloud renders exactly 3 inputs (built by the block's own
 *     JS, so this proves its static assets loaded).
 * 11. Type three words (one unicode) and click Save; `handle_submit_state`
 *     returns 2xx.
 * 12. Call `handle_get_state` and assert exactly those three words were recorded.
 */
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { fetchWordCloudState } from '../../../src/api';
import { ROUND_TRIP_TAGS, libraryToLearner, xml } from './round-trip';

test.describe('xblocks-core: Word Cloud', { tag: ROUND_TRIP_TAGS }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('library → Studio → learner submits words', async ({
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
    const instructions = `Name three things ${testInfo.testId}`;
    const { learner, blockKey, courseKey } = await libraryToLearner(fx, testInfo, {
      blockType: 'word_cloud',
      olx: (name) =>
        `<word_cloud display_name="${xml(name)}" instructions="${xml(instructions)}"` +
        ` num_inputs="3" num_top_words="7" display_student_percents="false" />`,
      olxContains: ['num_inputs="3"', 'num_top_words="7"', 'display_student_percents="false"'],
      courseMetadata: {
        instructions,
        num_inputs: 3,
        num_top_words: 7,
        display_student_percents: false,
      },
    });

    const cloud = learner.unitPage.wordCloudBlock(blockKey);
    await expect(cloud.rendered).toBeVisible();
    await expect(cloud.inputs).toHaveCount(3);

    const words = ['alpha', 'bravo', `ünïcødé${Date.now()}`];
    expect((await cloud.submit(words)).ok()).toBe(true);

    const state = await fetchWordCloudState(learner.request, fx.config, courseKey, blockKey);
    expect(state.submitted).toBe(true);
    expect(Object.keys(state.studentWords).sort()).toEqual([...words].sort());
  });
});
