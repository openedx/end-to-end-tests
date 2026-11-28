import { checkA11y } from '../../../src/a11y';
import type { APIRequestContext } from '@playwright/test';

import {
  buildSection,
  courseUsageKey,
  fetchContainerChildren,
  fetchObjectTags,
  fetchXBlockOutline,
  setObjectTags,
  updateXBlock,
} from '../../../src/api';
import {
  TIMEOUTS,
  VIEWPORTS,
  viewportUse,
  STUDIO_SIDEBAR_SELECTORS as S,
  type AppConfig,
  escapeRegExp,
} from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { TAG } from '../../../src/steps';
import { SIDEBAR_A11Y_BASELINE } from './helpers';

/**
 * The course Settings tab's links, as the path each leads to under the course's
 * authoring URL: Schedule & details, Grading, Course team, Group configurations
 * and Advanced settings. (Proctored exam settings joins them only where
 * proctoring is configured.)
 */
const COURSE_SETTINGS_PAGES = [
  'settings/details',
  'settings/grading',
  'course_team',
  'group_configurations',
  'settings/advanced',
] as const;

/** A subsection's Settings toggles: grading, then visibility (`settingsToggleGroup`). */
const GRADING_TOGGLE = 0;
const VISIBILITY_TOGGLE = 1;

