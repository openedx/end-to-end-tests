import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  authorStaffGradedOra,
  buildSection,
  fetchInstructorCourse,
  grantCourseTeamRole,
  type CourseTeamRoleV2,
} from '../../../src/api';
import type { InstructorDashboardPage } from '../../../src/pages/lms/instructor/dashboard.page';
import {
  ensureDataResearcher,
  expectedInstructorTabs,
  type InstructorTabConditions,
  type InstructorViewer,
} from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_TAGS, label } from './helpers';

/**
 * Which instructor-dashboard tools each course role is offered (TC-00514).
 *
 * The expected set is the platform's own rule table (`expectedInstructorTabs`),
 * applied to what each test set up on a course of its own — an ORA (Open
 * Responses), course e-mail (Bulk Email) and, for the instructor, the Data
 * Researcher role (Data Downloads) — and to what the target declares
 * (`special-exams` adds Special Exams, `analytics` Aspects' Reports). It is
 * not the sheet's list, which gives
 * staff the Course Team tab (the platform offers it to staff only as
 * Discussion Admins) and assumes Special Exams, Certificates and Reports,
 * which are deployment options.
 *
 * Each viewer is read twice, together: the dashboard model's `tabs[]` and the
 * links the dashboard's nav renders, which must be exactly those tabs.
 */

async function prepareCourse(
  author: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  name: string,
  courseEmailFor: (courseKey: string) => Promise<void>,
): Promise<Omit<InstructorTabConditions, 'dataResearcher'>> {
  const section = await buildSection(author, config, courseKey, name, {
    subsections: [{ units: [{ blocks: [] }] }],
  });
  await authorStaffGradedOra(author, config, section.units[0]!.usageKey, `${name} ORA`);
  await courseEmailFor(courseKey);
  return {
    hasOra: true,
    emailEnabled: true,
    // A new course's timed exams follow the platform setting, which `special-exams` declares.
    specialExams: config.capabilities.has('special-exams'),
    aspects: config.capabilities.has('analytics'),
  };
}

/**
 * The dashboard model's tabs and the nav's links, as one viewer reads them —
 * both taken in the same poll, so a grant still settling cannot split them.
 */
async function readTabs(
  request: APIRequestContext,
  dashboard: InstructorDashboardPage,
  config: AppConfig,
  courseKey: string,
) {
  const { tabs } = await fetchInstructorCourse(request, config, courseKey);
  await dashboard.goto(courseKey);
  return {
    ids: tabs.map((tab) => tab.tab_id),
    urls: tabs.map((tab) => tab.url).sort(),
    navHrefs: [...(await dashboard.navTabHrefs())].sort(),
  };
}

/**
 * How a viewer's reading departs from the rules: required tabs missing, tabs
 * offered beyond them (tolerated ones aside), and nav links that are not the
 * model's tabs. A reading that follows the rules is all empty.
 */
function departures(
  read: Awaited<ReturnType<typeof readTabs>>,
  viewer: InstructorViewer,
  conditions: InstructorTabConditions,
) {
  const expected = expectedInstructorTabs(viewer, conditions);
  return {
    missing: expected.required.filter((id) => !read.ids.includes(id)),
    unexpected: read.ids.filter(
      (id) => !expected.required.includes(id) && !(id in expected.tolerated),
    ),
    navLinksNotTabs: read.navHrefs.filter((href) => !read.urls.includes(href)),
    tabsNotInNav: read.urls.filter((url) => !read.navHrefs.includes(url)),
  };
}

const FOLLOWS_THE_RULES = { missing: [], unexpected: [], navLinksNotTabs: [], tabsNotInNav: [] };

const ROLES: readonly {
  readonly viewer: Exclude<InstructorViewer, 'instructor'>;
  readonly part: 'staff' | 'limitedStaff' | 'discussionAdmin';
  readonly roles: readonly CourseTeamRoleV2[];
}[] = [
  { viewer: 'staff', part: 'staff', roles: ['staff'] },
  { viewer: 'limitedStaff', part: 'limitedStaff', roles: ['limited_staff'] },
  { viewer: 'staffDiscussionAdmin', part: 'discussionAdmin', roles: ['staff', 'Administrator'] },
];

test.describe(
  'Instructor dashboard tools by role',
  { tag: ['@regression', ...INSTRUCTOR_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'the course instructor is offered the instructor tools',
      { annotation: testId('TC-00514') },
      async (
        { page, config, authoringCourse, studioAuthorSession, instructorDashboard, courseEmailFor },
        testInfo,
      ) => {
        void studioAuthorSession;
        const { courseKey } = authoringCourse;
        const course = await prepareCourse(
          page.request,
          config,
          courseKey,
          label('tabs', testInfo.testId),
          courseEmailFor,
        );
        await ensureDataResearcher(page.request, config, courseKey);
        const conditions = { ...course, dataResearcher: true };
        await expect
          .poll(async () =>
            departures(
              await readTabs(page.request, instructorDashboard, config, courseKey),
              'instructor',
              conditions,
            ),
          )
          .toEqual(FOLLOWS_THE_RULES);
      },
    );

    for (const { viewer, part, roles } of ROLES) {
      test(
        `${viewer} is offered the staff tools`,
        { annotation: testId('TC-00514') },
        async (
          { page, config, authoringCourse, studioAuthorSession, instructorCast, courseEmailFor },
          testInfo,
        ) => {
          void studioAuthorSession;
          const { courseKey } = authoringCourse;
          const course = await prepareCourse(
            page.request,
            config,
            courseKey,
            label('tabs', testInfo.testId),
            courseEmailFor,
          );
          const member = await instructorCast(part);
          for (const role of roles) {
            await grantCourseTeamRole(
              page.request,
              config,
              courseKey,
              [member.identity.username],
              role,
            );
          }
          await expect
            .poll(async () =>
              departures(
                await readTabs(member.request, member.instructorDashboardPage, config, courseKey),
                viewer,
                { ...course, dataResearcher: false },
              ),
            )
            .toEqual(FOLLOWS_THE_RULES);
        },
      );
    }
  },
);
