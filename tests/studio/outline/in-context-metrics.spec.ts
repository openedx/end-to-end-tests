import { expect, test } from '../../../src/fixtures';
import { STUDIO_ANALYTICS_SELECTORS, TIMEOUTS } from '../../../src/config';
import { buildSection, publishXBlock } from '../../../src/api';
import { checkA11y } from '../../../src/a11y';
import { testId } from '../../../src/reporting';
import { ANALYTICS_LIST_PAGE_SIZE } from '../../../src/pages/studio/sidebar/analytics.block';
import { SIDEBAR_A11Y_BASELINE } from '../sidebar/helpers';

/**
 * Aspects' in-context metrics on the course outline (TC-00312–00314).
 *
 * A course staff member (a Studio colleague: the plugin's LMS calls need an LMS
 * session) opens the sidebar's Analytics page and the outline cards' Analytics
 * buttons. What decides each view is the LMS's answer: the in-context dashboard
 * config the sidebar asks for (`superset_in_context_dashboard/<key>`) and the
 * embed it then shows. The lists are asserted by the elements' own display
 * names. The charts' numbers are not: the sheet itself accepts "No results" for
 * elements nobody has used.
 */

const TAGS = [
  '@regression',
  '@studio',
  '@author',
  '@mfe-authoring',
  '@analytics',
  '@analytics-in-context',
];

