import { expect, test } from '../../../src/fixtures';
import {
  courseUsageKey,
  enrollInCourseViaApi,
  grantCourseTeamRole,
  grantLegacyRole,
  revokeLegacyRole,
} from '../../../src/api';
import { TIMEOUTS, getRunId } from '../../../src/config';
import {
  FULL_COURSE_ACCESS,
  NO_COURSE_ACCESS,
  instructorTabsFor,
  readCoursePermissions,
} from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { LEGACY_ROLE_TAGS, futureSection, seesUnit, writableSection } from './helpers';
import { migrationCourse, newOrgName } from '../transition/helpers';

/**
 * What each **legacy** course role may do — the permission matrix the AuthZ
 * transition has to preserve (`TC-00579`–`TC-00586`).
 *
 * One table serves every case: six capabilities read as the actor itself, from
 * the Studio outline down to the Blocks API, chosen because between them they
 * tell all six roles apart. Each case asserts the whole row at once, so a
 * regression names the capability that moved rather than failing on the first
 * request. `readCoursePermissions` only *reads*; the expectation lives here.
 *
 * The same six rows are read again after a migration and after a rollback
 * (TC-00593–00599, TC-00606–00612) — this spec is the phase-one reading of that
 * comparison, and it runs with no waffle override anywhere near it.
 *
 * Roles are granted through the instructor API, except the organization-wide one
 * of TC-00585: a role with a blank course id exists only in the Django admin,
 * which is why that case needs a superuser and skips without one.
 */
