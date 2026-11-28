import type { Page } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import {
  STUDIO_OUTLINE_PAGE_SELECTORS,
  TIMEOUTS,
  type AppConfig,
  escapeRegExp,
} from '../../../src/config';
import { courseUsageKey, fetchCourseMetadata, fetchXBlockOutline } from '../../../src/api';
import { CatalogPage } from '../../../src/pages/lms/catalog/catalog.page';
import { CourseAboutPage } from '../../../src/pages/lms/catalog/course-about.page';
import { UnitPage } from '../../../src/pages/lms/courseware/unit.page';
import type { StudioCourseOutlinePage } from '../../../src/pages/studio/course-outline.page';
import { testId } from '../../../src/reporting';
import { locateCourseInCatalog } from '../../../src/steps';

/**
 * Publishing content in a **future-dated course** (its start is years away) and
 * confirming a learner cannot reach it until the course starts — for a unit
 * (TC-00150), a subsection (TC-00151) and a section (TC-00152).
 *
 * The author works in the outline as the cases describe: adds a section, a
 * subsection and a unit, names them, and publishes at the level the case is
 * about; `xblock/outline` confirms the unit went from draft to published. "View
 * live" then takes the author into the LMS, where the unit is served to them.
 *
 * The learner side is the course About page, reached from the catalog: it
 * renders, and offers no way into the course. That the content itself is
 * withheld is read from `course_metadata` (`course_not_started`), not the
 * Blocks API, which 500s on a not-yet-started course (`PLAT-007`).
 */
test.describe(
  'Future-dated course publishing',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    // Round trips poll the learner under TIMEOUTS.contentPublish (longer than the
    // default per-test budget), so the block-structure task's delay under load
    // does not trip the test timeout.
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    for (const { level, id } of [
      { level: 'unit', id: 'TC-00150' },
      { level: 'subsection', id: 'TC-00151' },
      { level: 'section', id: 'TC-00152' },
    ] as const) {
      test(
        `a learner cannot reach a published ${level} before the course starts`,
        { annotation: testId(id) },
        async ({
          page,
          config,
          studioCourseOutlinePage,
          futureCourse,
          studioAuthorSession,
          futureCourseLearner,
        }) => {
          void studioAuthorSession;
          const { courseKey } = futureCourse;
          const outline = studioCourseOutlinePage;
          const authored = await authorInOutline(
            outline,
            page.request,
            config,
            courseKey,
            `E2E fut-${level} ${test.info().testId.slice(-6)}`,
          );
          const unitState = async () => {
            const unit = await fetchXBlockOutline(page.request, config, authored.unit.key);
            return { name: unit.display_name, published: unit.published };
          };

          // Named as typed, and a draft until something publishes it.
          expect(await unitState()).toEqual({ name: authored.unit.name, published: false });
          expect(
            (await fetchXBlockOutline(page.request, config, authored[level].key)).display_name,
          ).toBe(authored[level].name);

          // Publish from the card's menu at this case's level; the unit below
          // (or the unit itself) is then live.
          const card = {
            unit: outline.unit(authored.unit.key),
            subsection: outline.subsection(authored.unit.key),
            section: outline.section(authored.unit.key),
          }[level];
          await outline.publish(card, level);
          await expect
            .poll(unitState, { timeout: TIMEOUTS.contentPublish })
            .toEqual({ name: authored.unit.name, published: true });

          // "View live" opens the course in the LMS, where the author (course
          // staff see a course before it starts) can open the unit just published.
          const live = await outline.viewLive();
          try {
            await expect(live).toHaveURL(new RegExp(escapeRegExp(courseKey)));
            const liveUnit = new UnitPage(live, config);
            await live.goto(liveUnit.url(courseKey, authored.subsection.key, authored.unit.key));
            await expect(liveUnit.iframe).toBeVisible({ timeout: TIMEOUTS.contentPublish });
            await expect(live).toHaveURL(new RegExp(escapeRegExp(authored.unit.key)));
          } finally {
            await live.close();
          }

          await expectCourseNotStarted(futureCourseLearner, config);
        },
      );
    }

    // The positive half — the same content IS reachable once the course has
    // started — is covered by the content course's own round trips (structure /
    // publish specs); here the future course's start is never moved.
  },
);

interface Named {
  readonly key: string;
  readonly name: string;
}

/**
 * Adds a section, a subsection in it and a unit in that, through the outline's
 * own buttons, naming each (`<label> section` and so on). Leaves the outline
 * open and expanded.
 */
async function authorInOutline(
  outline: StudioCourseOutlinePage,
  request: Page['request'],
  config: AppConfig,
  courseKey: string,
  label: string,
): Promise<{ section: Named; subsection: Named; unit: Named }> {
  const names = {
    section: `${label} section`,
    subsection: `${label} subsection`,
    unit: `${label} unit`,
  };
  await outline.goto(courseKey);
  await outline.waitForCourse(courseKey);

  // The course is the worker's, shared with the other cases here, so the new
  // section is awaited as one card more than the course held (asked of the
  // platform: the cards render after the page reports ready); its subsection is
  // the only one inside it.
  const sectionsBefore =
    (await fetchXBlockOutline(request, config, courseUsageKey(courseKey))).child_info?.children
      .length ?? 0;
  const sectionKey = await outline.addSection();
  const sectionCard = outline.sectionCards.nth(sectionsBefore);
  await sectionCard.waitFor();
  const subsectionKey = await outline.addSubsection(sectionCard);
  const subsectionCard = sectionCard.locator(STUDIO_OUTLINE_PAGE_SELECTORS.subsectionCard).last();

  // "New unit" opens the unit's own page. Back on the outline (reloaded, so
  // expanded again) each card is found by the unit it holds, and named.
  const unitKey = await outline.addUnit(subsectionCard);
  await outline.goto(courseKey);
  await outline.waitForCourse(courseKey);
  await outline.setAllExpanded(true);
  await outline.rename(outline.unit(unitKey), 'unit', names.unit);
  await outline.rename(outline.subsection(unitKey), 'subsection', names.subsection);
  await outline.rename(outline.section(unitKey), 'section', names.section);

  return {
    section: { key: sectionKey, name: names.section },
    subsection: { key: subsectionKey, name: names.subsection },
    unit: { key: unitKey, name: names.unit },
  };
}

async function expectCourseNotStarted(
  learner: {
    request: Page['request'];
    page: Page;
    courseKey: string;
    navigation: () => Promise<unknown>;
  },
  config: AppConfig,
): Promise<void> {
  // Read repeatedly: the block-structure task runs on publish, but the course's
  // not-started gate is what the learner hits regardless.
  await expect
    .poll(
      async () =>
        (await fetchCourseMetadata(learner.request, config, learner.courseKey)).course_access
          .error_code,
      { timeout: TIMEOUTS.contentPublish },
    )
    .toBe('course_not_started');
  expect(await learner.navigation()).toBeUndefined();

  // What the learner has instead is the About page, from the catalog's card for
  // the course (found by its number, an identifier): it renders the course's
  // description and, enrolled though they are, no link into the course. The
  // link would sit beside the enrolled status, so that is waited for first.
  const catalog = new CatalogPage(learner.page, config);
  const about = new CourseAboutPage(learner.page, config);
  const number = learner.courseKey.split('+')[1] ?? learner.courseKey;
  await locateCourseInCatalog(catalog, config, learner.courseKey, number);
  await catalog.openCourseAbout(learner.courseKey);
  await expect(about.overview).toBeVisible();
  await expect(about.enrollmentStatus).toBeVisible();
  await expect(about.coursewareLink(learner.courseKey)).toHaveCount(0);
}
