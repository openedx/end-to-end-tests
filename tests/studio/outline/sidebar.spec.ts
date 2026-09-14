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
import { testId } from '../../../src/reporting';

/**
 * Learner-sidebar cases that need authored content: unit-type icons (TC-00054),
 * cohort-restricted content (TC-00058) and staff-only sections hidden from
 * learners (TC-00059).
 *
 * These author content as an author and assert the learner's view in the same
 * run. The sidebar itself is behind `@courseware-navigation-sidebar`; the
 * authoritative reading is the learner's Blocks / navigation API.
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

    // PLAT-009 (see `.private/findings.md`): between a publish and the CMS worker's
    // `learning_sequences` outline task landing, the navigation view raises
    // `CourseOutlineData.DoesNotExist` and answers HTTP 500 rather than an empty
    // model. `fetchCourseNavigation` rides that out for the other specs; this test
    // records the intended answer and is `fixme` until the platform is fixed.
    test.fixme(
      'answers the navigation model without a server error right after a publish (PLAT-009)',
      { tag: '@courseware-navigation-sidebar' },
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
      'hides a staff-only section from a learner',
      { tag: '@courseware-navigation-sidebar', annotation: testId('TC-00059') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        const visible = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E vis-sec ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html'] }] }], publish: true },
        );
        const hidden = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E staff-sec ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html'] }] }], publish: true },
        );
        const visibleUnit = visible.units[0]?.usageKey ?? '';
        const hiddenUnit = hidden.units[0]?.usageKey ?? '';

        await updateXBlock(page.request, config, hidden.usageKey, {
          metadata: { visible_to_staff_only: true },
        });

        // The learner sees the visible section's unit but not the staff-only one.
        await expect
          .poll(async () => (await authoringCourseLearner.outline()).units.map((u) => u.id), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toContain(visibleUnit);
        expect((await authoringCourseLearner.outline()).units.map((u) => u.id)).not.toContain(
          hiddenUnit,
        );
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
        const cohortApi = await playwright.request.newContext();
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
