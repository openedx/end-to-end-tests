import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { testId } from '../../../src/reporting';
import { completeUnit } from '../../../src/steps';

/**
 * The in-course outline sidebar (the learning MFE's navigation tray).
 *
 * Gated on `@courseware-navigation-sidebar`: the tray is behind the
 * `courseware.enable_navigation_sidebar` waffle flag, and an installation that
 * runs the older in-course navigation instead declares
 * `courseware-legacy-navigation` — the two are mutually exclusive, so this
 * coverage skips cleanly where the surface does not exist.
 *
 * BTR TC-00048 ("active unit highlighted") is deliberately absent: this platform
 * version marks the active unit visually only — no `aria-current`, no
 * selected-state class — so there is nothing non-localized to assert. It is
 * excluded from this epic rather than written against a guessed anchor.
 */
test.describe('Courseware outline sidebar', () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'opens a unit from the sidebar and renders its content',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning', '@courseware-navigation-sidebar'],
      annotation: testId('TC-00051'),
    },
    async ({ page, unitPage, courseOutline, completionUnits, enrolledCourse }) => {
      // Start on one unit, then navigate to a *different* one from the tray, so the
      // assertion cannot pass on the content that was already open.
      const start = completionUnits.viewOnly;
      const target = courseOutline.units.find(
        (unit) => unit.sequentialId === start.sequentialId && unit.id !== start.id,
      );
      const destination = target ?? completionUnits.withProblem;

      await unitPage.goto(enrolledCourse.courseKey, start.sequentialId, start.id);
      await expect(unitPage.sidebar).toBeVisible();
      await expect(unitPage.sidebarUnitLink(destination.id)).toBeVisible();

      await unitPage.openUnitFromSidebar(destination.id);

      // The destination's own content is what rendered: its blocks come from the
      // Blocks API, so this never depends on a display name.
      const firstBlock = destination.childIds[0];
      expect(firstBlock, 'the destination unit has content').toBeDefined();
      await expect(unitPage.block(firstBlock ?? '')).toBeAttached();
      expect(new URL(page.url()).pathname).toContain(destination.id);
    },
  );

  test(
    'marks a subsection complete once every unit in it is complete',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning', '@courseware-navigation-sidebar'],
      annotation: testId('TC-00055'),
    },
    async ({ page, unitPage, completionUnits, enrolledCourse, refreshCourseOutline }) => {
      // A subsection whose every unit the suite can drive: a subsection completes
      // only when all of its units do, so a single video or ORA anywhere in it puts
      // the state under test out of reach.
      const { sequentialId, units } = completionUnits.drivableSubsection;

      await unitPage.goto(enrolledCourse.courseKey, sequentialId, units[0]?.id ?? '');
      // Not complete to begin with.
      await expect(unitPage.subsectionCompletedIcon(units[0]?.id ?? '')).toHaveCount(0);

      for (const unit of units) {
        const unfinished = await completeUnit(page, unitPage, enrolledCourse.courseKey, unit);
        expect(unfinished, `unit "${unit.displayName ?? unit.id}" completed`).toEqual([]);
      }

      // The platform's record first: every unit in the subsection is complete.
      const { blocks } = await refreshCourseOutline();
      for (const unit of units) {
        expect(blocks[unit.id]?.completion, `unit "${unit.displayName ?? unit.id}"`).toBe(1);
      }

      // Then the rendering the case describes: the subsection's circle icon is
      // replaced by the completed one — a different test ID, not a recoloured
      // element, so no assertion on colour is needed.
      await unitPage.goto(enrolledCourse.courseKey, sequentialId, units[0]?.id ?? '');
      await expect(unitPage.subsectionCompletedIcon(units[0]?.id ?? '')).toBeVisible();
    },
  );
});
