import { checkA11y } from '../../../src/a11y';
import { buildSection, courseUsageKey, fetchXBlockOutline, publishXBlock } from '../../../src/api';
import { TIMEOUTS, STUDIO_SIDEBAR_SELECTORS as S } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { knownGap, testId } from '../../../src/reporting';
import { SIDEBAR_A11Y_BASELINE } from './helpers';

/**
 * The Verawood outline Info panel: the course / section / subsection / unit
 * Details and Settings tabs, the overflow actions, and the Publish button (BTR
 * TC-00485–00489, 00493). The panel structure is asserted structurally (tabs,
 * sections and controls by non-localized id); the underlying state — publish
 * status, child counts — is read from the xblock outline API, which decides
 * pass/fail.
 *
 * Gated on `authoring-sidebar`; `studioAuthorSession` resolves last.
 */
test.describe(
  'Authoring outline Info panel',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@authoring-sidebar'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'shows course-level Details and Settings with the settings links',
      { annotation: testId('TC-00486') },
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
          `E2E course info ${test.info().testId.slice(-6)}`,
        );
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);

        // The course Info panel offers a Details (default) and a Settings tab, and
        // a Taxonomy Alignments section with its Manage-tags control.
        await expect(authoringSidebar.tab(S.courseInfoTab('info'))).toBeVisible();
        await expect(authoringSidebar.tab(S.courseInfoTab('settings'))).toBeVisible();
        await expect(authoringSidebar.taxonomySectionMenu).toBeVisible();

        // The Settings tab lists links into the course settings pages.
        await authoringSidebar.openTab(S.courseInfoTab('settings'));
        expect((await authoringSidebar.panelLinkHrefs()).length).toBeGreaterThan(0);

        await checkA11y(page, {
          label: 'studio-sidebar-outline-info',
          additionalBaseline: SIDEBAR_A11Y_BASELINE,
        });
      },
    );

    test(
      'shows a selected section its Details and Settings',
      { annotation: testId('TC-00487') },
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
          `E2E section info ${test.info().testId.slice(-6)}`,
        );
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.first(),
          'section',
        );

        // The section Info panel has Details (default) and Settings tabs and a
        // Taxonomy Alignments section.
        await expect(authoringSidebar.tab(S.outlineItemInfoTab('info'))).toBeVisible();
        await expect(authoringSidebar.tab(S.outlineItemInfoTab('settings'))).toBeVisible();
        await expect(authoringSidebar.taxonomySectionMenu).toBeVisible();
      },
    );

    test(
      'shows a selected subsection its grading and visibility settings',
      { annotation: testId('TC-00488') },
      async ({
        page,
        config,
        authoringCourse,
        authoringSidebar,
        studioCourseOutlinePage,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        // A graded subsection, so the Settings tab shows the grading-type control.
        await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E subsection info ${test.info().testId.slice(-6)}`,
          { subsections: [{ gradedAs: 'Homework', units: [{ blocks: ['html'] }] }] },
        );
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.subsectionCards.first(),
          'subsection',
        );

        // Details and Settings tabs render; the Settings tab exposes the grading
        // type control (its non-localized test id) for the graded subsection.
        await expect(authoringSidebar.tab(S.outlineItemInfoTab('info'))).toBeVisible();
        await authoringSidebar.openTab(S.outlineItemInfoTab('settings'));
        await expect(page.locator('[data-testid="grader-type-select"]')).toBeVisible();
      },
    );

    // AUTH-002: a unit cannot be selected from the outline (its card is fully
    // covered by a navigating title link), so its Info panel cannot be reached
    // there. The unit's Info is covered from the unit page by TC-00495.
    test.fixme(
      'shows a selected unit its Details from the outline',
      {
        annotation: [
          testId('TC-00489'),
          knownGap(
            'AUTH-002: a unit is not selectable from the course outline; see docs/findings.md',
          ),
        ],
      },
      async () => {
        // Intended: select the unit card in the outline and read its Details tab.
      },
    );

    test(
      'shows and clears the Publish button as the item is published',
      { annotation: testId('TC-00493') },
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
          `E2E publish ${test.info().testId.slice(-6)}`,
        );
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.first(),
          'section',
        );

        // The freshly built section has unpublished changes, so the panel offers a
        // Publish button (the API is the source of truth for the draft state).
        expect((await fetchXBlockOutline(page.request, config, section.usageKey)).has_changes).toBe(
          true,
        );
        await expect(authoringSidebar.publishButton).toBeVisible();

        // Publish the section (through the API — publishing *from the panel* is
        // covered by the robust unit case TC-00495; the course outline re-renders
        // continuously, which makes a click on its Publish button flaky under
        // load). Reloading and re-selecting the now-published section shows the
        // panel without a Publish button.
        await publishXBlock(page.request, config, section.usageKey);
        expect((await fetchXBlockOutline(page.request, config, section.usageKey)).has_changes).toBe(
          false,
        );
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.first(),
          'section',
        );
        await expect(authoringSidebar.publishButton).toHaveCount(0);
      },
    );

    test(
      'duplicates a section from the overflow menu',
      { annotation: testId('TC-00485') },
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
          `E2E actions ${test.info().testId.slice(-6)}`,
        );
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.first(),
          'section',
        );

        const before = (
          await fetchXBlockOutline(page.request, config, courseUsageKey(authoringCourse.courseKey))
        ).child_info?.children.length;

        // The overflow menu's first action duplicates the section; the outline
        // gains a section.
        const items = await authoringSidebar.openItemMenu();
        await items.first().click();
        await expect
          .poll(
            async () =>
              (
                await fetchXBlockOutline(
                  page.request,
                  config,
                  courseUsageKey(authoringCourse.courseKey),
                )
              ).child_info?.children.length,
            { timeout: TIMEOUTS.contentPublish },
          )
          .toBe((before ?? 0) + 1);
      },
    );
  },
);
