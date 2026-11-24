import { expect, test } from '../../../src/fixtures';
import {
  assignRole,
  canI,
  deleteAsset,
  fetchAdvancedSettings,
  fetchAllAssets,
  fetchCertificateConfiguration,
  fetchCourseDetails,
  fetchCourseIndex,
  fetchCustomPages,
  fetchGradingPolicy,
  fetchStudioUsername,
  fetchXBlockOutline,
  listRoleUsers,
  publishXBlock,
  updateCourseDetails,
  uploadAsset,
  updateXBlock,
} from '../../../src/api';
import { STUDIO_OUTLINE_PAGE_SELECTORS, TIMEOUTS } from '../../../src/config';
import { AssignRoleWizard } from '../../../src/pages/admin-console';
import { seedScopeAssignments } from '../../../src/steps';
import { issue, knownGap, testId } from '../../../src/reporting';
import { STUDIO_AUTHZ_TAGS } from '../studio-authz/helpers';
import { writableSection } from './helpers';

/**
 * The two authoring course roles, held **in AuthZ**, driving Studio
 * (`TC-00576`–`TC-00578`).
 *
 * `course_admin` and `course_staff` are identical everywhere except team
 * management, so that is where these cases separate them: both author the
 * course, only the admin may change who else can. The console offers Assign
 * Role only to an account that may manage a team in some scope (wg#603's fix),
 * so the button is checked from each role's own console; the platform's answer
 * decides the rest — `permissions/validate/me` for the right, and a real
 * `PUT roles/users/` for the outcome.
 */
