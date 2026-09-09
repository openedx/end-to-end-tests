import { checkA11y } from '../../../src/a11y';
import { accountSignInStudio } from '../../../src/accounts';
import {
  fetchCourseTeam,
  listStudioCourses,
  removeCourseTeamMember,
  setCourseTeamRole,
} from '../../../src/api';
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
    async ({
      page,
      request,
      config,
      authoredCourse,
      courseTeamPage,
      studioAuthorSession,
      newLearner,
    }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      const member = await newLearner();
      try {
        await courseTeamPage.goto(courseKey);
        await courseTeamPage.addMember(member.identity.email);

        // Studio lists the member as staff.
        await expect
          .poll(async () =>
            roleOf(await fetchCourseTeam(request, config, courseKey), member.identity.email),
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
        await removeCourseTeamMember(request, config, courseKey, member.identity.email).catch(
          () => {},
        );
      }
    },
  );

  test(
    'grants admin access to a member',
    { tag: '@regression', annotation: testId('TC-00281') },
    async ({
      request,
      config,
      authoredCourse,
      courseTeamPage,
      studioAuthorSession,
      newLearner,
    }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      const member = await newLearner();
      try {
        await setCourseTeamRole(request, config, courseKey, member.identity.email, 'staff');
        await courseTeamPage.goto(courseKey);
        await courseTeamPage.toggleAdmin(member.identity.email);

        await expect
          .poll(async () =>
            roleOf(await fetchCourseTeam(request, config, courseKey), member.identity.email),
          )
          .toBe('instructor');
      } finally {
        await removeCourseTeamMember(request, config, courseKey, member.identity.email).catch(
          () => {},
        );
      }
    },
  );

  test(
    'removes admin access from a member',
    { tag: '@regression', annotation: testId('TC-00282') },
    async ({
      request,
      config,
      authoredCourse,
      courseTeamPage,
      studioAuthorSession,
      newLearner,
    }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      const member = await newLearner();
      try {
        await setCourseTeamRole(request, config, courseKey, member.identity.email, 'instructor');
        await courseTeamPage.goto(courseKey);
        await courseTeamPage.toggleAdmin(member.identity.email);

        await expect
          .poll(async () =>
            roleOf(await fetchCourseTeam(request, config, courseKey), member.identity.email),
          )
          .toBe('staff');
      } finally {
        await removeCourseTeamMember(request, config, courseKey, member.identity.email).catch(
          () => {},
        );
      }
    },
  );

  test(
    'removes a member from the course team',
    { tag: '@regression', annotation: testId('TC-00283') },
    async ({
      request,
      config,
      authoredCourse,
      courseTeamPage,
      studioAuthorSession,
      newLearner,
    }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      const member = await newLearner();
      try {
        await setCourseTeamRole(request, config, courseKey, member.identity.email, 'staff');
        await courseTeamPage.goto(courseKey);
        await courseTeamPage.removeMember(member.identity.email);

        await expect
          .poll(async () =>
            roleOf(await fetchCourseTeam(request, config, courseKey), member.identity.email),
          )
          .toBeUndefined();
      } finally {
        await removeCourseTeamMember(request, config, courseKey, member.identity.email).catch(
          () => {},
        );
      }
    },
  );
});
