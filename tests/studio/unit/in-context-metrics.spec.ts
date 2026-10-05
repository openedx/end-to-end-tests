import { expect, test } from '../../../src/fixtures';
import { STUDIO_ANALYTICS_SELECTORS, TIMEOUTS } from '../../../src/config';
import { checkA11y } from '../../../src/a11y';
import { knownGap, testId } from '../../../src/reporting';
import { SIDEBAR_A11Y_BASELINE } from '../sidebar/helpers';

/**
 * Aspects' in-context metrics on the unit page (TC-00315, TC-00316, and the
 * sheet's unnumbered "drill into problem analytics" row).
 *
 * A course staff member (a Studio colleague: the plugin's LMS calls need an LMS
 * session) opens the unit page's Analytics sidebar. It lists the unit's problems
 * and videos by their own display names, or says there is nothing to show; an
 * element opens its dashboard, which the LMS's in-context config decides.
 */

const TAGS = [
  '@regression',
  '@studio',
  '@author',
  '@mfe-authoring',
  '@analytics',
  '@analytics-in-context',
];

test.describe('Aspects in-context metrics on the unit page', { tag: [...TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    "the unit's Analytics lists its problems and videos, or says there are none, and closes",
    { annotation: testId('TC-00315') },
    async ({ analyticsCourse, inContextViewer }) => {
      const [graded, ungraded] = analyticsCourse.section.subsections;
      const problemUnit = graded!.units[0]!;
      const htmlUnit = ungraded!.units[0]!;
      const { colleague, unitPage, analytics, sidebar } = await inContextViewer(
        analyticsCourse.courseKey,
      );

      await unitPage.goto(problemUnit.usageKey);
      await analytics.open({ expectDashboard: false });
      await expect(analytics.title).toHaveText(problemUnit.displayName);
      expect([...(await analytics.listNames(0))].sort()).toEqual(
        problemUnit.blocks.map((b) => b.displayName).sort(),
      );
      await checkA11y(colleague.page, {
        label: 'studio-analytics-unit',
        exclude: STUDIO_ANALYTICS_SELECTORS.embedContainer,
        additionalBaseline: SIDEBAR_A11Y_BASELINE,
      });

      await unitPage.goto(htmlUnit.usageKey);
      await analytics.open({ expectDashboard: false });
      await expect(analytics.title).toHaveText(htmlUnit.displayName);
      await expect(analytics.emptyState).toBeVisible();
      await expect(analytics.lists).toHaveCount(0);

      await sidebar.collapse();
      await expect(analytics.panel).toBeHidden();
    },
  );

  test(
    "a video opens its dashboard from the unit's Analytics, and back returns",
    { annotation: testId('TC-00316') },
    async ({ analyticsCourse, inContextViewer }) => {
      const videoUnit = analyticsCourse.section.subsections[0]!.units[1]!;
      const video = videoUnit.blocks.find((b) => b.usageKey === analyticsCourse.videoKey)!;
      const { unitPage, analytics } = await inContextViewer(analyticsCourse.courseKey);
      await unitPage.goto(videoUnit.usageKey);
      await analytics.open({ expectDashboard: false });

      const load = await analytics.drillInto(video.displayName);
      expect(load).toMatchObject({ key: video.usageKey, status: 200 });
      expect(decodeURIComponent(await analytics.embedSrc())).toContain(
        `/embedded/${load.dashboard!.dashboardId}`,
      );
      await analytics.back();
      await expect(analytics.title).toHaveText(videoUnit.displayName);
    },
  );

  test(
    "a text and a numeric problem open their dashboards from the unit's Analytics",
    {
      annotation: knownGap(
        'The sheet row after TC-00316 ("Drill into Problem Analytics from Unit Sidebar") has no test id yet',
      ),
    },
    async ({ analyticsCourse, inContextViewer }) => {
      const problemUnit = analyticsCourse.section.subsections[0]!.units[0]!;
      const { unitPage, analytics } = await inContextViewer(analyticsCourse.courseKey);
      await unitPage.goto(problemUnit.usageKey);
      await analytics.open({ expectDashboard: false });

      const dashboards: string[] = [];
      // The unit's multiple-choice problem (a non-numeric answer), then its numerical one.
      for (const problem of problemUnit.blocks) {
        const load = await analytics.drillInto(problem.displayName);
        expect(load, problem.displayName).toMatchObject({ key: problem.usageKey, status: 200 });
        dashboards.push(load.dashboard!.dashboardId);
        await analytics.back();
        await expect(analytics.title).toHaveText(problemUnit.displayName);
      }
      // Both are problems: the same problem dashboard, filtered to each.
      expect(new Set(dashboards).size).toBe(1);
    },
  );
});
