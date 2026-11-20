import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { LTI_CLAIM, readLtiDeepLinkedItems, type LtiLaunch } from '../../../src/api';
import type { LtiDeepLinkChoice } from '../../../src/lti-tools';
import { testId } from '../../../src/reporting';
import { seedReadyLtiBlock } from '../../../src/steps';
import { LTI_TAGS, launchFrom, launchTargetFor, ltiLabel, ltiUnit, openUnitAs } from './helpers';

/**
 * Content selected in a tool through LTI Deep Linking (TC-00657): from the
 * block's preview in Studio the author launches the tool's picker and chooses a
 * resource; the platform stores it, and the learner's launch then targets it.
 * Choosing again replaces it.
 *
 * The UI drives the selection (Studio's link, the tool's own picker, through
 * the tool provider). The block's Studio view shows what the platform stored,
 * and the learner's launch, as the tool received it, shows what is launched:
 * both are compared with the resource the tool sent — its `custom` parameters,
 * and its URL where the tool gives each resource its own.
 */
test.describe(
  'LTI 1.3 Deep Linking',
  {
    tag: [...LTI_TAGS, '@lti-tool-deep-linking', '@lti-tool-claims'],
  },
  () => {
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
        const unit = await ltiUnit(
          page.request,
          config,
          courseKey,
          ltiLabel('deep link', testInfo),
        );
        // Deep linking launches only from a published block; seeding publishes.
        const target = launchTargetFor(ltiTool);
        const { blockKey } = await seedReadyLtiBlock(page.request, config, ltiTool, unit.usageKey, {
          deepLinkingUrl: ltiTool.deepLinkingUrl,
          launchTarget: target,
        });
        await ltiTool.admit(page.context());

        /** The author picks `choice` in the tool from Studio; returns what the tool sent. */
        const select = async (choice: 'a' | 'b'): Promise<LtiDeepLinkChoice> => {
          await studioUnitPage.goto(unit.usageKey);
          const window = await studioUnitPage.openLtiDeepLinking(blockKey, ltiTool.oidcUrl);
          try {
            const picked = await ltiTool.chooseDeepLink(window, choice);
            expect(picked.answerStatus, `the platform stores the tool's ${choice}`).toBe(200);
            return picked;
          } finally {
            await window.close();
          }
        };
        /** What the platform stored for the block, as its Studio view shows it. */
        const stored = () => readLtiDeepLinkedItems(page.request, config, blockKey);
        /** The learner opens the unit; returns the launch the tool received (newer than `after`). */
        const launch = async (after?: LtiLaunch): Promise<LtiLaunch> => {
          await openUnitAs(roundTripLearner, courseKey, unit, ltiTool);
          const received = await launchFrom(
            ltiTool,
            roundTripLearner.unitPage,
            blockKey,
            target,
            after,
          );
          expect(received.error).toBeUndefined();
          expect(received).toMatchObject({ verified: true, messageType: 'LtiResourceLinkRequest' });
          return received;
        };

        const a = await select('a');
        expect(await stored()).toEqual([
          expect.objectContaining({ custom: expect.objectContaining(a.custom) }),
        ]);
        const first = await launch();
        expect(first.claims[LTI_CLAIM.custom]).toMatchObject(a.custom);
        // A resource without a URL of its own launches at the block's launch URL.
        expect(first.targetLinkUri).toBe(a.url ?? ltiTool.launchUrl);

        // Selecting again replaces the stored resource.
        const b = await select('b');
        expect(b.custom).not.toEqual(a.custom);
        expect(await stored()).toEqual([
          expect.objectContaining({ custom: expect.objectContaining(b.custom) }),
        ]);
        const second = await launch(first);
        expect(second.claims[LTI_CLAIM.custom]).toMatchObject(b.custom);
        expect(second.targetLinkUri).toBe(b.url ?? ltiTool.launchUrl);
      },
    );
  },
);
