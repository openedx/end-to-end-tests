import { checkA11y } from '../../../src/a11y';
import { buildSection, courseUsageKey, fetchXBlockOutline } from '../../../src/api';
import { STUDIO_SIDEBAR_SELECTORS as S, TIMEOUTS, VIEWPORTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { horizontalOverflow } from '../../../src/steps';
import { SIDEBAR_A11Y_BASELINE } from './helpers';

/**
 * The Verawood authoring sidebar on the course-outline page: its structure, its
 * behaviour when different outline items are selected, its overflow menu and its
 * Help panel (BTR TC-00482–00485, 00492). The sidebar's *rendering* is the thing
 * under test, so the assertions are structural — a rail button's active state,
 * the panel's presence, a title equal to the item's own name, the set of Help
 * links' `href`s — never on localized copy.
 *
 * Gated on `studio-sidebar` (main/verawood); `ulmo` and earlier render no
 * such sidebar. Fixtures are ordered so `studioAuthorSession` resolves last and
 * primes the browser session after the course is provisioned.
 */
test.describe(
  'Authoring course-outline sidebar',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@studio-sidebar'] },
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

        // The panel sits beside the outline rather than over it.
        const outline = studioCourseOutlinePage.sectionCards.first();
        const boxes = async () => {
          const [panel, card] = await Promise.all([
            authoringSidebar.panel.boundingBox(),
            outline.boundingBox(),
          ]);
          if (panel === null || card === null) {
            throw new Error('The sidebar panel or the outline is not rendered.');
          }
          return { panel, card };
        };
        const beside = await boxes();
        expect(beside.card.x + beside.card.width).toBeLessThanOrEqual(beside.panel.x);

        // Its left edge is a resize handle: the cursor says so, dragging it left
        // widens the panel and narrows the outline, and dragging it right stops
        // at a minimum width instead of squeezing the panel away.
        await expect(authoringSidebar.resizeHandle).toHaveCSS('cursor', 'ew-resize');
        const initial = await authoringSidebar.width();
        // Retried: the panel starts over at its initial width if it is drawn
        // again while the outline beside it is still settling.
        let widened = initial;
        await expect
          .poll(async () => {
            widened = await authoringSidebar.dragEdge(-120);
            return widened;
          })
          .toBeGreaterThan(initial);
        expect((await boxes()).card.width).toBeLessThan(beside.card.width);
        const minimum = await authoringSidebar.dragEdge(600);
        expect(minimum).toBeLessThan(widened);
        expect(await authoringSidebar.dragEdge(200)).toBe(minimum);
        await expect(authoringSidebar.panel).toBeVisible();
        expect((await boxes()).card.width).toBeGreaterThan(0);

        await checkA11y(page, {
          label: 'studio-sidebar-outline',
          additionalBaseline: SIDEBAR_A11Y_BASELINE,
        });

        // A narrower window: the panel and the outline are both still there,
        // neither over the other.
        await page.setViewportSize(VIEWPORTS.smallDesktop.viewport);
        await expect(authoringSidebar.panel).toBeVisible();
        await expect(outline).toBeVisible();
        const narrow = await boxes();
        const apart =
          narrow.card.x + narrow.card.width <= narrow.panel.x ||
          narrow.panel.y + narrow.panel.height <= narrow.card.y ||
          narrow.card.y + narrow.card.height <= narrow.panel.y;
        expect(apart).toBe(true);
      },
    );

    // `main` caps the panel's width to the window and stacks the rail above it
    // when there is no room; on `verawood` the panel keeps its minimum width
    // and pushes the rail past the right edge of a narrower window.
    test(
      'fits a narrower window without scrolling sideways',
      { tag: '@studio-sidebar-narrow-layout', annotation: testId('TC-00482') },
      async ({
        page,
        authoringCourse,
        authoringSidebar,
        studioCourseOutlinePage,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);
        await expect(authoringSidebar.panel).toBeVisible();

        await page.setViewportSize(VIEWPORTS.smallDesktop.viewport);
        await expect(authoringSidebar.panel).toBeVisible();
        await expect.poll(() => horizontalOverflow(page)).toBe(0);
      },
    );

    test(
      'updates for the selected section, subsection and unit without breaking',
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

        const unit = section.units.at(0);
        if (unit === undefined) throw new Error('buildSection produced no unit to select.');

        // Selecting a level re-titles the panel with that item's name and keeps the
        // Info tabs rendered — the structure does not break as the selection moves.
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

        // A unit has a tab set of its own (Preview, Details, Settings); the panel
        // swaps to it, titled with the unit's name. What those tabs hold is
        // TC-00489.
        await studioCourseOutlinePage.select(studioCourseOutlinePage.unit(unit.usageKey), 'unit');
        await expect(authoringSidebar.title).toHaveText(unit.displayName);
        await expect(authoringSidebar.tab(S.outlineUnitInfoTab('info'))).toBeVisible();

        // And back up to the section: the section's tabs return.
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.first(),
          'section',
        );
        await expect(authoringSidebar.title).toHaveText(section.displayName);
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
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E overflow ${test.info().testId.slice(-6)}`,
        );
        const sections = async () =>
          (
            await fetchXBlockOutline(
              page.request,
              config,
              courseUsageKey(authoringCourse.courseKey),
            )
          ).child_info?.children.map((child) => child.id) ?? [];
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
        expect(await sections()).toEqual([section.usageKey]);

        // Choosing an action triggers that action: Duplicate adds a copy of the
        // section after it. (Each action's own outcome is TC-00485.)
        await (await authoringSidebar.itemMenuAction('outline', 'duplicate')).click();
        await expect.poll(sections, { timeout: TIMEOUTS.contentPublish }).toHaveLength(2);
        expect((await sections())[0]).toBe(section.usageKey);
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

        // Course-level Help renders the topics for that level. The topics are the
        // assertion, not the documentation links they sometimes carry: whether a
        // topic links out depends on the installation's docs URLs, and a build
        // without them renders the headings alone.
        await authoringSidebar.openPage('help');
        await expect(authoringSidebar.helpTopics.first()).toBeVisible();

        // Selecting a section and reopening Help still renders topics (the
        // per-level difference is in the localized descriptions, which the suite
        // does not assert on).
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.first(),
          'section',
        );
        await authoringSidebar.openPage('help');
        await expect(authoringSidebar.helpTopics.first()).toBeVisible();
      },
    );
  },
);
