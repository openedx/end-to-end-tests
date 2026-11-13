import { checkA11y } from '../../../src/a11y';
import { buildSection, courseUsageKey, fetchXBlockOutline } from '../../../src/api';
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
 * Gated on `studio-sidebar`; `studioAuthorSession` resolves last.
 */
test.describe(
  'Authoring outline Info panel',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@studio-sidebar'] },
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

    // AUTH-002: a unit selects only on a click of its header's own blank strip
    // (between the title group and the badges), and at the suite's 1280 px
    // viewport there is none — the two fill the header. The unit's Info is
    // covered from the unit page by TC-00495.
    test.fixme(
      'shows a selected unit its Details from the outline',
      {
        annotation: [
          testId('TC-00489'),
          knownGap(
            'AUTH-002: at 1280 px the unit header has no blank strip left to click, so a unit cannot be selected from the outline',
          ),
        ],
      },
      async () => {
        // Intended: select the unit card in the outline and read its Details tab.
      },
    );

    test(
      'shows and clears the Publish button as the item is published',
      { tag: '@smoke', annotation: testId('TC-00493') },
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

        // Publish it from the panel; the platform records it published and the
        // panel, re-rendered for the now-clean section, drops the button.
        await authoringSidebar.publishAndConfirm();
        await expect
          .poll(
            async () =>
              (await fetchXBlockOutline(page.request, config, section.usageKey)).has_changes,
            { timeout: TIMEOUTS.contentPublish },
          )
          .toBe(false);
        await expect(authoringSidebar.publishButton).toHaveCount(0, {
          timeout: TIMEOUTS.contentPublish,
        });

        // Selecting the published section afresh offers no Publish button either.
        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.first(),
          'section',
        );
        await expect(authoringSidebar.title).toBeVisible();
        await expect(authoringSidebar.publishButton).toHaveCount(0);
      },
    );

    test(
      'deletes, duplicates and moves outline items from the overflow menu',
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
        const { courseKey } = authoringCourse;
        const label = `E2E actions ${test.info().testId.slice(-6)}`;
        const section = await buildSection(page.request, config, courseKey, label, {
          subsections: [{ units: [{ blocks: ['html'] }] }, { units: [{ blocks: ['html'] }] }],
        });
        const children = async (key: string) =>
          (await fetchXBlockOutline(page.request, config, key)).child_info?.children.map(
            (child) => child.id,
          ) ?? [];
        const course = courseUsageKey(courseKey);
        await studioCourseOutlinePage.goto(courseKey);
        await studioCourseOutlinePage.waitForCourse(courseKey);
        const sectionCard = studioCourseOutlinePage.sectionTitled(label);

        // A subsection's Delete asks for confirmation; confirmed, the subsection
        // is gone from its section.
        await studioCourseOutlinePage.expand(sectionCard, 'section');
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.subsectionTitled(`${label} subsection 1`),
          'subsection',
        );
        await authoringSidebar.deleteSelected('outline');
        await expect
          .poll(() => children(section.usageKey), { timeout: TIMEOUTS.contentPublish })
          .toEqual([section.subsections[1]!.usageKey]);

        // The section's Duplicate adds a copy right after it.
        await studioCourseOutlinePage.select(sectionCard.first(), 'section');
        await (await authoringSidebar.itemMenuAction('outline', 'duplicate')).click();
        await expect
          .poll(() => children(course), { timeout: TIMEOUTS.contentPublish })
          .toHaveLength(2);
        const [original, copy] = await children(course);
        expect(original).toBe(section.usageKey);

        // Move Down puts the original after its copy.
        await studioCourseOutlinePage.select(sectionCard.first(), 'section');
        await (await authoringSidebar.itemMenuAction('outline', 'moveDown')).click();
        await expect
          .poll(() => children(course), { timeout: TIMEOUTS.contentPublish })
          .toEqual([copy, original]);
      },
    );
  },
);