test.describe(
  'AuthZ course roles in Studio',
  { tag: ['@regression', ...STUDIO_AUTHZ_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'lets course staff author the course but not manage its team',
      {
        annotation: testId('TC-00576'),
      },
      async (
        {
          page,
          config,
          adminConsole,
          authzTarget,
          studioAuthorSession,
          resyncStudioAuthor,
          rbacCast,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const staff = await rbacCast('courseStaff');
        await seedScopeAssignments(
          page.request,
          config,
          courseKey,
          [staff.identity.username],
          ['course_staff'],
        );
        await resyncStudioAuthor();
        const writableBlock = await writableSection(
          page.request,
          config,
          courseKey,
          `E2E staff ${testInfo.testId.slice(-6)}`,
        );

        // Authoring: the course opens and its content takes an edit.
        expect(await fetchCourseIndex(staff.request, config, courseKey)).toBeDefined();
        await updateXBlock(staff.request, config, writableBlock, {
          metadata: { display_name: `E2E renamed by staff ${testInfo.testId.slice(-6)}` },
        });
        await staff.page.goto(`${config.mfeUrls.authoring}/course/${courseKey}`, {
          waitUntil: 'domcontentloaded',
        });
        await expect(
          staff.page.locator(STUDIO_OUTLINE_PAGE_SELECTORS.sectionCard).first(),
        ).toBeVisible({ timeout: TIMEOUTS.navigation });

        // Publishing: the section it renamed goes live as the role's own act.
        await publishXBlock(staff.request, config, writableBlock);
        await expect
          .poll(
            async () => (await fetchXBlockOutline(page.request, config, writableBlock)).published,
          )
          .toBe(true);

        // The settings pages the case lists, each opened as the role through
        // the endpoint its page reads — and Schedule & Details edited, with the
        // edit read back by the course's author.
        await expect(fetchGradingPolicy(staff.request, config, courseKey)).resolves.toBeDefined();
        await expect(
          fetchAdvancedSettings(staff.request, config, courseKey),
        ).resolves.toBeDefined();
        await expect(fetchCustomPages(staff.request, config, courseKey)).resolves.toBeDefined();
        await expect(
          fetchCertificateConfiguration(staff.request, config, courseKey),
        ).resolves.toBeDefined();
        const enrollmentEnd = '2090-04-05T00:00:00Z';
        await updateCourseDetails(staff.request, config, courseKey, {
          enrollment_end: enrollmentEnd,
        });
        expect(
          (await fetchCourseDetails(page.request, config, courseKey)).enrollment_end,
        ).toContain('2090-04-05');

        // Files: uploaded, listed and deleted by the role.
        const fileName = `e2e-staff-${testInfo.testId.slice(-6)}.txt`;
        const asset = await uploadAsset(staff.request, config, courseKey, {
          name: fileName,
          mimeType: 'text/plain',
          buffer: Buffer.from('e2e course staff upload'),
        });
        const names = async () =>
          (await fetchAllAssets(staff.request, config, courseKey)).map((row) => row.display_name);
        expect(await names()).toContain(fileName);
        await deleteAsset(staff.request, config, courseKey, asset);
        expect(await names()).not.toContain(fileName);

        // Team management: not offered, and refused both as a right and as a write.
        expect(await canI(staff.request, config, 'courses.manage_course_team', courseKey)).toBe(
          false,
        );
        const staffConsole = adminConsole.consoleFor(staff.page);
        await staffConsole.goto(courseKey);
        await expect(staffConsole.assignRoleButton).toHaveCount(0);
        // The team list is shown to it, but as a list only: another member's
        // audit view offers no live control to remove an assignment.
        await expect(adminConsole.teamMembersFor(staff.page).rows).not.toHaveCount(0);
        const audit = adminConsole.auditFor(staff.page);
        await audit.goto(await fetchStudioUsername(page.request, config));
        await expect(audit.rows).not.toHaveCount(0);
        await expect(audit.deleteControls).toHaveCount(0);
        const other = await rbacCast('outsider');
        await expect(
          assignRole(staff.request, config, {
            role: 'course_staff',
            scopes: [courseKey],
            users: [other.identity.username],
          }),
        ).rejects.toMatchObject({ status: 403 });
        expect(
          (await listRoleUsers(page.request, config, courseKey, { pageSize: 100 })).members.map(
            (row) => row.username,
          ),
        ).not.toContain(other.identity.username);
      },
    );

    test(
      'lets a course admin manage the team as well',
      { annotation: testId('TC-00577') },
      async ({ page, config, adminConsole, authzTarget, studioAuthorSession, rbacCast }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const admin = await rbacCast('courseAdmin');
        const newcomer = await rbacCast('newcomer');
        await seedScopeAssignments(
          page.request,
          config,
          courseKey,
          [admin.identity.username],
          ['course_admin'],
        );

        // Everything staff may do…
        expect(await fetchCourseIndex(admin.request, config, courseKey)).toBeDefined();
        expect(await canI(admin.request, config, 'courses.manage_course_team', courseKey)).toBe(
          true,
        );

        // …plus the console's Assign Role: the admin's own wizard, giving a new
        // account Course Staff on this course.
        const adminView = adminConsole.consoleFor(admin.page);
        await adminView.goto(courseKey);
        await expect(adminView.assignRoleButton).toBeVisible();
        const wizard = new AssignRoleWizard(admin.page, config, adminConsole.origin);
        await wizard.open();
        await wizard.fillWhoAndRole(newcomer.identity.username, 'course_staff');
        await wizard.validateAndAdvance();
        await wizard.chooseScope(courseKey);
        const saved = (await (await wizard.save()).json()) as { errors: unknown[] };
        expect(saved.errors).toEqual([]);

        // The save is acknowledged (a message whose wording is localized), the
        // platform holds the role, and the team table lists the new member.
        await expect(wizard.toast).toBeVisible();
        await expect
          .poll(
            async () =>
              (
                await listRoleUsers(page.request, config, courseKey, { pageSize: 100 })
              ).members.find((row) => row.username === newcomer.identity.username)?.roles ?? [],
            { timeout: TIMEOUTS.rbacMigration },
          )
          .toEqual(['course_staff']);
        await adminView.goto(courseKey);
        await expect(
          adminConsole.teamMembersFor(admin.page).rowsFor(newcomer.identity.email),
        ).toHaveCount(1);
        expect(await fetchCourseIndex(newcomer.request, config, courseKey)).toBeDefined();

        // …and taking it away again, from that member's audit view: the delete
        // control asks for confirmation, and confirming removes the assignment.
        const audit = adminConsole.auditFor(admin.page);
        await audit.goto(newcomer.identity.username);
        await expect(audit.rows).toHaveCount(1);
        await audit.openRemove(audit.row(0));
        await expect(audit.confirmDialog).toBeVisible();
        expect((await audit.confirmRemove()).ok()).toBe(true);
        await expect
          .poll(
            async () =>
              (await listRoleUsers(page.request, config, courseKey, { pageSize: 100 })).members.map(
                (row) => row.username,
              ),
            { timeout: TIMEOUTS.rbacMigration },
          )
          .not.toContain(newcomer.identity.username);
        await expect(fetchCourseIndex(newcomer.request, config, courseKey)).rejects.toMatchObject({
          status: 403,
        });
      },
    );

    test(
      'refuses Studio to an account with no course role',
      { annotation: testId('TC-00578') },
      async ({ config, authzTarget, studioAuthorSession, rbacCast }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const outsider = await rbacCast('outsider');

        await expect(fetchCourseIndex(outsider.request, config, courseKey)).rejects.toMatchObject({
          status: 403,
        });
        await outsider.page.goto(`${config.mfeUrls.authoring}/course/${courseKey}`, {
          waitUntil: 'domcontentloaded',
        });
        await expect(outsider.page.locator(STUDIO_OUTLINE_PAGE_SELECTORS.sectionCard)).toHaveCount(
          0,
          {
            timeout: TIMEOUTS.navigation,
          },
        );
      },
    );

    test.fixme(
      'keeps a course out of the Studio home list of an account with no role',
      {
        annotation: [
          testId('TC-00578'),
          issue('https://github.com/openedx/wg-build-test-release/issues/613'),
          knownGap(
            'Studio Home lists a course to an account that holds no role in it; opening it is then ' +
              'refused. The case asks for it to be absent from the list (wg#613).',
          ),
        ],
      },
      async ({ authzTarget, studioAuthorSession, rbacCast }) => {
        void studioAuthorSession;
        const outsider = await rbacCast('outsider');
        await outsider.studioHomePage.goto();
        await expect(outsider.studioHomePage.courseCardLink(authzTarget.courseKey)).toHaveCount(0);
      },
    );
  },
);
