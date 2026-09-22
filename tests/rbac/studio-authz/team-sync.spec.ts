import { expect, test } from '../../../src/fixtures';
import {
  deactivateAccount,
  fetchCourseIndex,
  fetchCourseTeam,
  listCourseAccessRoles,
  listRoleUsers,
  listUserAssignments,
  removeCourseTeamMember,
  setCourseTeamRole,
  studioOrigin,
} from '../../../src/api';
import {
  ADMIN_CONSOLE_SELECTORS,
  STUDIO_OUTLINE_PAGE_SELECTORS,
  STUDIO_SHELL_SELECTORS,
  TIMEOUTS,
} from '../../../src/config';
import { issue, knownGap, testId } from '../../../src/reporting';
import { STUDIO_AUTHZ_TAGS } from './helpers';

/**
 * **The epic's acceptance bar**: with the flag on and the course migrated, the
 * legacy team surfaces and `openedx-authz` stay one system (`TC-00619`,
 * `TC-00620`, `TC-00633`, `TC-00649`).
 *
 * A course that has been migrated has no legacy `CourseAccessRole` rows left, so
 * "the two systems agree" cannot mean "both hold a row". What it means, and what
 * these cases assert, is that the **legacy write paths keep working and land in
 * authz**: adding a beta tester from the instructor dashboard creates
 * `course_beta_tester` in `roles/users/?scope=`, Studio's own team endpoint
 * creates `course_staff`, a removal clears the assignment, and the account loses
 * Studio with it.
 */
