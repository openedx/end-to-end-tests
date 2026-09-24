import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  divideDiscussionsByCohort,
  enableCohortsV1,
  grantCourseTeamRole,
  listCourseTeam,
  type CourseTeamRoleV2,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_A11Y_BASELINE, INSTRUCTOR_TAGS } from './helpers';

/**
 * Course Team: the extended roles (TC-00520). The instructor adds a member to
 * each role through the Course Team tab's modal; the v2 team list for that
 * role, which covers the forum roles too, decides. The sheet's "Course Data
 * Researcher" and "Group Community TA" are the Roles tab's headings; the roles
 * are Data Researcher and Group Moderator.
 *
 * The member is the worker's `teamMember` cast account. On `contentCourse` each
 * test takes its role away again, so roles never accumulate there; the Group
 * Moderator case has a course of its own, divided by cohort as its role needs.
 */
const ROLES: readonly CourseTeamRoleV2[] = [
  'beta',
  'data_researcher',
  'Administrator',
  'Moderator',
  'Community TA',
];

test.describe(
  'Instructor dashboard: course team roles',
  { tag: ['@regression', ...INSTRUCTOR_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    for (const role of ROLES) {
      test(
        `adds a member to the ${role} role`,
        { annotation: testId('TC-00520') },
        async ({
          page,
          config,
          contentCourse,
          studioAuthorSession,
          instructorCourseTeam,
          instructorCast,
        }) => {
          void studioAuthorSession;
          const { courseKey } = contentCourse;
          const { username } = (await instructorCast('teamMember')).identity;
          try {
            await instructorCourseTeam.gotoTab(courseKey);
            const added = await instructorCourseTeam.addMember(username, role);
            expect(added.ok()).toBe(true);
            expect((await added.json()) as unknown).toMatchObject({ results: [{ error: false }] });
            await expect
              .poll(async () =>
                (await listCourseTeam(page.request, config, courseKey, role)).map(
                  (m) => m.username,
                ),
              )
              .toContain(username);
          } finally {
            await grantCourseTeamRole(page.request, config, courseKey, [username], role, 'revoke');
          }
        },
      );
    }

    test(
      'adds a Group Moderator to a course whose discussions are divided by cohort',
      { tag: ['@cohorts', '@discussions'], annotation: testId('TC-00520') },
      async ({
        page,
        config,
        authoringCourse,
        studioAuthorSession,
        instructorCourseTeam,
        instructorCast,
        adminLms,
      }) => {
        void studioAuthorSession;
        const { courseKey } = authoringCourse;
        // The role's premise: cohorts on, and the course's discussions divided by them.
        await enableCohortsV1(page.request, config, courseKey);
        expect(
          await adminLms((session) => divideDiscussionsByCohort(session, config, courseKey)),
        ).toBe('cohort');

        const { username } = (await instructorCast('teamMember')).identity;
        await instructorCourseTeam.gotoTab(courseKey);
        await checkA11y(page, {
          label: 'instructor-course-team',
          additionalBaseline: [...INSTRUCTOR_A11Y_BASELINE],
        });
        const added = await instructorCourseTeam.addMember(username, 'Group Moderator');
        expect(added.ok()).toBe(true);
        await expect
          .poll(async () =>
            (await listCourseTeam(page.request, config, courseKey, 'Group Moderator')).map(
              (m) => m.username,
            ),
          )
          .toContain(username);
      },
    );
  },
);
