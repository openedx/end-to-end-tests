/*
 * Problem (`problem`, CAPA) library → Studio → LMS tracer bullet.
 *
 * Steps 1–9 are the shared round trip in `./round-trip.ts`, with OLX for a
 * two-choice multiple-choice problem ("Yes" correct) with max_attempts=2 and
 * weight=3; step 2 asserts the library keeps both. (The course copy does not
 * inherit them: they are downstream-only customizable fields by design.) Then,
 * as the learner:
 *
 * 10. Assert the problem renders its two choices.
 * 11. Pick the correct choice and Submit; wait for `problem_check` to return 2xx.
 * 12. Assert the problem shows as correct (CAPA's own status markup).
 */
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { ProblemBlock } from '../../../src/pages/lms/courseware/problem.block';
import { ROUND_TRIP_TAGS, libraryToLearner, xml } from './round-trip';

test.describe('xblocks-core: Problem', { tag: ROUND_TRIP_TAGS }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('library → Studio → learner answers correctly', async ({
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
    const { learner, blockKey } = await libraryToLearner(fx, testInfo, {
      blockType: 'problem',
      olx: (name) =>
        `<problem display_name="${xml(name)}" max_attempts="2" weight="3">` +
        `<multiplechoiceresponse><label>Is this a test?</label>` +
        `<choicegroup type="MultipleChoice"><choice correct="true">Yes</choice>` +
        `<choice correct="false">No</choice></choicegroup></multiplechoiceresponse></problem>`,
      olxContains: ['max_attempts="2"', 'weight="3"'],
    });

    const problem = new ProblemBlock(learner.page, learner.unitPage.contentFrame, blockKey);
    expect(await problem.waitForControls(TIMEOUTS.navigation)).toBe(true);
    await expect(problem.radioOptions).toHaveCount(2);
    await problem.selectChoice(0);
    await problem.submit();
    await expect(
      problem.root.locator('.status.correct, .choicegroup_correct').first(),
    ).toBeVisible();
  });
});
