/*
 * LTI 1.1 (`lti`) library → Studio → LMS tracer bullet.
 *
 * Steps 1–9 are the shared round trip in `./round-trip.ts`, with OLX for an LTI
 * component with an LTI ID, a launch URL and open-in-new-page on; step 6 asserts
 * the course copy carries them. No real tool is launched. Then, as the learner:
 *
 * 10. Assert the LTI block renders its wrapper and a launch link (new-page mode
 *     renders a link rather than an iframe).
 */
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { ROUND_TRIP_TAGS, libraryToLearner, xml } from './round-trip';

test.describe('xblocks-core: LTI', { tag: ROUND_TRIP_TAGS }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('library → Studio → learner sees the launch', async ({
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
    const launchUrl = `https://example.org/e2e-lti-${testInfo.testId}`;
    const { learner, blockKey } = await libraryToLearner(fx, testInfo, {
      blockType: 'lti',
      olx: (name) =>
        `<lti display_name="${xml(name)}" lti_id="e2e" launch_url="${launchUrl}"` +
        ` open_in_a_new_page="true" />`,
      olxContains: ['lti_id="e2e"', launchUrl],
      courseMetadata: { lti_id: 'e2e', launch_url: launchUrl, open_in_a_new_page: true },
    });

    const lti = learner.unitPage.block(blockKey).locator('div.lti-wrapper');
    await expect(lti).toBeVisible();
    await expect(lti.locator('a.link_lti_new_window, a[target="_blank"]').first()).toBeVisible();
  });
});
