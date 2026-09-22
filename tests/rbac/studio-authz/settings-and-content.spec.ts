import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import {
  canI,
  courseExists,
  createCertificate,
  createContentGroups,
  createCourseUpdate,
  createCustomPage,
  createTextbook,
  fetchAdvancedSettings,
  fetchCertificateConfiguration,
  fetchCourseDetails,
  fetchCourseUpdates,
  fetchCustomPages,
  fetchGradingPolicy,
  fetchGroupConfigurations,
  fetchTextbooks,
  downloadCourseExport,
  listRoleUsers,
  startCourseExport,
  updateAdvancedSettings,
  updateCourseDetails,
  updateGradingPolicy,
  waitForCourseExport,
  waitForCourseImport,
} from '../../../src/api';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import { StudioImportPage } from '../../../src/pages/studio/tools/import.page';
import { seedScopeAssignments } from '../../../src/steps';
import { issue, knownGap, testId } from '../../../src/reporting';
import { STUDIO_AUTHZ_TAGS } from './helpers';

/**
 * Every course settings surface, driven by an account whose rights come from
 * AuthZ (`TC-00617`, `TC-00625`, `TC-00626`, `TC-00628`, `TC-00629`,
 * `TC-00634`, `TC-00635`, `TC-00636`, `TC-00637`, `TC-00641`, `TC-00643`).
 *
 * These are all the same question asked of eleven endpoints — does this role's
 * write land? — so each case drives the settings API **as the role** and reads
 * the result back with a separate request. The roles are assigned in authz and
 * nothing legacy is involved: the course has been migrated, and its team table
 * is empty.
 */
