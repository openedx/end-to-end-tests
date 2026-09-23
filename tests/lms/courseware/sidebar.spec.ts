import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { fetchCourseNavigation, navigationSections } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { completeUnit } from '../../../src/steps';

/**
 * The in-course outline sidebar (the learning MFE's navigation tray).
 *
 * Gated on `@courseware-navigation-sidebar`: releases before verawood run the
 * older in-course navigation instead and declare `courseware-legacy-navigation`
 * — the two are mutually exclusive, so this coverage skips cleanly where the
 * surface does not exist.
 *
 * The tray's structure — its sections, subsections and units, in order — is
 * compared with the learner's navigation API (`navigationSections`), which is
 * what the tray renders from. Section and subsection names are course content,
 * which ADR-0002 allows a spec to read.
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
    'reflects a completed unit in the tray',
    {
      tag: ['@smoke', '@authenticated', '@mfe-learning', '@courseware-navigation-sidebar'],
      annotation: testId('TC-00022'),
    },
    async ({ page, unitPage, completionUnits, courseProgress, enrolledCourse }) => {
      // The UI half of TC-00022; the API half (the platform's own completion
      // record) is `unit-completion.spec.ts`, which runs on every installation.
      const unit = completionUnits.viewOnly;

      const unfinished = await completeUnit(page, unitPage, enrolledCourse.courseKey, unit);
      expect(unfinished, 'every block in the unit registered completion').toEqual([]);
      const after = await courseProgress();
      expect(after.completionSummary.completeCount).toBe(1);

      // A *unit's* own marker is distinguished by colour alone (`text-gray-300` →
      // `text-success` on an svg with no test ID), which ADR-0002 rules out as an
      // assertion; its subsection's marker, however, moves to a different test ID
      // once any unit inside it completes. That is the non-localized, non-colour
      // signal that the tray reflected the completion — the API above is what
      // decides whether the state is *right*.
      await unitPage.goto(enrolledCourse.courseKey, unit.sequentialId, unit.id);
      await expect(unitPage.sidebarUnitLink(unit.id)).toBeVisible();
      await expect(unitPage.subsectionIncompleteIcon(unit.id)).toHaveCount(0);
      await expect(unitPage.subsectionProgressIcon(unit.id)).toBeVisible();
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

  test(
    'opens on the current section, with the active subsection expanded',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning', '@courseware-navigation-sidebar'],
      annotation: testId('TC-00047'),
    },
    async ({ request, config, unitPage, courseOutline, enrolledCourse }) => {
      const { courseKey } = enrolledCourse;
      const unit = courseOutline.units[0]!;
      const sections = navigationSections(
        (await fetchCourseNavigation(request, config, courseKey))!,
      );
      const section = sections.find((s) =>
        s.subsections.some((ss) => ss.unitIds.includes(unit.id)),
      )!;
      const active = section.subsections.findIndex((ss) => ss.unitIds.includes(unit.id));

      await unitPage.goto(courseKey, unit.sequentialId, unit.id);
      await expect(unitPage.sidebar).toBeVisible();
      // wg-build-test-release#574: the outline — not a right-hand sidebar — is
      // what opens by default, even on a unit that offers a discussion.
      await expect(unitPage.activeRightSidebarTrigger).toHaveCount(0);

      // Section view: the current section's name, its subsections in order,
      // and the active one expanded to its units.
      await expect(unitPage.sidebarBackButton).toContainText(section.name);
      await expect(unitPage.sidebarSubsections).toHaveCount(section.subsections.length);
      for (const [index, subsection] of section.subsections.entries()) {
        await expect(unitPage.sidebarSubsections.nth(index)).toContainText(subsection.name);
      }
      await expect(unitPage.subsectionToggle(active)).toHaveAttribute('aria-expanded', 'true');
      await expect(unitPage.subsectionUnits(active)).toHaveCount(
        section.subsections[active]!.unitIds.length,
      );
    },
  );

  test(
    'goes back to the course outline and into another section without leaving the unit',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning', '@courseware-navigation-sidebar'],
      annotation: testId('TC-00049'),
    },
    async ({ page, request, config, unitPage, courseOutline, enrolledCourse }) => {
      const { courseKey } = enrolledCourse;
      const unit = courseOutline.units[0]!;
      const sections = navigationSections(
        (await fetchCourseNavigation(request, config, courseKey))!,
      );
      const current = sections.findIndex((s) =>
        s.subsections.some((ss) => ss.unitIds.includes(unit.id)),
      );
      const other = sections.findIndex((s, i) => i !== current && s.subsections.length > 0);
      expect(other, 'the course has a second section').toBeGreaterThanOrEqual(0);

      await unitPage.goto(courseKey, unit.sequentialId, unit.id);
      const url = page.url();
      const content = await unitPage.contentSource();

      await unitPage.backToOutline();
      await expect(unitPage.sidebarSections).toHaveCount(sections.length);
      for (const [index, section] of sections.entries()) {
        await expect(unitPage.sidebarSections.nth(index)).toContainText(section.name);
      }
      expect(page.url()).toBe(url);
      expect(await unitPage.contentSource()).toBe(content);

      // Another section: its subsections, all collapsed — the unit shown is elsewhere.
      await unitPage.openSection(other);
      await expect(unitPage.sidebarBackButton).toContainText(sections[other]!.name);
      await expect(unitPage.sidebarSubsections).toHaveCount(sections[other]!.subsections.length);
      for (const index of sections[other]!.subsections.keys()) {
        await expect(unitPage.subsectionToggle(index)).toHaveAttribute('aria-expanded', 'false');
      }

      // Back in the current section, the active subsection is expanded again.
      await unitPage.backToOutline();
      await unitPage.openSection(current);
      const active = sections[current]!.subsections.findIndex((ss) => ss.unitIds.includes(unit.id));
      await expect(unitPage.subsectionToggle(active)).toHaveAttribute('aria-expanded', 'true');
      expect(page.url()).toBe(url);
      expect(await unitPage.contentSource()).toBe(content);
    },
  );

  test(
    'expands and collapses a subsection to show its units',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning', '@courseware-navigation-sidebar'],
      annotation: testId('TC-00050'),
    },
    async ({ page, request, config, unitPage, courseOutline, enrolledCourse }) => {
      const { courseKey } = enrolledCourse;
      const unit = courseOutline.units[0]!;
      const sections = navigationSections(
        (await fetchCourseNavigation(request, config, courseKey))!,
      );
      const section = sections.find((s) =>
        s.subsections.some((ss) => ss.unitIds.includes(unit.id)),
      )!;
      const target = section.subsections.findIndex(
        (ss) => !ss.unitIds.includes(unit.id) && ss.unitIds.length > 0,
      );
      expect(target, 'the section has another subsection with units').toBeGreaterThanOrEqual(0);

      await unitPage.goto(courseKey, unit.sequentialId, unit.id);
      const url = page.url();
      await expect(unitPage.subsectionToggle(target)).toHaveAttribute('aria-expanded', 'false');
      await expect(unitPage.subsectionUnits(target)).toHaveCount(0);

      await unitPage.toggleSubsection(target);
      await expect(unitPage.subsectionUnits(target)).toHaveCount(
        section.subsections[target]!.unitIds.length,
      );
      await unitPage.toggleSubsection(target);
      await expect(unitPage.subsectionUnits(target)).toHaveCount(0);
      expect(page.url()).toBe(url);
    },
  );

  test(
    'keeps the tray collapsed or expanded from one unit to the next',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning', '@courseware-navigation-sidebar'],
      annotation: testId('TC-00052'),
    },
    async ({ unitPage, courseOutline, enrolledCourse }) => {
      const unit = courseOutline.units[0]!;
      await unitPage.goto(enrolledCourse.courseKey, unit.sequentialId, unit.id);
      await expect(unitPage.sidebar).toBeVisible();

      await unitPage.collapseSidebar();
      await expect(unitPage.sidebarExpand).toBeVisible();
      await unitPage.nextUnit();
      await expect(unitPage.sidebar).toHaveCount(0);
      await expect(unitPage.sidebarExpand).toBeVisible();

      await unitPage.expandSidebar();
      await expect(unitPage.sidebarBackButton).toBeVisible();
      await unitPage.nextUnit();
      await expect(unitPage.sidebar).toBeVisible();
    },
  );
});