/** An ISO date as the Settings tab's date picker writes it (`MM/DD/YYYY`, UTC). */
function pickerDate(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(date.getUTCMonth() + 1)}/${two(date.getUTCDate())}/${date.getUTCFullYear()}`;
}

/** How many sections, subsections and units the platform holds for a course. */
async function outlineCounts(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<{ sections: number; subsections: number; units: number }> {
  const course = await fetchXBlockOutline(request, config, courseUsageKey(courseKey));
  const sections = course.child_info?.children ?? [];
  const subsections = sections.flatMap((section) => section.child_info?.children ?? []);
  const units = subsections.flatMap((subsection) => subsection.child_info?.children ?? []);
  return { sections: sections.length, subsections: subsections.length, units: units.length };
}

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
        const { courseKey } = authoringCourse;
        await buildSection(
          page.request,
          config,
          courseKey,
          `E2E course info ${test.info().testId.slice(-6)}`,
          {
            subsections: [
              { units: [{ blocks: ['html'] }, { blocks: ['html'] }] },
              { units: [{ blocks: ['html'] }] },
            ],
          },
        );
        await studioCourseOutlinePage.goto(courseKey);
        await studioCourseOutlinePage.waitForCourse(courseKey);

        // The course Info panel offers a Details (default) and a Settings tab, and
        // a Taxonomy Alignments section with its Manage-tags control.
        await expect(authoringSidebar.tab(S.courseInfoTab('info'))).toBeVisible();
        await expect(authoringSidebar.tab(S.courseInfoTab('settings'))).toBeVisible();
        await expect(authoringSidebar.taxonomySectionMenu).toBeVisible();

        // The Details tab's content summary counts the course's sections,
        // subsections and units as the platform has them.
        await expect
          .poll(async () => ({
            shown: {
              sections: await authoringSidebar.contentSummaryCount('chapter'),
              subsections: await authoringSidebar.contentSummaryCount('sequential'),
              units: await authoringSidebar.contentSummaryCount('vertical'),
            },
            stored: await outlineCounts(page.request, config, courseKey),
          }))
          .toEqual({
            shown: { sections: 1, subsections: 2, units: 3 },
            stored: { sections: 1, subsections: 2, units: 3 },
          });

        // The Settings tab lists links into the course settings pages: schedule
        // and details, grading, the course team, group configurations and
        // advanced settings, each for this course.
        await authoringSidebar.openTab(S.courseInfoTab('settings'));
        const hrefs = await authoringSidebar.panelLinkHrefs();
        const settingsUrl = (path: string) =>
          new RegExp(`/course/${escapeRegExp(courseKey)}/${path}/?$`);
        expect(hrefs).toEqual(
          expect.arrayContaining(
            COURSE_SETTINGS_PAGES.map((path) => expect.stringMatching(settingsUrl(path))),
          ),
        );

        // And each link leads where it says.
        for (const path of COURSE_SETTINGS_PAGES) {
          await studioCourseOutlinePage.goto(courseKey);
          await studioCourseOutlinePage.waitForCourse(courseKey);
          await authoringSidebar.openTab(S.courseInfoTab('settings'));
          await authoringSidebar.settingsLinks.and(page.locator(`[href$="/${path}"]`)).click();
          await expect(page).toHaveURL(settingsUrl(path));
          await expect(studioCourseOutlinePage.sectionCards).toHaveCount(0);
        }
        await studioCourseOutlinePage.goto(courseKey);
        await studioCourseOutlinePage.waitForCourse(courseKey);

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
      'shows a selected subsection its units, dates, grading and visibility',
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
        // A graded subsection of two units with a release and a due date, and a
        // second, plain one to switch to.
        const label = `E2E subsection info ${test.info().testId.slice(-6)}`;
        const section = await buildSection(page.request, config, authoringCourse.courseKey, label, {
          subsections: [
            { gradedAs: 'Homework', units: [{ blocks: ['html'] }, { blocks: ['html'] }] },
            { units: [{ blocks: ['html'] }] },
          ],
        });
        const [graded, plain] = section.subsections;
        if (graded === undefined || plain === undefined) {
          throw new Error('buildSection produced fewer than two subsections.');
        }
        await updateXBlock(page.request, config, graded.usageKey, {
          metadata: { start: '2031-02-03T00:00:00Z', due: '2031-04-05T00:00:00Z' },
        });
        const stored = () => fetchXBlockOutline(page.request, config, graded.usageKey);

        await studioCourseOutlinePage.goto(authoringCourse.courseKey);
        await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.subsectionTitled(graded.displayName),
          'subsection',
        );
        await expect(authoringSidebar.title).toHaveText(graded.displayName);

        // Details (the default tab): the content summary counts the subsection's
        // units as the platform has them.
        await expect(authoringSidebar.tab(S.outlineItemInfoTab('info'))).toBeVisible();
        await authoringSidebar.openTab(S.outlineItemInfoTab('info'));
        await expect
          .poll(async () => ({
            shown: await authoringSidebar.contentSummaryCount('vertical'),
            stored: (await stored()).child_info?.children.length,
          }))
          .toEqual({ shown: 2, stored: 2 });

        // Settings: the release and due dates, the grading type and the
        // visibility are the subsection's own.
        const expected = {
          release: '02/03/2031',
          due: '04/05/2031',
          gradedAs: 'Homework',
          staffOnly: false,
        };
        await authoringSidebar.openTab(S.outlineItemInfoTab('settings'));
        await expect
          .poll(async () => {
            const block = await stored();
            return {
              shown: {
                release: await authoringSidebar.settingsDateInputs.nth(0).inputValue(),
                due: await authoringSidebar.settingsDateInputs.nth(1).inputValue(),
                gradedAs: await page.locator('[data-testid="grader-type-select"]').inputValue(),
                staffOnly: (await authoringSidebar.settingsToggleChoice(VISIBILITY_TOGGLE)) === 1,
              },
              stored: {
                release: pickerDate(block.start),
                due: pickerDate(block.due),
                gradedAs: block.format,
                staffOnly: block.has_explicit_staff_lock,
              },
            };
          })
          .toEqual({ shown: expected, stored: expected });

        // A change made here reaches the platform, and the panel shows it.
        await authoringSidebar.chooseSettingsToggle(VISIBILITY_TOGGLE, 1);
        await expect
          .poll(async () => ({
            shown: (await authoringSidebar.settingsToggleChoice(VISIBILITY_TOGGLE)) === 1,
            stored: (await stored()).has_explicit_staff_lock,
          }))
          .toEqual({ shown: true, stored: true });

        // Selecting the other subsection moves the highlight (`select` waits for
        // it) and the panel to that one: its name, and its own settings.
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.subsectionTitled(plain.displayName),
          'subsection',
        );
        await expect(authoringSidebar.title).toHaveText(plain.displayName);
        await authoringSidebar.openTab(S.outlineItemInfoTab('settings'));
        await expect
          .poll(async () => {
            const shown = await authoringSidebar.settingsDateInputs.nth(0).inputValue();
            const block = await fetchXBlockOutline(page.request, config, plain.usageKey);
            return {
              releaseAsStored: shown === pickerDate(block.start),
              releaseOfTheOther: shown === expected.release,
              graded: (await authoringSidebar.settingsToggleChoice(GRADING_TOGGLE)) === 1,
              gradedAsStored: block.graded,
            };
          })
          .toEqual({
            releaseAsStored: true,
            releaseOfTheOther: false,
            graded: false,
            gradedAsStored: false,
          });
      },
    );

    // Run wide: on Verawood a mouse click selects a unit only on its header's
    // own blank space, and at the suite's default 1280 px the title group and
    // the badges fill the header (`AUTH-002`).
    test.describe('at a wide viewport', () => {
      test.use(viewportUse(VIEWPORTS.wideDesktop));

      test(
        'shows a selected unit its Details from the outline',
        { annotation: testId('TC-00489') },
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
            `E2E unit outline info ${test.info().testId.slice(-6)}`,
            { subsections: [{ units: [{ blocks: ['html', 'html'] }] }] },
          );
          const unit = section.units.at(0);
          if (unit === undefined) throw new Error('buildSection produced no unit.');
          await studioCourseOutlinePage.goto(authoringCourse.courseKey);
          await studioCourseOutlinePage.waitForCourse(authoringCourse.courseKey);
          await studioCourseOutlinePage.setAllExpanded(true);

          // Selecting is not opening: the unit's title navigates to the unit page,
          // so staying on the outline is part of the check.
          const outlineUrl = page.url();
          await studioCourseOutlinePage.select(studioCourseOutlinePage.unit(unit.usageKey), 'unit');
          expect(page.url()).toBe(outlineUrl);

          // The panel is the unit's own (titled with the name the test gave it) and
          // offers Details (default) and Settings tabs.
          await expect(authoringSidebar.title).toHaveText(unit.displayName);
          await expect(authoringSidebar.tab(S.outlineUnitInfoTab('info'))).toHaveAttribute(
            'aria-selected',
            'true',
          );
          await expect(authoringSidebar.tab(S.outlineUnitInfoTab('settings'))).toBeVisible();

          // Details counts the unit's components as the platform has them.
          await expect
            .poll(async () => ({
              shown: await authoringSidebar.contentSummaryCount('html'),
              stored: (await fetchContainerChildren(page.request, config, unit.usageKey)).filter(
                (child) => child.block_type === 'html',
              ).length,
            }))
            .toEqual({ shown: 2, stored: 2 });

          // The Preview tab renders this unit, with its components, in the panel.
          await authoringSidebar.openTab(S.outlineUnitInfoTab('preview'));
          await expect(authoringSidebar.unitPreviewFrame).toHaveAttribute(
            'src',
            new RegExp(`${escapeRegExp(unit.usageKey)}$`),
          );
          const preview = authoringSidebar.unitPreviewFrame.contentFrame();
          for (const block of unit.blocks) {
            await expect(preview.locator(S.previewBlock(block.usageKey))).toBeVisible();
          }
        },
      );
    });

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

        // Move Up, on the original where it now sits (second of the course's
        // two sections), puts it back in front. The outline is loaded afresh
        // first: on `verawood` the panel keeps the position an item had before
        // its last move, so Move Up stays disabled for a section just moved
        // down until the page is reloaded (`AUTH-006`; `main` does not).
        await studioCourseOutlinePage.goto(courseKey);
        await studioCourseOutlinePage.waitForCourse(courseKey);
        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.sectionCards.nth(1),
          'section',
        );
        await (await authoringSidebar.itemMenuAction('outline', 'moveUp')).click();
        await expect
          .poll(() => children(course), { timeout: TIMEOUTS.contentPublish })
          .toEqual([original, copy]);
      },
    );

    test(
      'lists the tags applied to the course, a subsection and a unit under Taxonomy Alignments',
      {
        tag: '@taxonomies',
        annotation: [testId('TC-00486'), testId('TC-00488'), testId('TC-00489')],
      },
      async ({
        page,
        config,
        workerTaxonomy,
        authoringCourse,
        authoringSidebar,
        studioCourseOutlinePage,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const { courseKey } = authoringCourse;
        const section = await buildSection(
          page.request,
          config,
          courseKey,
          `E2E tagged info ${test.info().testId.slice(-6)}`,
        );
        const subsection = section.subsections[0];
        const unit = section.units[0];
        if (subsection === undefined || unit === undefined) {
          throw new Error('buildSection produced no subsection with a unit.');
        }
        // One tag on the course, two on the subsection, a different one on the unit.
        const applied: readonly (readonly [string, readonly string[]])[] = [
          [courseKey, [TAG.parentOne]],
          [subsection.usageKey, [TAG.parentOne, TAG.parentTwo]],
          [unit.usageKey, [TAG.parentThree]],
        ];
        for (const [objectId, tags] of applied) {
          await setObjectTags(page.request, config, objectId, workerTaxonomy.taxonomy.id, tags);
        }
        const tagsOf = async (objectId: string) => ({
          shown: [...(await authoringSidebar.appliedTags())].sort(),
          stored: (await fetchObjectTags(page.request, config, objectId))
            .flatMap((entry) => entry.tags.map((tag) => tag.value))
            .sort(),
        });
        const both = (tags: readonly string[]) => ({
          shown: [...tags].sort(),
          stored: [...tags].sort(),
        });

        await studioCourseOutlinePage.goto(courseKey);
        await studioCourseOutlinePage.waitForCourse(courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);

        // Nothing selected: the course's own tags.
        await expect.poll(() => tagsOf(courseKey)).toEqual(both([TAG.parentOne]));

        await studioCourseOutlinePage.select(
          studioCourseOutlinePage.subsectionTitled(subsection.displayName),
          'subsection',
        );
        await expect(authoringSidebar.title).toHaveText(subsection.displayName);
        await expect
          .poll(() => tagsOf(subsection.usageKey))
          .toEqual(both([TAG.parentOne, TAG.parentTwo]));

        await studioCourseOutlinePage.select(studioCourseOutlinePage.unit(unit.usageKey), 'unit');
        await expect(authoringSidebar.title).toHaveText(unit.displayName);
        await expect.poll(() => tagsOf(unit.usageKey)).toEqual(both([TAG.parentThree]));
      },
    );
  },
);