test.describe(
  'Studio under AuthZ — settings and content',
  { tag: ['@regression', ...STUDIO_AUTHZ_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    /**
     * The course's AuthZ administrator is the worker author itself: it created
     * the course, and migrating it turned that legacy `instructor` row into
     * `course_admin` in `openedx-authz`. Using it — rather than provisioning
     * another account per case — keeps these ten cases inside the platform's
     * sign-in rate limit, and `canI` states where its rights now come from.
     */
    const asCourseAdmin = async (
      request: APIRequestContext,
      config: AppConfig,
      courseKey: string,
    ): Promise<void> => {
      expect(
        await canI(request, config, 'courses.manage_course_team', courseKey),
        'the worker author should hold the AuthZ course_admin role on its own migrated course',
      ).toBe(true);
    };

    test(
      'saves grading policy changes made by a course admin',
      { annotation: testId('TC-00617') },
      async ({ page, config, authzTarget, studioAuthorSession }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        await asCourseAdmin(page.request, config, courseKey);
        const admin = { request: page.request, page, identity: { username: '' } };

        // The whole policy is read back and returned with one cutoff moved:
        // Studio's grading endpoint replaces the document rather than patching it.
        const before = await fetchGradingPolicy(admin.request, config, courseKey);
        const cutoff = Number((before.grade_cutoffs?.Pass ?? 0.5).toFixed(2));
        const wanted = cutoff === 0.6 ? 0.55 : 0.6;
        await updateGradingPolicy(admin.request, config, courseKey, {
          ...before,
          grade_cutoffs: { ...before.grade_cutoffs, Pass: wanted },
        });
        expect(
          (await fetchGradingPolicy(page.request, config, courseKey)).grade_cutoffs?.Pass,
        ).toBe(wanted);
      },
    );

    test(
      'reads and writes advanced settings as a course admin',
      { annotation: testId('TC-00625') },
      async ({ page, config, authzTarget, studioAuthorSession }, testInfo) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        await asCourseAdmin(page.request, config, courseKey);
        const admin = { request: page.request, page, identity: { username: '' } };

        expect(await fetchAdvancedSettings(admin.request, config, courseKey)).toBeDefined();
        const display = `E2E advanced ${testInfo.testId.slice(-6)}`;
        await updateAdvancedSettings(admin.request, config, courseKey, {
          display_coursenumber: display,
        });
        expect(
          (await fetchAdvancedSettings(page.request, config, courseKey)).display_coursenumber
            ?.value,
        ).toBe(display);
      },
    );

    test(
      'creates a group configuration as a course admin',
      { annotation: testId('TC-00626') },
      async ({ page, config, authzTarget, studioAuthorSession }, testInfo) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        await asCourseAdmin(page.request, config, courseKey);
        const admin = { request: page.request, page, identity: { username: '' } };

        const names = [
          `E2E control ${testInfo.testId.slice(-6)}`,
          `E2E treatment ${testInfo.testId.slice(-6)}`,
        ];
        const created = await createContentGroups(admin.request, config, courseKey, names);
        expect(created.groups.map((group) => group.name)).toEqual(expect.arrayContaining(names));
        expect(
          (await fetchGroupConfigurations(page.request, config, courseKey)).flatMap((entry) =>
            entry.groups.map((group) => group.name),
          ),
        ).toEqual(expect.arrayContaining(names));
      },
    );

    test(
      'adds a static page as a course admin',
      { annotation: testId('TC-00628') },
      async ({ page, config, authzTarget, studioAuthorSession }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        await asCourseAdmin(page.request, config, courseKey);
        const admin = { request: page.request, page, identity: { username: '' } };

        const before = (await fetchCustomPages(page.request, config, courseKey)).length;
        const created = await createCustomPage(admin.request, config, courseKey);
        expect(created).toContain('static_tab');
        expect((await fetchCustomPages(page.request, config, courseKey)).length).toBe(before + 1);
      },
    );

    test(
      'posts a course update as a course admin',
      { annotation: testId('TC-00629') },
      async ({ page, config, authzTarget, studioAuthorSession }, testInfo) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        await asCourseAdmin(page.request, config, courseKey);
        const admin = { request: page.request, page, identity: { username: '' } };

        const content = `<p>E2E update ${testInfo.testId.slice(-6)}</p>`;
        const posted = await createCourseUpdate(admin.request, config, courseKey, {
          date: 'January 1, 2026',
          content,
        });
        expect(posted.id).toBeGreaterThan(0);
        expect(
          (await fetchCourseUpdates(page.request, config, courseKey)).map((row) => row.content),
        ).toContain(content);
      },
    );

    test(
      'exports the course as a course admin',
      { annotation: testId('TC-00634') },
      async ({ page, config, authzTarget, studioAuthorSession }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        await asCourseAdmin(page.request, config, courseKey);
        const admin = { request: page.request, page, identity: { username: '' } };

        await startCourseExport(admin.request, config, courseKey);
        const finished = await waitForCourseExport(admin.request, config, courseKey);
        expect(finished.status).toBe(3);
      },
    );

    test(
      'configures a certificate as a course admin',
      { annotation: testId('TC-00636') },
      async ({ page, config, authzTarget, studioAuthorSession }, testInfo) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        await asCourseAdmin(page.request, config, courseKey);
        const admin = { request: page.request, page, identity: { username: '' } };

        const name = `E2E certificate ${testInfo.testId.slice(-6)}`;
        const created = await createCertificate(admin.request, config, courseKey, {
          name,
          signatories: [],
        });
        expect(created.name).toBe(name);
        expect(
          (await fetchCertificateConfiguration(page.request, config, courseKey)).certificates.map(
            (row) => row.name,
          ),
        ).toContain(name);
      },
    );

    test(
      'adds a textbook as a course admin',
      { annotation: testId('TC-00641') },
      async ({ page, config, authzTarget, studioAuthorSession }, testInfo) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        await asCourseAdmin(page.request, config, courseKey);
        const admin = { request: page.request, page, identity: { username: '' } };

        const tabTitle = `E2E reader ${testInfo.testId.slice(-6)}`;
        await createTextbook(admin.request, config, courseKey, {
          tabTitle,
          chapters: [{ title: 'Chapter 1', url: '/static/e2e-chapter-1.pdf' }],
        });
        expect(
          (await fetchTextbooks(page.request, config, courseKey)).map((row) => row.tab_title),
        ).toContain(tabTitle);
      },
    );

    test(
      'changes the course schedule as course staff',
      { annotation: testId('TC-00643') },
      async ({ page, config, authzTarget, studioAuthorSession, studioColleague }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const staff = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          courseKey,
          [staff.identity.username],
          ['course_staff'],
        );

        const enrollmentStart = '2001-02-03T00:00:00Z';
        await updateCourseDetails(staff.request, config, courseKey, {
          enrollment_start: enrollmentStart,
        });
        expect(
          (await fetchCourseDetails(page.request, config, courseKey)).enrollment_start,
        ).toContain('2001-02-03');
      },
    );

    test(
      'imports a course archive as a course admin',
      { annotation: testId('TC-00635') },
      async ({ page, config, authzTarget, studioAuthorSession }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        await asCourseAdmin(page.request, config, courseKey);
        const admin = { request: page.request, page, identity: { username: '' } };

        // The archive is the course's own export, taken by the same account —
        // so the round trip is entirely this role's work.
        await startCourseExport(admin.request, config, courseKey);
        const { outputPath } = await waitForCourseExport(admin.request, config, courseKey);
        const tarball = await downloadCourseExport(admin.request, config, outputPath);

        // The import is driven through the page this role would use, on its own
        // browser: the dropzone is the only route the platform offers.
        const importPage = new StudioImportPage(admin.page, config);
        const fileName = `e2e-authz-import-${Date.now().toString(36)}.tar.gz`;
        await importPage.goto(courseKey);
        await importPage.uploadArchive(fileName, tarball);

        // The platform's own status API says it finished, and the course's team
        // survives the replacement: an import must not cost anyone their role.
        const before = (await listRoleUsers(page.request, config, courseKey, { pageSize: 100 }))
          .members.length;
        await waitForCourseImport(admin.request, config, courseKey, fileName);
        expect(await courseExists(page.request, config, courseKey)).toBe(true);
        expect(
          (await listRoleUsers(page.request, config, courseKey, { pageSize: 100 })).members.length,
        ).toBe(before);
      },
    );

    test.fixme(
      'configures proctored exams as a course admin',
      {
        annotation: [
          testId('TC-00637'),
          issue('https://github.com/openedx/wg-build-test-release/issues/614'),
          knownGap(
            'Proctored exam settings need a proctoring provider configured on the installation, ' +
              'which the suite does not provision and CI does not run; the case is also a failed ' +
              'row on the sheet (wg#614).',
          ),
        ],
      },
      async ({ page, config, authzTarget, studioAuthorSession }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        await asCourseAdmin(page.request, config, courseKey);
        const admin = { request: page.request, page, identity: { username: '' } };

        await updateAdvancedSettings(admin.request, config, courseKey, {
          enable_proctored_exams: true,
        });
        expect(
          (await fetchAdvancedSettings(page.request, config, courseKey)).enable_proctored_exams
            ?.value,
        ).toBe(true);
      },
    );
  },
);