test.describe('Aspects in-context metrics on the outline', { tag: [...TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    "the Analytics page shows the course's dashboard and lists its graded subsections, problems and videos",
    { annotation: testId('TC-00312') },
    async ({ page, config, analyticsCourse, inContextViewer }) => {
      // Six problems in all, so the problem list offers "Show more" past five.
      const extra = await buildSection(
        page.request,
        config,
        analyticsCourse.courseKey,
        `${analyticsCourse.displayName} more`,
        {
          subsections: [
            {
              gradedAs: 'Homework',
              units: [
                {
                  blocks: [
                    'multiplechoiceresponse',
                    'multiplechoiceresponse',
                    'multiplechoiceresponse',
                    'multiplechoiceresponse',
                  ],
                },
              ],
            },
          ],
        },
      );
      await publishXBlock(page.request, config, extra.usageKey);
      const sections = [analyticsCourse.section, extra];
      const graded = [
        analyticsCourse.section.subsections[0]!.displayName,
        extra.subsections[0]!.displayName,
      ];
      const problems = sections.flatMap((s) =>
        s.blocks.filter((b) => b.type === 'problem').map((b) => b.displayName),
      );
      const videos = sections.flatMap((s) =>
        s.blocks.filter((b) => b.type === 'video').map((b) => b.displayName),
      );

      const { colleague, outlinePage, analytics } = await inContextViewer(
        analyticsCourse.courseKey,
      );
      await outlinePage.goto(analyticsCourse.courseKey);
      const load = await analytics.open({ expectDashboard: true });

      // The course's own dashboard, filtered to the course.
      expect(load).toMatchObject({ key: analyticsCourse.courseKey, status: 200 });
      const src = decodeURIComponent(await analytics.embedSrc());
      expect(src).toContain(`/embedded/${load!.dashboard!.dashboardId}`);
      expect(src).toContain(analyticsCourse.courseKey);
      await expect(analytics.title).toHaveText(analyticsCourse.displayName);

      // Narrower than half the page.
      const width = (await analytics.panel.boundingBox())?.width ?? Infinity;
      expect(width).toBeLessThan((page.viewportSize()?.width ?? 0) / 2);

      // Graded subsections, problems (a page of them, then all six), videos.
      await expect(analytics.lists).toHaveCount(3);
      expect([...(await analytics.listNames(0))].sort()).toEqual([...graded].sort());
      expect(await analytics.listNames(1)).toHaveLength(ANALYTICS_LIST_PAGE_SIZE);
      await analytics.showMore(1);
      expect([...(await analytics.listNames(1))].sort()).toEqual([...problems].sort());
      await analytics.showLess(1);
      expect(await analytics.listNames(1)).toHaveLength(ANALYTICS_LIST_PAGE_SIZE);
      expect(await analytics.listNames(2)).toEqual(videos);
      await expect(analytics.showMoreToggle(2)).toHaveCount(0);

      // The sidebar around the embed; Superset's own markup is scanned on its pages.
      await checkA11y(colleague.page, {
        label: 'studio-analytics-outline',
        exclude: STUDIO_ANALYTICS_SELECTORS.embedContainer,
        additionalBaseline: SIDEBAR_A11Y_BASELINE,
      });
    },
  );

  test(
    "each element opens its own dashboard, and back returns to the course's",
    { annotation: testId('TC-00313') },
    async ({ analyticsCourse, inContextViewer }) => {
      const subsection = analyticsCourse.section.subsections[0]!;
      const problem = analyticsCourse.section.blocks.find(
        (b) => b.usageKey === analyticsCourse.problem.usageKey,
      )!;
      const video = analyticsCourse.section.blocks.find(
        (b) => b.usageKey === analyticsCourse.videoKey,
      )!;
      const { outlinePage, analytics } = await inContextViewer(analyticsCourse.courseKey);
      await outlinePage.goto(analyticsCourse.courseKey);
      const course = await analytics.open({ expectDashboard: true });

      const dashboards = [course!.dashboard!.dashboardId];
      for (const element of [
        { key: subsection.usageKey, name: subsection.displayName },
        { key: problem.usageKey, name: problem.displayName },
        { key: video.usageKey, name: video.displayName },
      ]) {
        const load = await analytics.drillInto(element.name);
        expect(load, element.name).toMatchObject({ key: element.key, status: 200 });
        expect(decodeURIComponent(await analytics.embedSrc())).toContain(
          `/embedded/${load.dashboard!.dashboardId}`,
        );
        dashboards.push(load.dashboard!.dashboardId);
        await analytics.back();
        await expect(analytics.title).toHaveText(analyticsCourse.displayName);
      }
      // Course, graded subsection, problem and video each have a dashboard of their own.
      expect(new Set(dashboards).size).toBe(4);
    },
  );

  test(
    'graded subsections and units with problems or videos carry an Analytics button',
    { annotation: testId('TC-00314') },
    async ({ analyticsCourse, inContextViewer }) => {
      const [graded, ungraded] = analyticsCourse.section.subsections;
      const [problemUnit, videoUnit] = graded!.units;
      const htmlUnit = ungraded!.units[0]!;
      const { outlinePage, analytics } = await inContextViewer(analyticsCourse.courseKey);
      await outlinePage.goto(analyticsCourse.courseKey);

      await expect(analytics.cardButton('subsection', graded!.displayName)).toHaveCount(1);
      await expect(analytics.cardButton('subsection', ungraded!.displayName)).toHaveCount(0);
      await expect(analytics.cardButton('unit', problemUnit!.displayName)).toHaveCount(1);
      await expect(analytics.cardButton('unit', videoUnit!.displayName)).toHaveCount(1);
      await expect(analytics.cardButton('unit', htmlUnit.displayName)).toHaveCount(0);
    },
  );

  test(
    "a card's Analytics button opens that subsection's or unit's analytics",
    { tag: '@analytics-in-context-cards', annotation: testId('TC-00314') },
    async ({ analyticsCourse, inContextViewer }) => {
      const graded = analyticsCourse.section.subsections[0]!;
      const problemUnit = graded.units[0]!;
      const { outlinePage, analytics } = await inContextViewer(analyticsCourse.courseKey);
      await outlinePage.goto(analyticsCourse.courseKey);

      // The subsection's button opens its dashboard; back returns to the course.
      const load = await analytics.openFromCard('subsection', graded.displayName, graded.usageKey);
      expect(load).toMatchObject({ key: graded.usageKey, status: 200 });
      await expect(analytics.title).toHaveText(graded.displayName);
      await analytics.back();
      await expect(analytics.title).toHaveText(analyticsCourse.displayName);

      // A unit's button lists its problems and videos under the unit's name.
      await analytics.openUnitFromCard(problemUnit.displayName);
      expect([...(await analytics.listNames(0))].sort()).toEqual(
        problemUnit.blocks.map((b) => b.displayName).sort(),
      );
    },
  );
});
