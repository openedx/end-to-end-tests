import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { waitForLearnerTopic } from '../../../src/steps';
import { testId } from '../../../src/reporting';

/**
 * Only one sidebar open at a time (TC-00053): in a unit with an in-context
 * discussion topic, opening the discussions sidebar on the right collapses the
 * course outline on the left, and opening the outline closes the discussions
 * sidebar. The sheet also names the learning MFE's "notifications" right
 * panel, which is its upgrade upsell and only shows for an upgradeable
 * enrollment; the discussions sidebar is the other right panel the sheet
 * names, and a free enrollment's only one.
 *
 * Both panels are read together in one poll, so a transition caught half-way
 * cannot fail the case spuriously.
 */
test.describe(
  'Courseware sidebars',
  {
    tag: [
      '@regression',
      '@studio',
      '@author',
      '@discussions',
      '@mfe-learning',
      '@courseware-navigation-sidebar',
    ],
  },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'opening one sidebar closes the other',
      { annotation: testId('TC-00053') },
      async ({ config, forumUnit, notificationRecipient }) => {
        const learner = await notificationRecipient();
        const { unitPage } = learner;
        // The discussions trigger appears once the unit's topic is offered to
        // this learner, which lags the publish (the block-structure rebuild).
        const offered = await waitForLearnerTopic(
          learner.request,
          config,
          forumUnit.courseKey,
          forumUnit.topicId,
        );
        expect(offered.satisfied, `topics offered: ${offered.last.join(', ')}`).toBe(true);
        await unitPage.goto(forumUnit.courseKey, forumUnit.sequentialId, forumUnit.unitId);
        await expect(unitPage.rightSidebarTriggers).toHaveCount(1);

        const panels = async () => ({
          outline: await unitPage.sidebar.isVisible(),
          discussions: await unitPage.discussionsSidebar.isVisible(),
        });
        await expect.poll(panels).toEqual({ outline: true, discussions: false });

        await unitPage.openDiscussionsSidebar();
        await expect.poll(panels).toEqual({ outline: false, discussions: true });
        await expect(unitPage.activeRightSidebarTrigger).toBeVisible();

        await unitPage.toggleOutline();
        await expect.poll(panels).toEqual({ outline: true, discussions: false });
      },
    );
  },
);
