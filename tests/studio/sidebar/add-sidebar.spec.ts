import { buildSection } from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * The Verawood Add sidebar on the outline and unit page (BTR TC-00491, 00496):
 * it opens with an Add New (default) and an Add Existing tab, and both are
 * reachable. The create controls and the library picker inside Add Existing carry
 * no stable test ids and the library-reference guard is a known upstream defect
 * (wg-build-test-release#587, the sheet's Failed note), so this asserts the
 * two-tab structure — the part that works — rather than driving a create.
 *
 * Gated on `authoring-sidebar`; `studioAuthorSession` resolves last.
 */
test.describe(
  'Authoring Add sidebar',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@authoring-sidebar'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'opens on the outline with Add New and Add Existing tabs',
      { annotation: testId('TC-00491') },
      async ({
        page,
        config,
        authoringCourse,
        authoringSidebar,
        studioCourseOutlinePage,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E add outline ${test.info().testId.slice(-6)}`,
        );
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);

        await authoringSidebar.openPage('add');
        await expect(authoringSidebar.tab('add-content-tabs-tab-addNew')).toBeVisible();
        await expect(authoringSidebar.tab('add-content-tabs-tab-addExisting')).toBeVisible();

        // Both tabs are reachable.
        await authoringSidebar.openTab('add-content-tabs-tab-addExisting');
        await authoringSidebar.openTab('add-content-tabs-tab-addNew');
      },
    );

    test(
      'opens on the unit page with Add New and Add Existing tabs',
      { annotation: testId('TC-00496') },
      async ({
        page,
        config,
        authoringCourse,
        authoringSidebar,
        studioUnitPage,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E add unit ${test.info().testId.slice(-6)}`,
        );
        const unit = section.units.at(0);
        if (unit === undefined) throw new Error('buildSection produced no unit.');
        await studioUnitPage.goto(unit.usageKey);

        await authoringSidebar.openPage('add');
        await expect(authoringSidebar.tab('unit-add-sidebar-tab-add-new')).toBeVisible();
        await expect(authoringSidebar.tab('unit-add-sidebar-tab-add-existing')).toBeVisible();

        await authoringSidebar.openTab('unit-add-sidebar-tab-add-existing');
        await authoringSidebar.openTab('unit-add-sidebar-tab-add-new');
      },
    );
  },
);
