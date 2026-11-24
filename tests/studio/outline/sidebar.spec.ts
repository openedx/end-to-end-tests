import { newCleanRequestContext } from '../../../src/auth';
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  addToCohort,
  buildSection,
  COURSE_NAVIGATION_PATH,
  createCohort,
  createContentGroups,
  DEFAULT_PASSWORD,
  enableCohorts,
  fetchStudioUsername,
  linkCohortToGroup,
  loginSession,
  publishXBlock,
  updateXBlock,
} from '../../../src/api';
import { knownGap, testId } from '../../../src/reporting';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Learner-sidebar cases that need authored content: unit-type icons (TC-00054),
 * cohort-restricted content (TC-00058) and staff-only sections hidden from
 * learners (TC-00059).
 *
 * These author content as an author and assert the learner's view in the same
 * run. The sidebar itself is behind `@courseware-navigation-sidebar`; the
 * authoritative reading is the learner's Blocks / navigation API, with the
 * rendered sidebar read after it where the case is about what the sidebar lists.
 */
test.describe(
  'Learner sidebar from authored content',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'shows different unit-type icons for a video unit and a problem unit',
      { tag: '@courseware-navigation-sidebar', annotation: testId('TC-00054') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E icons ${test.info().testId.slice(-6)}`,
          {
            subsections: [
              { units: [{ blocks: ['video'] }, { blocks: ['multiplechoiceresponse'] }] },
            ],
            publish: true,
          },
        );
        const [videoUnit, problemUnit] = section.units.map((u) => u.usageKey);

        // The navigation API carries a per-unit icon; the two unit types differ.
        const icons = await expect
          .poll(
            async () => {
              const nav = await authoringCourseLearner.navigation();
              return {
                video: nav?.blocks[videoUnit as string]?.icon,
                problem: nav?.blocks[problemUnit as string]?.icon,
              };
            },
            { timeout: TIMEOUTS.contentPublish },
          )
          .toMatchObject({ video: expect.any(String), problem: expect.any(String) })
          .then(() => authoringCourseLearner.navigation());
        expect(icons?.blocks[videoUnit as string]?.icon).not.toBe(
          icons?.blocks[problemUnit as string]?.icon,
        );
      },
    );

    // PLAT-009 (see `docs/findings.md`): between a publish and the CMS worker's
    // `learning_sequences` outline task landing, the navigation view raises
    // `CourseOutlineData.DoesNotExist` and answers HTTP 500 rather than an empty
    // model. `fetchCourseNavigation` rides that out for the other specs; this test
    // records the intended answer and is `fixme` until the platform is fixed.
    test.fixme(
      'answers the navigation model without a server error right after a publish (PLAT-009)',
      {
        tag: '@courseware-navigation-sidebar',
        annotation: knownGap(
          'PLAT-009: the navigation view answers HTTP 500 between a publish and the CMS worker outline task landing',
        ),
      },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E nav-500 ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html'] }] }], publish: true },
        );
        const response = await authoringCourseLearner.request.get(
          `${config.baseUrls.lms}${COURSE_NAVIGATION_PATH}${authoringCourse.courseKey}`,
        );
        expect(response.status()).toBeLessThan(500);
      },
    );

    test(
      'hides a staff-only section and a staff-only subsection from a learner',
      { tag: '@courseware-navigation-sidebar', annotation: testId('TC-00059') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        // One section the learner keeps, holding a subsection they keep and one
        // that will be hidden; and a second section hidden whole.
        const visible = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E vis-sec ${test.info().testId.slice(-6)}`,
          {
            subsections: [{ units: [{ blocks: ['html'] }] }, { units: [{ blocks: ['html'] }] }],
            publish: true,
          },
        );
        const hidden = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E staff-sec ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html'] }] }], publish: true },
        );
        const [keptSubsection, hiddenSubsection] = visible.subsections;
        const keptUnit = keptSubsection?.units[0];
        const hiddenSubsectionUnit = hiddenSubsection?.units[0];
        const hiddenSectionUnit = hidden.units[0];
        if (
          keptSubsection === undefined ||
          hiddenSubsection === undefined ||
          keptUnit === undefined ||
          hiddenSubsectionUnit === undefined ||
          hiddenSectionUnit === undefined
        ) {
          throw new Error('buildSection did not produce the sections this case needs.');
        }

        for (const key of [hidden.usageKey, hiddenSubsection.usageKey]) {
          await updateXBlock(page.request, config, key, {
            metadata: { visible_to_staff_only: true },
          });
        }

        // The learner is served the kept unit but neither hidden one. All from one
        // reading: a hide reaches the learner a publish fan-out after the visible
        // unit does, so a hidden one can still show for a while.
        const learner = authoringCourseLearner;
        await expect
          .poll(
            async () => {
              const ids = (await learner.outline()).units.map((u) => u.id);
              return {
                kept: ids.includes(keptUnit.usageKey),
                hiddenSubsection: ids.includes(hiddenSubsectionUnit.usageKey),
                hiddenSection: ids.includes(hiddenSectionUnit.usageKey),
              };
            },
            { timeout: TIMEOUTS.contentPublish },
          )
          .toEqual({ kept: true, hiddenSubsection: false, hiddenSection: false });

        // And the sidebar itself, from a unit page: the section view lists the
        // kept subsection alone, and the course outline view the kept section
        // alone. (The names are the test's own.)
        await learner.prime(keptUnit.sequentialUsageKey);
        await learner.unitPage.goto(
          learner.courseKey,
          keptUnit.sequentialUsageKey,
          keptUnit.usageKey,
        );
        await expect(learner.unitPage.sidebar).toBeVisible();
        await expect(learner.unitPage.sidebarUnitLink(keptUnit.usageKey)).toBeVisible();
        await expect(learner.unitPage.sidebarSubsections).toHaveText([
          new RegExp(escapeRegExp(keptSubsection.displayName)),
        ]);
        await expect(learner.unitPage.sidebar).not.toContainText(hiddenSubsection.displayName);

        await learner.unitPage.backToOutline();
        await expect(learner.unitPage.sidebarSections).toHaveText([
          new RegExp(escapeRegExp(visible.displayName)),
        ]);
        await expect(learner.unitPage.sidebar).not.toContainText(hidden.displayName);
      },
    );

    test(
      'restricts a unit to a cohort so only its members see it',
      { tag: ['@courseware-navigation-sidebar', '@cohorts'], annotation: testId('TC-00058') },
      async ({
        page,
        playwright,
        config,
        authoringCourse,
        studioAuthorSession,
        authoringCourseLearners,
      }) => {
        void studioAuthorSession;
        const [inCohort, outOfCohort] = authoringCourseLearners;
        const courseKey = authoringCourse.courseKey;
        const api = page.request;

        // All the Studio authoring goes through the browser session first: a
        // published section restricted to a content group.
        const section = await buildSection(
          api,
          config,
          courseKey,
          `E2E cohort ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html'] }] }], publish: true },
        );
        const unitKey = section.units[0]?.usageKey ?? '';
        const group = await createContentGroups(api, config, courseKey, [
          `E2E group ${test.info().testId.slice(-6)}`,
        ]);
        const partitionId = group.id;
        const groupId = group.groups[0]?.id as number;
        await updateXBlock(api, config, unitKey, {
          metadata: { group_access: { [partitionId]: [groupId] } },
        });
        await publishXBlock(api, config, unitKey);

        // Cohorts are LMS instructor views behind Django **session** auth, which
        // neither the browser nor the stored author API state reliably holds here
        // (they carry a JWT, which those views reject — the request lands on the
        // login page as a 405). Sign the author in afresh on a throwaway context
        // for a live LMS session. The author is this worker's own dedicated
        // account, so re-signing-in evicts no session another test still needs,
        // and all the browser's Studio writes are already done. A cohort linked to
        // the content group, with the in-cohort learner placed in it.
        const authorUsername = await fetchStudioUsername(api, config);
        const cohortApi = await newCleanRequestContext(playwright.request);
        try {
          await loginSession(cohortApi, config, {
            emailOrUsername: authorUsername,
            password: DEFAULT_PASSWORD,
          });
          await enableCohorts(cohortApi, config, courseKey);
          const cohort = await createCohort(
            cohortApi,
            config,
            courseKey,
            `E2E cohort ${test.info().testId.slice(-6)}`,
          );
          await linkCohortToGroup(cohortApi, config, courseKey, cohort, partitionId, groupId);
          await addToCohort(cohortApi, config, courseKey, cohort.id, inCohort.identity.username);
        } finally {
          await cohortApi.dispose();
        }

        // The in-cohort learner sees the unit; the out-of-cohort learner does not.
        await expect
          .poll(async () => (await inCohort.outline()).units.some((u) => u.id === unitKey), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBe(true);
        expect((await outOfCohort.outline()).units.some((u) => u.id === unitKey)).toBe(false);
      },
    );
  },
);
