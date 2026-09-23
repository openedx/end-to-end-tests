import { TIMEOUTS, VIEWPORTS, viewportUse } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { horizontalOverflow } from '../../../src/steps';

/**
 * The in-course outline tray below the desktop breakpoint (TC-00056,
 * TC-00057), from the one viewport table. Below `xl` (1200 px) the tray starts
 * closed and opens over the whole page; a unit chosen in it navigates there and
 * closes it again.
 *
 * On a phone the unit page is wider than the screen (`LEARN-003`: the course
 * tabs do not fold into their overflow menu), so that width's "fits the
 * screen" test is marked an expected failure.
 */
const LEARN_003 =
  'LEARN-003: the course tabs make the courseware page wider than a phone screen, so it scrolls sideways';

const CASES = [
  { viewport: VIEWPORTS.phone, caseId: 'TC-00056', overflowDefect: LEARN_003 },
  { viewport: VIEWPORTS.tablet, caseId: 'TC-00057', overflowDefect: undefined },
  { viewport: VIEWPORTS.smallDesktop, caseId: 'TC-00057', overflowDefect: undefined },
] as const;

for (const { viewport, caseId, overflowDefect } of CASES) {
  test.describe(`Courseware outline sidebar at ${viewport.name} width`, () => {
    test.use(viewportUse(viewport));
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'fits the unit to the screen',
      {
        tag: ['@regression', '@authenticated', '@mfe-learning', '@courseware-navigation-sidebar'],
        annotation: testId(caseId),
      },
      async ({ page, unitPage, courseOutline, enrolledCourse }) => {
        test.fail(overflowDefect !== undefined, overflowDefect);
        const unit = courseOutline.units[0]!;
        await unitPage.goto(enrolledCourse.courseKey, unit.sequentialId, unit.id);
        expect(await horizontalOverflow(page)).toBe(0);
      },
    );

    test(
      'opens over the page, collapses, and navigates to a unit',
      {
        tag: ['@regression', '@authenticated', '@mfe-learning', '@courseware-navigation-sidebar'],
        annotation: testId(caseId),
      },
      async ({ page, unitPage, courseOutline, enrolledCourse }) => {
        const unit = courseOutline.units[0]!;
        const next = courseOutline.units.find(
          (u) => u.sequentialId === unit.sequentialId && u.id !== unit.id,
        );
        expect(next, 'the first subsection has a second unit').toBeDefined();

        // The content takes the page; the tray waits behind its trigger.
        await unitPage.goto(enrolledCourse.courseKey, unit.sequentialId, unit.id);
        await expect(unitPage.iframe).toBeVisible();
        await expect(unitPage.sidebar).toHaveCount(0);

        await unitPage.expandSidebar();
        await expect(unitPage.sidebarFullScreen).toBeVisible();
        await unitPage.collapseSidebar();
        await expect(unitPage.sidebarFullScreen).toHaveCount(0);

        await unitPage.expandSidebar();
        await unitPage.openUnitFromSidebar(next!.id);
        expect(new URL(page.url()).pathname).toContain(next!.id);
        await expect(unitPage.sidebarFullScreen).toHaveCount(0);
      },
    );
  });
}
