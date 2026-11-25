import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import type { AdminLmsRunner } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  allowLtiPiiSharing,
  type AuthoredUnit,
  type Lti13Settings,
  type LtiLaunch,
} from '../../../src/api';
import type { LtiToolSession } from '../../../src/lti-tools';
import { disputed, testId } from '../../../src/reporting';
import { seedReadyLtiBlock } from '../../../src/steps';
import { LTI_TAGS, launchFrom, launchOf, ltiLabel, ltiUnit, openUnitAs } from './helpers';

/**
 * Personal-data sharing and the learner's consent (TC-00660): with the site
 * operator's per-course permission, an LTI block can send the learner's
 * username, full name and email to the tool — each only when the author turns
 * it on, and only after the learner agrees in the block's prompt.
 *
 * The UI drives the consent; what the tool received decides which values were
 * sent. Blocks open the tool in a new window, where the prompt offers both OK
 * and Cancel and the author's data-sharing notice shows above the button.
 */

/** The three fields, the block setting that shares each, and the claim it arrives as. */
const FIELDS = [
  { field: 'username', setting: 'username', claim: 'preferred_username' },
  { field: 'full name', setting: 'fullName', claim: 'name' },
  { field: 'email', setting: 'email', claim: 'email' },
] as const;

const NOTICE = 'E2E data-sharing notice: this tool receives what you agree to share.';

/**
 * The operator allows sharing in the course, and the author seeds a block in a
 * unit of the test's own.
 */
async function sharingBlock(
  author: APIRequestContext,
  config: AppConfig,
  adminLms: AdminLmsRunner,
  tool: LtiToolSession,
  courseKey: string,
  label: string,
  settings: Pick<Lti13Settings, 'askToSend' | 'launchTarget' | 'description'>,
): Promise<{ unit: AuthoredUnit; blockKey: string }> {
  await adminLms((admin) => allowLtiPiiSharing(admin, config, courseKey));
  const unit = await ltiUnit(author, config, courseKey, label);
  const { blockKey } = await seedReadyLtiBlock(author, config, tool, unit.usageKey, settings);
  return { unit, blockKey };
}

