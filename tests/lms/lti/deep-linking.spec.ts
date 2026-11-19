import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { LTI_CLAIM, fetchLtiAuthorView, type LtiLaunch } from '../../../src/api';
import { LtiDeepLinkPicker } from '../../../src/pages/lti-tool/deep-link-picker.page';
import { testId } from '../../../src/reporting';
import { seedReadyLtiBlock } from '../../../src/steps';
import { LTI_TAGS, launchOf, ltiLabel, ltiUnit, openUnitAs } from './helpers';

/**
 * Content selected in a tool through LTI Deep Linking (TC-00657): from the
 * block's preview in Studio the author launches the tool's picker and chooses a
 * resource; the platform stores it, and the learner's launch then targets it.
 * Choosing again replaces it.
 *
 * The UI drives the selection (Studio's link, the tool's picker). The block's
 * Studio view shows what the platform stored — the resource URL the tool
 * returned, which is the test tool's own — and the learner's launch, as the
 * tool received it, shows what is launched.
 */
test.describe('LTI 1.3 Deep Linking', { tag: [...LTI_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'an author selects a resource in the tool, and a learner launches it',
    { annotation: testId('TC-00657') },
    async (
      {
        page,
        config,
        contentCourse,
        studioAuthorSession,
        studioUnitPage,
        roundTripLearner,
        ltiTool,
      },
      testInfo,
    ) => {
      void studioAuthorSession;
      const { courseKey } = contentCourse;
      const unit = await ltiUnit(page.request, config, courseKey, ltiLabel('deep link', testInfo));
      // Deep linking launches only from a published block; seeding publishes.
      const { blockKey } = await seedReadyLtiBlock(page.request, config, ltiTool, unit.usageKey, {
        deepLinkingUrl: ltiTool.launchUrl,
      });
      const resourceUrl = (key: string) => `${ltiTool.launchUrl}?r=${key}`;

      /** The author picks `choice` in the tool; returns what the block's Studio view then shows. */
      const select = async (choice: string): Promise<string> => {
        await studioUnitPage.goto(unit.usageKey);
        const window = await studioUnitPage.openLtiDeepLinking(blockKey, ltiTool.oidcUrl);
        const picker = new LtiDeepLinkPicker(window);
        await picker.waitFor();
        const answer = await picker.choose(choice);
        expect(answer.status(), `the platform stores the tool's ${choice}`).toBe(200);
        await window.close();
        return fetchLtiAuthorView(page.request, config, blockKey);
      };
      /** The learner opens the unit; returns the launch the tool received (newer than `after`). */
      const launch = async (after?: LtiLaunch): Promise<LtiLaunch> => {
        await openUnitAs(roundTripLearner, courseKey, unit);
        await roundTripLearner.unitPage.ltiBlock(blockKey).waitForInlineLaunch();
        const received = await launchOf(ltiTool, blockKey, after);
        expect(received.error).toBeUndefined();
        expect(received).toMatchObject({ verified: true, messageType: 'LtiResourceLinkRequest' });
        return received;
      };

      expect(await select('a')).toContain(resourceUrl('a'));
      const first = await launch();
      expect(first.targetLinkUri).toBe(resourceUrl('a'));
      expect(first.claims[LTI_CLAIM.custom]).toMatchObject({ resource: 'a' });

      // Selecting again replaces the stored resource.
      const stored = await select('b');
      expect(stored).toContain(resourceUrl('b'));
      expect(stored).not.toContain(resourceUrl('a'));
      const second = await launch(first);
      expect(second.targetLinkUri).toBe(resourceUrl('b'));
      expect(second.claims[LTI_CLAIM.custom]).toMatchObject({ resource: 'b' });
    },
  );
});