test.describe('Legacy course roles', { tag: ['@regression', ...LEGACY_ROLE_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'gives an instructor every course capability, including the team and date tools',
    { annotation: testId('TC-00579') },
    async (
      { page, config, contentCourse, studioAuthorSession, rbacCast, resyncStudioAuthor },
      testInfo,
    ) => {
      void studioAuthorSession;
      const courseKey = contentCourse.courseKey;
      const instructor = await rbacCast('instructor');
      await grantCourseTeamRole(
        page.request,
        config,
        courseKey,
        [instructor.identity.email],
        'instructor',
      );
      await resyncStudioAuthor();
      const writableBlock = await writableSection(
        page.request,
        config,
        courseKey,
        `E2E instructor ${testInfo.testId.slice(-6)}`,
      );

      expect(
        await readCoursePermissions(
          instructor.request,
          config,
          courseKey,
          instructor.identity.username,
          { writableBlock },
        ),
      ).toEqual(FULL_COURSE_ACCESS);

      // The two tools only an instructor is offered: managing the team and
      // granting date extensions.
      const tabs = await instructorTabsFor(instructor.request, config, courseKey);
      expect(tabs).toEqual(expect.arrayContaining(['course_team', 'date_extensions']));

      // End to end: Studio lists the course to them.
      await instructor.studioHomePage.goto();
      await expect(instructor.studioHomePage.courseCardLink(courseKey)).toBeVisible();
    },
  );

  test(
    'gives staff the same access but not the team or date tools',
    { annotation: testId('TC-00580') },
    async (
      { page, config, contentCourse, studioAuthorSession, rbacCast, resyncStudioAuthor },
      testInfo,
    ) => {
      void studioAuthorSession;
      const courseKey = contentCourse.courseKey;
      const staff = await rbacCast('staff');
      await grantCourseTeamRole(page.request, config, courseKey, [staff.identity.email], 'staff');
      await resyncStudioAuthor();
      const writableBlock = await writableSection(
        page.request,
        config,
        courseKey,
        `E2E staff ${testInfo.testId.slice(-6)}`,
      );

      // Every capability an instructor has: staff author the course too.
      expect(
        await readCoursePermissions(staff.request, config, courseKey, staff.identity.username, {
          writableBlock,
        }),
      ).toEqual(FULL_COURSE_ACCESS);

      // The restriction is in what the dashboard offers them, not in what they
      // may read: no Course Team tab, no Date Extensions.
      const tabs = await instructorTabsFor(staff.request, config, courseKey);
      expect(tabs).not.toContain('course_team');
      expect(tabs).not.toContain('date_extensions');
      expect(tabs).toContain('enrollments');

      await staff.studioHomePage.goto();
      await expect(staff.studioHomePage.courseCardLink(courseKey)).toBeVisible();
    },
  );

  test(
    'keeps limited staff out of Studio while leaving the dashboard open',
    { annotation: testId('TC-00581') },
    async (
      { page, config, contentCourse, studioAuthorSession, rbacCast, resyncStudioAuthor },
      testInfo,
    ) => {
      void studioAuthorSession;
      const courseKey = contentCourse.courseKey;
      const limited = await rbacCast('limitedStaff');
      await grantCourseTeamRole(
        page.request,
        config,
        courseKey,
        [limited.identity.email],
        'limited_staff',
      );
      await resyncStudioAuthor();
      const writableBlock = await writableSection(
        page.request,
        config,
        courseKey,
        `E2E limited ${testInfo.testId.slice(-6)}`,
      );

      // The role's whole point: the LMS side of staff without the authoring side.
      expect(
        await readCoursePermissions(limited.request, config, courseKey, limited.identity.username, {
          writableBlock,
        }),
      ).toEqual({
        ...FULL_COURSE_ACCESS,
        studioOutline: 403,
        studioWrite: 403,
      });
      expect(await instructorTabsFor(limited.request, config, courseKey)).toContain('enrollments');

      // And Studio does not list the course to them at all.
      await limited.studioHomePage.goto();
      await expect(limited.studioHomePage.courseCardLink(courseKey)).toHaveCount(0);
    },
  );

  test(
    'gives a data researcher the downloads and nothing else',
    { annotation: testId('TC-00582') },
    async (
      { page, config, contentCourse, studioAuthorSession, rbacCast, resyncStudioAuthor },
      testInfo,
    ) => {
      void studioAuthorSession;
      const courseKey = contentCourse.courseKey;
      const researcher = await rbacCast('dataResearcher');
      await grantCourseTeamRole(
        page.request,
        config,
        courseKey,
        [researcher.identity.email],
        'data_researcher',
      );
      await resyncStudioAuthor();
      const writableBlock = await writableSection(
        page.request,
        config,
        courseKey,
        `E2E researcher ${testInfo.testId.slice(-6)}`,
      );

      // Reports yes, learner list no — the line this role draws.
      expect(
        await readCoursePermissions(
          researcher.request,
          config,
          courseKey,
          researcher.identity.username,
          { writableBlock },
        ),
      ).toEqual({
        ...NO_COURSE_ACCESS,
        instructorDashboard: 200,
        dataDownloads: 200,
        courseware: 200,
      });

      // The dashboard offers them exactly one tab.
      expect(await instructorTabsFor(researcher.request, config, courseKey)).toEqual([
        'data_downloads',
      ]);
      await researcher.studioHomePage.goto();
      await expect(researcher.studioHomePage.courseCardLink(courseKey)).toHaveCount(0);
    },
  );

  test(
    'gives a beta tester a learner’s access, early',
    { annotation: testId('TC-00583') },
    async (
      { page, config, contentCourse, studioAuthorSession, rbacCast, resyncStudioAuthor },
      testInfo,
    ) => {
      void studioAuthorSession;
      const courseKey = contentCourse.courseKey;
      const beta = await rbacCast('beta');
      const student = await rbacCast('learner');
      await grantCourseTeamRole(page.request, config, courseKey, [beta.identity.email], 'beta');
      await enrollInCourseViaApi(student.request, config, courseKey);
      await resyncStudioAuthor();
      const writableBlock = await writableSection(
        page.request,
        config,
        courseKey,
        `E2E beta ${testInfo.testId.slice(-6)}`,
      );

      // No staff capability of any kind: a beta tester is a learner.
      expect(
        await readCoursePermissions(beta.request, config, courseKey, beta.identity.username, {
          writableBlock,
        }),
      ).toEqual({ ...NO_COURSE_ACCESS, courseware: 200 });

      // What the role does add: content that has not been released yet. The
      // content course admits beta testers a year early, so a section dated a
      // month out is theirs to see and the enrolled student's to wait for.
      const section = await futureSection(
        page.request,
        config,
        courseKey,
        `E2E beta early ${testInfo.testId.slice(-6)}`,
      );
      const unitKey = section.units[0]?.usageKey ?? '';
      await expect
        .poll(() => seesUnit(beta.request, config, courseKey, beta.identity.username, unitKey), {
          timeout: TIMEOUTS.contentPublish,
        })
        .toBe(true);
      expect(
        await seesUnit(student.request, config, courseKey, student.identity.username, unitKey),
      ).toBe(false);
    },
  );

  test(
    'lets an enrolled student consume the course and nothing more',
    { annotation: testId('TC-00584') },
    async (
      { page, config, contentCourse, studioAuthorSession, rbacCast, resyncStudioAuthor },
      testInfo,
    ) => {
      void studioAuthorSession;
      const courseKey = contentCourse.courseKey;
      const student = await rbacCast('learner');
      const outsider = await rbacCast('outsider');
      await enrollInCourseViaApi(student.request, config, courseKey);
      await resyncStudioAuthor();
      const writableBlock = await writableSection(
        page.request,
        config,
        courseKey,
        `E2E student ${testInfo.testId.slice(-6)}`,
      );

      // The content, and only the content.
      expect(
        await readCoursePermissions(student.request, config, courseKey, student.identity.username, {
          writableBlock,
        }),
      ).toEqual({ ...NO_COURSE_ACCESS, courseware: 200 });

      // Which is itself a permission: an account with no relationship to the
      // course is refused even that.
      expect(
        await readCoursePermissions(
          outsider.request,
          config,
          courseKey,
          outsider.identity.username,
          { writableBlock },
        ),
      ).toEqual(NO_COURSE_ACCESS);

      await student.studioHomePage.goto();
      await expect(student.studioHomePage.courseCardLink(courseKey)).toHaveCount(0);
    },
  );

  test(
    'gives an organization instructor every course in that organization and none outside it',
    { annotation: testId('TC-00585') },
    async (
      { page, config, contentCourse, adminLms, studioAuthorSession, rbacCast, resyncStudioAuthor },
      testInfo,
    ) => {
      void studioAuthorSession;
      // An organization of this test's own, with a course of its own in it.
      // Naming an existing organization would tie the case to how the target is
      // configured: CI runs the suite with `ORG=OpenedX`, which is also the demo
      // course's organization, so "another organization's course" has to be
      // built rather than borrowed — and building the pair here keeps the shared
      // worker courses free of this test's content.
      const org = newOrgName(getRunId(), `M${testInfo.parallelIndex}`);
      await resyncStudioAuthor();
      const owned = await migrationCourse(
        page.request,
        config,
        getRunId(),
        `M${testInfo.parallelIndex}`,
        org,
      );
      const orgInstructor = await rbacCast('orgInstructor');

      // An organization-wide role has no API: the admin's Course Access Role
      // form, with the course id left blank, is the documented route.
      const rowPk = await adminLms((session) =>
        grantLegacyRole(session, config, {
          email: orgInstructor.identity.email,
          org,
          role: 'instructor',
        }),
      );

      try {
        // The organization's course is theirs in full…
        await resyncStudioAuthor();
        const writableBlock = await writableSection(
          page.request,
          config,
          owned,
          `E2E org ${testInfo.testId.slice(-6)}`,
        );
        expect(
          await readCoursePermissions(
            orgInstructor.request,
            config,
            owned,
            orgInstructor.identity.username,
            { writableBlock },
          ),
          'the organization instructor should hold every capability in its own organization',
        ).toEqual(FULL_COURSE_ACCESS);

        // …while a course outside it is refused outright, which is what makes
        // the role organization-scoped rather than global.
        expect(
          await readCoursePermissions(
            orgInstructor.request,
            config,
            contentCourse.courseKey,
            orgInstructor.identity.username,
            // That course's own root block: a write probe has to aim at the
            // course it is probing, or it measures the wrong permission.
            { writableBlock: courseUsageKey(contentCourse.courseKey) },
          ),
        ).toEqual(NO_COURSE_ACCESS);
      } finally {
        await adminLms((session) => revokeLegacyRole(session, config, rowPk));
      }
    },
  );

  test(
    'gives an account with two roles the union of both',
    { annotation: testId('TC-00586') },
    async (
      { page, config, contentCourse, studioAuthorSession, rbacCast, resyncStudioAuthor },
      testInfo,
    ) => {
      void studioAuthorSession;
      const courseKey = contentCourse.courseKey;
      const both = await rbacCast('multiRole');
      const staffOnly = await rbacCast('staff');
      await grantCourseTeamRole(page.request, config, courseKey, [both.identity.email], 'staff');
      await grantCourseTeamRole(
        page.request,
        config,
        courseKey,
        [both.identity.email],
        'data_researcher',
      );
      await grantCourseTeamRole(
        page.request,
        config,
        courseKey,
        [staffOnly.identity.email],
        'staff',
      );
      await resyncStudioAuthor();
      const writableBlock = await writableSection(
        page.request,
        config,
        courseKey,
        `E2E multi ${testInfo.testId.slice(-6)}`,
      );

      // Staff's capabilities are all there…
      expect(
        await readCoursePermissions(both.request, config, courseKey, both.identity.username, {
          writableBlock,
        }),
      ).toEqual(FULL_COURSE_ACCESS);

      // …and the dashboard offers the union of the two roles' tabs: everything
      // staff is offered, plus the data researcher's downloads, which staff
      // alone is not.
      const union = await instructorTabsFor(both.request, config, courseKey);
      const staffTabs = await instructorTabsFor(staffOnly.request, config, courseKey);
      expect(staffTabs).not.toContain('data_downloads');
      expect(union).toEqual([...staffTabs, 'data_downloads'].sort());
    },
  );
});