test.describe('LTI 1.3 personal-data sharing', { tag: [...LTI_TAGS, '@lti-tool-claims'] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'with no field shared, the tool launches without a prompt and receives none of them',
    { annotation: testId('TC-00660') },
    async (
      { page, config, adminLms, contentCourse, studioAuthorSession, roundTripLearner, ltiTool },
      testInfo,
    ) => {
      void studioAuthorSession;
      const { courseKey } = contentCourse;
      const { unit, blockKey } = await sharingBlock(
        page.request,
        config,
        adminLms,
        ltiTool,
        courseKey,
        ltiLabel('pii none', testInfo),
        {
          launchTarget: 'new_window',
          askToSend: { username: false, fullName: false, email: false },
        },
      );
      await openUnitAs(roundTripLearner, courseKey, unit, ltiTool);
      // The button opens the tool's window straight away: a prompt in front of
      // it would leave the launch waiting for a window that never opens.
      const launch = await launchFrom(ltiTool, roundTripLearner.unitPage, blockKey, 'new_window');

      expect(launch.verified).toBe(true);
      for (const { claim } of FIELDS) expect(launch.claims, claim).not.toHaveProperty(claim);
    },
  );

  for (const { field, setting, claim } of FIELDS) {
    test(
      `with only the ${field} shared, the learner agrees first and the tool receives only it`,
      {
        annotation: [
          testId('TC-00660'),
          disputed(
            'The data-sharing notice renders above the launch button (new-window and modal ' +
              'launches only), not inside the consent prompt; the prompt names the fields ' +
              'being sent. The sheet should say the notice shows next to the launch button.',
          ),
        ],
      },
      async (
        { page, config, adminLms, contentCourse, studioAuthorSession, roundTripLearner, ltiTool },
        testInfo,
      ) => {
        void studioAuthorSession;
        const { courseKey } = contentCourse;
        const { unit, blockKey } = await sharingBlock(
          page.request,
          config,
          adminLms,
          ltiTool,
          courseKey,
          ltiLabel(`pii ${setting}`, testInfo),
          { launchTarget: 'new_window', askToSend: { [setting]: true }, description: NOTICE },
        );
        await openUnitAs(roundTripLearner, courseKey, unit, ltiTool);
        const block = roundTripLearner.unitPage.ltiBlock(blockKey);
        // The author's own notice, beside the launch button.
        await expect(block.notice).toHaveText(NOTICE);

        // The button asks first: no window opens on the tool before the learner agrees.
        const windows = roundTripLearner.context.pages().length;
        await block.requestNewWindowLaunch();
        await expect(block.consentPrompt).toBeVisible();
        await expect(block.consentCancel).toBeVisible();

        const window = await block.agreeAndOpenWindow();
        // The window agreeing opened is the only new one: the request alone opened none.
        expect(roundTripLearner.context.pages()).toHaveLength(windows + 1);
        let launch: LtiLaunch;
        try {
          launch = await launchOf(ltiTool, blockKey, { surface: window });
        } finally {
          await window.close();
        }
        expect(launch.verified).toBe(true);
        const { identity } = roundTripLearner;
        const expected = {
          preferred_username: identity.username,
          name: identity.name,
          email: identity.email,
        };
        expect(launch.claims[claim]).toBe(expected[claim]);
        for (const other of FIELDS.filter((f) => f.claim !== claim)) {
          expect(launch.claims, other.claim).not.toHaveProperty(other.claim);
        }
      },
    );
  }

  test(
    'a learner who cancels the prompt sends nothing and opens no tool',
    { annotation: testId('TC-00660') },
    async (
      { page, config, adminLms, contentCourse, studioAuthorSession, roundTripLearner, ltiTool },
      testInfo,
    ) => {
      void studioAuthorSession;
      const { courseKey } = contentCourse;
      const { unit, blockKey } = await sharingBlock(
        page.request,
        config,
        adminLms,
        ltiTool,
        courseKey,
        ltiLabel('pii cancel', testInfo),
        { launchTarget: 'new_window', askToSend: { email: true } },
      );
      await openUnitAs(roundTripLearner, courseKey, unit, ltiTool);
      const block = roundTripLearner.unitPage.ltiBlock(blockKey);
      const windows = roundTripLearner.context.pages().length;

      await block.requestNewWindowLaunch();
      await block.decline();

      // The sentinel: ask again and agree. Its window is the only new one, so
      // the cancelled request opened none, and no launch reached the tool.
      await block.requestNewWindowLaunch();
      const window = await block.agreeAndOpenWindow();
      try {
        expect(roundTripLearner.context.pages()).toHaveLength(windows + 1);
        const launch = await launchOf(ltiTool, blockKey, { surface: window });
        expect(launch.verified).toBe(true);
      } finally {
        await window.close();
      }
    },
  );

  test(
    'an inline launch waits for the learner to agree, then sends the shared field',
    { tag: '@lti-tool-inline', annotation: testId('TC-00660') },
    async (
      { page, config, adminLms, contentCourse, studioAuthorSession, roundTripLearner, ltiTool },
      testInfo,
    ) => {
      void studioAuthorSession;
      const { courseKey } = contentCourse;
      const { unit, blockKey } = await sharingBlock(
        page.request,
        config,
        adminLms,
        ltiTool,
        courseKey,
        ltiLabel('pii inline', testInfo),
        { launchTarget: 'iframe', askToSend: { email: true } },
      );
      await openUnitAs(roundTripLearner, courseKey, unit, ltiTool);
      const block = roundTripLearner.unitPage.ltiBlock(blockKey);

      // Inline, the prompt is there from the start and offers only OK; the
      // launch frame is not pointed at the tool until the learner agrees.
      await expect(block.consentPrompt).toBeVisible();
      await expect(block.consentCancel).toHaveCount(0);
      await expect(block.startedLaunchFrame).toHaveCount(0);

      await block.agree();
      await block.waitForInlineLaunch();
      const launch = await launchOf(ltiTool, blockKey, { surface: block.launchFrame });
      expect(launch.claims.email).toBe(roundTripLearner.identity.email);
    },
  );
});
