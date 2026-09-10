import { checkA11y } from '../../../src/a11y';
import { accountSignInStudio } from '../../../src/accounts';
import { fetchCourseTeam, listStudioCourses, removeCourseTeamMember } from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Course Team (authoring MFE), on the worker's own course.
 *
 * The MFE drives each change; Studio's `course_team` API decides the member's
 * role, and the member's own Studio course list decides whether they gained or
 * lost access. Members are identified by the email the test supplied, never by the
 * localized role badge. Each test provisions a fresh learner and removes them at
 * the end so the shared worker course keeps only its author.
 *
 * Members are added and their roles changed through the MFE, not the course-team
 * write API: the browser's own request is the one that works across releases (the
 * legacy Studio write handler answers a non-browser JSON client with HTML on older
 * releases such as verawood).
 */
test.describe('Course Team', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  /** The role Studio reports for `email`, or undefined when not on the team. */
  const roleOf = (
    team: Awaited<ReturnType<typeof fetchCourseTeam>>,
    email: string,
  ): string | undefined => team.find((member) => member.email === email)?.role;

  test(
    'adds a new member to the course team',
    { tag: '@regression', annotation: testId('TC-00280') },
    async ({ page, config, authoredCourse, courseTeamPage, studioAuthorSession, newLearner }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      const member = await newLearner();
      try {
        await courseTeamPage.goto(courseKey);
        await courseTeamPage.addMember(member.identity.email);

        // Studio lists the member as staff.
        await expect
          .poll(async () =>
            roleOf(await fetchCourseTeam(api, config, courseKey), member.identity.email),
          )
          .toBe('staff');

        // The member now sees the course in their own Studio course list.
        await accountSignInStudio({
          config,
          request: member.request,
          credentials: {
            emailOrUsername: member.identity.email,
            password: member.identity.password,
          },
        });
        await expect
          .poll(async () => {
            const listed = await listStudioCourses(member.request, config, {
              search: authoredCourse.number,
            });
            return listed.courses.map((course) => course.courseKey);
          })
          .toContain(courseKey);

        await checkA11y(page, { label: 'studio-course-team' });
      } finally {
        await removeCourseTeamMember(api, config, courseKey, member.identity.email).catch(() => {});
      }
    },
  );

  test(
    'grants admin access to a member',
    { tag: '@regression', annotation: testId('TC-00281') },
    async ({ page, config, authoredCourse, courseTeamPage, studioAuthorSession, newLearner }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      const member = await newLearner();
      try {
        // Seeded through the UI, not the course-team write API: the MFE's own
        // request is the one that works across releases (see the spec-level note).
        await courseTeamPage.goto(courseKey);
        await courseTeamPage.addMember(member.identity.email);
        await courseTeamPage.toggleAdmin(member.identity.email);

        await expect
          .poll(async () =>
            roleOf(await fetchCourseTeam(api, config, courseKey), member.identity.email),
          )
          .toBe('instructor');
      } finally {
        await removeCourseTeamMember(api, config, courseKey, member.identity.email).catch(() => {});
      }
    },
  );

  test(
    'removes admin access from a member',
    { tag: '@regression', annotation: testId('TC-00282') },
    async ({ page, config, authoredCourse, courseTeamPage, studioAuthorSession, newLearner }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      const member = await newLearner();
      try {
        // Add through the UI and promote to Admin, so the case under test — the
        // demotion — starts from an admin member.
        await courseTeamPage.goto(courseKey);
        await courseTeamPage.addMember(member.identity.email);
        await courseTeamPage.toggleAdmin(member.identity.email);
        await expect
          .poll(async () =>
            roleOf(await fetchCourseTeam(api, config, courseKey), member.identity.email),
          )
          .toBe('instructor');

        // Reload so the toggle reflects the just-applied admin role before demoting.
        await courseTeamPage.goto(courseKey);
        await courseTeamPage.toggleAdmin(member.identity.email);

        await expect
          .poll(async () =>
            roleOf(await fetchCourseTeam(api, config, courseKey), member.identity.email),
          )
          .toBe('staff');
      } finally {
        await removeCourseTeamMember(api, config, courseKey, member.identity.email).catch(() => {});
      }
    },
  );

  test(
    'removes a member from the course team',
    { tag: '@regression', annotation: testId('TC-00283') },
    async ({ page, config, authoredCourse, courseTeamPage, studioAuthorSession, newLearner }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      const member = await newLearner();
      try {
        await courseTeamPage.goto(courseKey);
        await courseTeamPage.addMember(member.identity.email);
        await courseTeamPage.removeMember(member.identity.email);

        await expect
          .poll(async () =>
            roleOf(await fetchCourseTeam(api, config, courseKey), member.identity.email),
          )
          .toBeUndefined();
      } finally {
        await removeCourseTeamMember(api, config, courseKey, member.identity.email).catch(() => {});
      }
    },
  );
});
