import { checkA11y } from '../../../src/a11y';
import { buildSection } from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { SIDEBAR_A11Y_BASELINE } from './helpers';

/**
 * The Verawood authoring sidebar on the course-outline page: its structure, its
 * behaviour when different outline items are selected, its overflow menu and its
 * Help panel (BTR TC-00482–00485, 00492). The sidebar's *rendering* is the thing
 * under test, so the assertions are structural — a rail button's active state,
 * the panel's presence, a title equal to the item's own name, the set of Help
 * links' `href`s — never on localized copy.
 *
 * Gated on `authoring-sidebar` (main/verawood); `ulmo` and earlier render no
 * such sidebar. Fixtures are ordered so `studioAuthorSession` resolves last and
 * primes the browser session after the course is provisioned.
 */
test.describe(
  'Authoring course-outline sidebar',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@authoring-sidebar'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'renders with the expected structure and basic controls',
      { annotation: testId('TC-00482') },
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
          `E2E sidebar ${test.info().testId.slice(-6)}`,
        );
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);

        // The panel is rendered and expanded, on the Info page by default, and
        // titled with the course's own name.
        await expect(authoringSidebar.panel).toBeVisible();
        expect(await authoringSidebar.isPageActive('info')).toBe(true);
        await expect(authoringSidebar.pageDropdownToggle).toBeVisible();
        await expect(authoringSidebar.title).toHaveText(authoringCourse.displayName);

        // Collapse hides the panel; expand brings it back.
        await authoringSidebar.collapse();
        expect(await authoringSidebar.isOpen()).toBe(false);
        await authoringSidebar.expand();
        expect(await authoringSidebar.isOpen()).toBe(true);

        // The panel offers a resize affordance (the drag itself is not asserted —
        // a synthetic drag on the react-resizable handle does not fire its
        // listeners reliably).
        await expect(authoringSidebar.resizeHandle).toBeVisible();

        await checkA11y(page, {
          label: 'studio-sidebar-outline',
          additionalBaseline: SIDEBAR_A11Y_BASELINE,
        });
      },
    );

    test(
      'updates for the selected section and subsection without breaking',
      { annotation: testId('TC-00483') },
      async ({
        page,
        config,
        authoringCourse,
        authoringSidebar,
        studioCourseOutlinePage,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E switch ${test.info().testId.slice(-6)}`,
        );
        const subsection = section.subsections.at(0);
        if (subsection === undefined) {
          throw new Error('buildSection produced no subsection to select.');
        }
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);

        // Selecting a level re-titles the panel with that item's name and keeps the
        // Info tabs rendered — the structure does not break as the selection moves.
        // (Selecting a unit *from the outline* is exercised by TC-00489; the unit
        // card is fully covered by its header, whose title link navigates to the
        // unit page rather than selecting.)
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.first(),
          'section',
        );
        await expect(authoringSidebar.title).toHaveText(section.displayName);
        await expect(page.locator('#add-content-tabs-tab-info')).toBeVisible();

        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.subsectionCards.first(),
          'subsection',
        );
        await expect(authoringSidebar.title).toHaveText(subsection.displayName);
        await expect(page.locator('#add-content-tabs-tab-info')).toBeVisible();
      },
    );

    test(
      'exposes an overflow menu with contextual actions for a selected item',
      { annotation: testId('TC-00484') },
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
          `E2E overflow ${test.info().testId.slice(-6)}`,
        );
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);

        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.first(),
          'section',
        );
        // The selected item exposes an overflow menu; opening it lists actions.
        await expect(authoringSidebar.itemMenuButton).toBeVisible();
        const items = await authoringSidebar.openItemMenu();
        expect(await items.count()).toBeGreaterThan(0);

        // Dismissing without choosing closes the menu and triggers nothing.
        await page.keyboard.press('Escape');
        await expect(items.first()).toBeHidden();
      },
    );

    test(
      'opens a contextual Help panel at the course and section level',
      { annotation: testId('TC-00492') },
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
          `E2E help ${test.info().testId.slice(-6)}`,
        );
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);

        // Course-level Help renders contextual documentation links.
        await authoringSidebar.openPage('help');
        expect((await authoringSidebar.helpLinkHrefs()).length).toBeGreaterThan(0);

        // Selecting a section and reopening Help still renders contextual links
        // (the per-level difference is in the localized descriptions, which the
        // suite does not assert on; the doc links themselves can coincide).
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.first(),
          'section',
        );
        await authoringSidebar.openPage('help');
        expect((await authoringSidebar.helpLinkHrefs()).length).toBeGreaterThan(0);
      },
    );
  },
);