test.describe(
  'Studio under AuthZ — legacy team synchronisation',
  { tag: ['@regression', ...STUDIO_AUTHZ_TAGS, '@instructor-dashboard'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'lands a legacy role added from the instructor dashboard in AuthZ',
      { annotation: testId('TC-00619') },
      async ({
        page,
        config,
        authzTarget,
        adminConsole,
        instructorEnrollments,
        studioAuthorSession,
        rbacCast,
      }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const newMember = await rbacCast('beta');

        // The legacy surface, driven as a user would: the dashboard's own
        // beta-tester dialog.
        await instructorEnrollments.gotoTab(courseKey);
        const modal = await instructorEnrollments.openAddBetaTesters();
        await modal.fillIdentifiers([newMember.identity.username]);
        await modal.setNotifyByEmail(false);
        const added = (await (await modal.submit()).json()) as {
          action: string;
          results: { identifier: string; error: boolean }[];
        };
        expect(added.action).toBe('add');
        expect(added.results[0]?.error).toBe(false);

        // …and the role exists in authz, not in the legacy table.
        await expect
          .poll(
            async () =>
              (
                await listRoleUsers(page.request, config, courseKey, { pageSize: 100 })
              ).members.find((member) => member.username === newMember.identity.username)?.roles ??
              [],
            { timeout: TIMEOUTS.rbacMigration },
          )
          .toEqual(['course_beta_tester']);

        // The console lists the assignment with an **empty** Role cell: it knows
        // ten role names and this is not one of them (`RBAC-003`), which is the
        // sheet's own note on this case. The row is located by our account's
        // e-mail, never by a label.
        await adminConsole.console.goto(courseKey);
        const row = adminConsole.teamMembers.rowsFor(newMember.identity.email);
        await expect(row).toHaveCount(1);
        // The cell is there; what it has to say is empty. `data-role` carries
        // the console's display name for the role, and it has none for this one.
        await expect(row.locator(ADMIN_CONSOLE_SELECTORS.roleCell)).toHaveAttribute(
          'data-role',
          '',
        );
      },
    );

    test(
      'clears both systems when a team member is removed',
      { annotation: testId('TC-00620') },
      async ({
        page,
        config,
        authzTarget,
        adminLms,
        studioAuthorSession,
        rbacCast,
        resyncStudioAuthor,
      }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const member = await rbacCast('newcomer');

        // Added through Studio's own team endpoint — a legacy write on a
        // migrated course, which the platform routes into authz.
        await resyncStudioAuthor();
        await setCourseTeamRole(page.request, config, courseKey, member.identity.email, 'staff');
        await expect
          .poll(
            async () =>
              (
                await listRoleUsers(page.request, config, courseKey, { pageSize: 100 })
              ).members.find((row) => row.username === member.identity.username)?.roles ?? [],
            { timeout: TIMEOUTS.rbacMigration },
          )
          .toEqual(['course_staff']);
        expect(await fetchCourseIndex(member.request, config, courseKey)).toBeDefined();

        // Removed through Studio's own Course Team endpoint — the surface the
        // case names, and the one that still works. The console, where Studio's
        // Course Team link now leads, renders the removal control **disabled**
        // for a course-scope assignment even though the viewer holds
        // `courses.manage_course_team` (`RBAC-014`; the held case below asserts
        // the behaviour that is wanted).
        await removeCourseTeamMember(page.request, config, courseKey, member.identity.email);

        // Gone from authz…
        await expect
          .poll(
            async () =>
              (await listRoleUsers(page.request, config, courseKey, { pageSize: 100 })).members.map(
                (row) => row.username,
              ),
            { timeout: TIMEOUTS.rbacMigration },
          )
          .not.toContain(member.identity.username);

        // …gone from the legacy table…
        await adminLms(async (session) => {
          expect(
            (await listCourseAccessRoles(session, config, member.identity.email)).filter(
              (row) => row.courseKey === courseKey,
            ),
          ).toEqual([]);
        });

        // …and gone from Studio: the account can no longer open the course.
        await expect(fetchCourseIndex(member.request, config, courseKey)).rejects.toMatchObject({
          status: 403,
        });
        expect(
          (await fetchCourseTeam(page.request, config, courseKey)).map((row) => row.email),
        ).not.toContain(member.identity.email);
      },
    );

    test(
      'refuses the course to an account with no role on it',
      {
        annotation: [
          testId('TC-00633'),
          issue('https://github.com/openedx/wg-build-test-release/issues/613'),
        ],
      },
      async ({ config, authzTarget, studioAuthorSession, rbacCast }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const outsider = await rbacCast('outsider');

        // The API is unambiguous: no authz role, no course.
        await expect(fetchCourseIndex(outsider.request, config, courseKey)).rejects.toMatchObject({
          status: 403,
        });
        // It cannot even ask what it holds: with no role in any scope, the
        // question itself is refused.
        await expect(
          listUserAssignments(outsider.request, config, outsider.identity.username),
        ).rejects.toMatchObject({ status: 403 });

        // And the authoring MFE renders its refusal rather than the outline. The
        // sheet expects the course to be absent from Studio Home as well; this
        // build lists it and refuses it on open (wg#613), so what is asserted is
        // the refusal itself.
        await outsider.page.goto(`${studioOrigin(config)}/course/${courseKey}`, {
          waitUntil: 'domcontentloaded',
        });
        // None of the outline renders for them.
        await expect(outsider.page.locator(STUDIO_OUTLINE_PAGE_SELECTORS.sectionCard)).toHaveCount(
          0,
          { timeout: TIMEOUTS.navigation },
        );
        await expect(outsider.page.locator(STUDIO_SHELL_SELECTORS.settingsMenu)).toHaveCount(0);
      },
    );

    test(
      'refuses to add an account that has not been activated',
      { annotation: testId('TC-00649') },
      async ({
        page,
        config,
        authzTarget,
        adminLms,
        studioAuthorSession,
        resyncStudioAuthor,
        studioColleague,
      }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const inactive = await studioColleague();
        await adminLms((session) => deactivateAccount(session, config, inactive.identity.username));
        await resyncStudioAuthor();

        // The legacy path refuses the add outright…
        await expect(
          setCourseTeamRole(page.request, config, courseKey, inactive.identity.email, 'staff'),
        ).rejects.toMatchObject({ status: 400 });

        // …and nothing was written on either side.
        expect(
          (await fetchCourseTeam(page.request, config, courseKey)).map((row) => row.email),
        ).not.toContain(inactive.identity.email);
        expect(
          (await listRoleUsers(page.request, config, courseKey, { pageSize: 100 })).members.map(
            (row) => row.username,
          ),
        ).not.toContain(inactive.identity.username);
      },
    );

    test.fixme(
      'removes a course-scope assignment from the console',
      {
        annotation: [
          testId('TC-00620'),
          knownGap(
            'The console offers no working removal for a **course**-scope assignment: the audit ' +
              "view's delete control is disabled (absent in some renderings) even for a viewer that " +
              'holds `courses.manage_course_team` and can remove the same assignment through ' +
              "Studio's own endpoint (`RBAC-014`).",
          ),
        ],
      },
      async ({
        page,
        config,
        authzTarget,
        adminConsole,
        studioAuthorSession,
        rbacCast,
        resyncStudioAuthor,
      }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const member = await rbacCast('newcomer');
        await resyncStudioAuthor();
        await setCourseTeamRole(page.request, config, courseKey, member.identity.email, 'staff');

        const audit = adminConsole.userAudit;
        await audit.goto(member.identity.username);
        await expect(audit.deleteControls.first()).toBeEnabled();
        await audit.openRemove(audit.rows.first());
        await audit.confirmRemove();
        await expect
          .poll(async () =>
            (await listRoleUsers(page.request, config, courseKey, { pageSize: 100 })).members.map(
              (row) => row.username,
            ),
          )
          .not.toContain(member.identity.username);
      },
    );
  },
);
