import { checkA11y } from '../../../src/a11y';
import { accountSignInStudio } from '../../../src/accounts';
import {
  fetchCourseTeam,
  fetchCourseTeamCaller,
  listStudioCourses,
  removeCourseTeamMember,
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
 *
 * Members are added and their roles changed through the MFE, not the course-team
 * write API: the browser's own request is the one that works across releases (the
 * legacy Studio write handler answers a non-browser JSON client with HTML on older
 * releases such as verawood).
 *
 * What the page offers depends on who reads it: Studio answers, per caller,
 * whether the caller may manage the team and whether it is the course's only
 * admin, and the page renders the management controls and the
 * transfer-ownership hint from those answers. The last two cases read that
 * answer and check the page drew the same thing, structurally.
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

  test(
    'shows a staff member the team without the controls to change it',
    { tag: '@regression' },
    async ({ page, config, authoredCourse, courseTeamPage, studioAuthorSession, rbacCast }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      // A cast account that only ever plays course staff (the `rbacCast` rule).
      const staff = await rbacCast('courseStaff');
      try {
        await courseTeamPage.goto(courseKey);
        await courseTeamPage.addMember(staff.identity.email);
        await expect
          .poll(async () =>
            roleOf(await fetchCourseTeam(api, config, courseKey), staff.identity.email),
          )
          .toBe('staff');

        // Studio's answer for the staff member: it may not manage the team, and it
        // is not the only admin.
        expect(await fetchCourseTeamCaller(staff.page.request, config, courseKey)).toEqual({
          canManageTeam: false,
          isOnlyAdmin: false,
        });

        // The page lists every member Studio lists, both readings taken together…
        await staff.courseTeamPage.goto(courseKey);
        await expect
          .poll(async () => {
            const listed = (await fetchCourseTeam(staff.page.request, config, courseKey))
              .map((member) => member.email)
              .sort();
            const rendered = (await staff.courseTeamPage.memberEmails()).sort();
            return JSON.stringify(rendered) === JSON.stringify(listed)
              ? 'match'
              : `rendered ${JSON.stringify(rendered)} vs api ${JSON.stringify(listed)}`;
          })
          .toBe('match');
        await expect(staff.courseTeamPage.memberRow(staff.identity.email)).toBeVisible();

        // …and offers no way to change it: no add button, no add-member form, no
        // per-member role or delete controls, no transfer-ownership hint.
        await expect(staff.courseTeamPage.newMemberButton).toHaveCount(0);
        await expect(staff.courseTeamPage.emailInput).toHaveCount(0);
        await expect(staff.courseTeamPage.memberActions).toHaveCount(0);
        await expect(staff.courseTeamPage.ownershipHint).toHaveCount(0);

        await checkA11y(staff.page, { label: 'studio-course-team-staff' });
      } finally {
        await removeCourseTeamMember(api, config, courseKey, staff.identity.email).catch(() => {});
      }
    },
  );

  test(
    "shows the course's only admin the transfer-ownership hint",
    { tag: '@regression' },
    async ({ page, config, authoredCourse, courseTeamPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;

      // The worker course's creator is its only admin, and Studio says so.
      const admins = (await fetchCourseTeam(api, config, courseKey)).filter(
        (member) => member.role === 'instructor',
      );
      expect(admins).toHaveLength(1);
      expect(await fetchCourseTeamCaller(api, config, courseKey)).toEqual({
        canManageTeam: true,
        isOnlyAdmin: true,
      });
      const adminEmail = admins[0]?.email ?? '';

      await courseTeamPage.goto(courseKey);

      // The sidebar carries the hint, and the admin's own row offers no control to
      // demote or delete the last admin — the "add another admin first" hint
      // stands in for them.
      await expect(courseTeamPage.ownershipHint).toBeVisible();
      await expect(courseTeamPage.memberHint(adminEmail)).toBeVisible();
      await expect(courseTeamPage.memberActionsOf(adminEmail)).toHaveCount(0);
      // The caller may manage the team, so the add button is offered.
      await expect(courseTeamPage.newMemberButton).toBeVisible();
    },
  );
});
