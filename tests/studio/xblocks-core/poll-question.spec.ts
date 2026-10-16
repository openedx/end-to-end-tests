/*
 * Poll question (`poll_question`) library → Studio → LMS tracer bullet.
 *
 * Steps 1–9 are the shared round trip in `./round-trip.ts`, with OLX for a
 * question and two answers (one non-ASCII, plan C1.5). Then, as the learner:
 *
 * 10. Assert the poll renders both answers (built by the block's own JS).
 * 11. Click the first answer; wait for the block's handler call to return 2xx;
 *     assert the results (stats) appear.
 * 12. Reload the unit and assert the vote persisted (that answer is still
 *     marked answered and results still show).
 */
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { ROUND_TRIP_TAGS, libraryToLearner, xml } from './round-trip';

test.describe('xblocks-core: Poll question', { tag: ROUND_TRIP_TAGS }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('library → Studio → learner votes', async ({
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
    const { learner, blockKey, courseKey, subsectionKey, unitKey } = await libraryToLearner(
      fx,
      testInfo,
      {
        blockType: 'poll_question',
        olx: (name) =>
          `<poll_question display_name="${xml(name)}"><p>Is this a test?</p>` +
          `<answer id="yes">Yes</answer><answer id="non_ascii">Ünïcødé</answer></poll_question>`,
        olxContains: ['id="yes"', 'Ünïcødé'],
      },
    );

    const poll = learner.unitPage.block(blockKey).locator('div.poll_question');
    const answers = poll.locator('.poll_answer');
    await expect(answers).toHaveCount(2);

    const [response] = await Promise.all([
      learner.page.waitForResponse((r) => r.url().includes(`${blockKey}/handler/`), {
        timeout: TIMEOUTS.navigation,
      }),
      answers.first().locator('.button').click(),
    ]);
    expect(response.ok()).toBe(true);
    await expect(answers.first().locator('.stats')).toBeVisible();

    await learner.unitPage.goto(courseKey, subsectionKey, unitKey);
    await expect(poll.locator('.poll_answer .button.answered')).toHaveCount(1);
    await expect(poll.locator('.poll_answer').first().locator('.stats')).toBeVisible();
  });
});
