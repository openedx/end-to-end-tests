import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { LIBRARY_ROLES, listUserAssignments } from '../../../src/api';
import { seedScopeAssignments } from '../../../src/steps';
import { checkA11y } from '../../../src/a11y';
import { knownGap, testId } from '../../../src/reporting';
import { RBAC_TAGS, ADMIN_CONSOLE_A11Y_BASELINE } from '../helpers';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The console's **user audit view**: every role one account holds, what each
 * role may do, and taking a role away.
 *
 * It runs in library scope, which needs no waffle flag — creating a library
 * makes the worker author its `library_admin`, and that is the permission the
 * view's controls are gated on. Rows are addressed by position and structure,
 * because the Role cell's label is localized; the oracle after every action is
 * `users/<username>/assignments/`.
 */
test.describe(
  'Roles and Permissions console — user audit view',
  { tag: ['@regression', ...RBAC_TAGS, '@content-libraries'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'lists an account’s roles, expands one permission list at a time, and leads back',
      { annotation: testId('TC-00565') },
      async ({
        page,
        config,
        adminConsole,
        authoringLibrary,
        studioAuthorSession,
        studioColleague,
      }) => {
        void studioAuthorSession;
        const library = authoringLibrary.id;
        const subject = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          library,
          [subject.identity.username],
          LIBRARY_ROLES,
        );
        const assignments = await listUserAssignments(
          page.request,
          config,
          subject.identity.username,
        );

        const audit = adminConsole.userAudit;
        await audit.goto(subject.identity.username);

        // The view is about this account, and lists one row per assignment, each
        // naming our library — by its key on `verawood`, by its title on `main`
        // (whose column layout `rbac-audit-team-layout` asserts).
        await expect(audit.subjectHeading).toHaveText(subject.identity.username);
        await expect(audit.rows).toHaveCount(assignments.count);
        await expect(audit.row(0)).toContainText(
          new RegExp(`${escapeRegExp(library)}|${escapeRegExp(authoringLibrary.title)}`),
        );

        // Expanding a row shows its permissions; expanding another closes the
        // first, so exactly one list is open at any time.
        await expect(audit.permissionDetailRows).toHaveCount(0);
        await audit.expandPermissions(audit.row(0));
        await expect(audit.permissionDetailRows).toHaveCount(1);
        await audit.expandPermissions(audit.row(1));
        await expect(audit.permissionDetailRows).toHaveCount(1);

        await checkA11y(page, {
          label: 'admin-console-user-audit',
          additionalBaseline: ADMIN_CONSOLE_A11Y_BASELINE,
        });

        // The breadcrumb leads back to the table the view was opened from.
        await audit.backToTeamMembers.click();
        await expect(adminConsole.teamMembers.table).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`${adminConsole.origin}/authz$`));
      },
    );

    test(
      'removes one role of several, then the last one, which returns to the table',
      { tag: '@smoke', annotation: [testId('TC-00566'), testId('TC-00353')] },
      async ({
        page,
        config,
        adminConsole,
        authoringLibrary,
        studioAuthorSession,
        studioColleague,
      }) => {
        void studioAuthorSession;
        const library = authoringLibrary.id;
        const audit = adminConsole.userAudit;

        // A member of several roles: removing one leaves the account in the view
        // with the rest, and the console says so with a toast.
        const many = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          library,
          [many.identity.username],
          ['library_author', 'library_contributor', 'library_user'],
        );
        await audit.goto(many.identity.username);
        await expect(audit.rows).toHaveCount(3);

        await audit.openRemove(audit.row(0));
        const revoked = await audit.confirmRemove();
        expect(revoked.status()).toBe(207);
        await expect(audit.rows).toHaveCount(2);
        await expect(audit.toast.first()).toBeVisible();
        expect(
          (await listUserAssignments(page.request, config, many.identity.username)).count,
        ).toBe(2);

        // A member of exactly one role: removing it takes the account out of the
        // scope altogether, so the console returns to the Team Members table and
        // no longer lists them.
        const single = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          library,
          [single.identity.username],
          ['library_user'],
        );
        await audit.goto(single.identity.username);
        await expect(audit.rows).toHaveCount(1);

        await audit.openRemove(audit.row(0));
        await audit.confirmRemove();
        await expect(page).toHaveURL(new RegExp(`${adminConsole.origin}/authz`));
        await expect(adminConsole.teamMembers.table).toBeVisible();
        expect(
          (await listUserAssignments(page.request, config, single.identity.username)).count,
        ).toBe(0);
        await expect(adminConsole.teamMembers.rowsFor(single.identity.username)).toHaveCount(0);
      },
    );

    test(
      'cancelling the confirmation changes nothing',
      { tag: '@smoke', annotation: testId('TC-00408') },
      async ({
        page,
        config,
        adminConsole,
        authoringLibrary,
        studioAuthorSession,
        studioColleague,
      }) => {
        void studioAuthorSession;
        const subject = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          authoringLibrary.id,
          [subject.identity.username],
          ['library_author', 'library_user'],
        );
        const audit = adminConsole.userAudit;
        await audit.goto(subject.identity.username);
        await expect(audit.rows).toHaveCount(2);

        await audit.openRemove(audit.row(0));
        await audit.cancelRemove();

        // Still two rows in the view, and still two assignments on the platform.
        await expect(audit.rows).toHaveCount(2);
        expect(
          (await listUserAssignments(page.request, config, subject.identity.username)).count,
        ).toBe(2);
      },
    );

    test(
      'offers no way to remove your own admin role',
      {
        annotation: [
          testId('TC-00567'),
          knownGap(
            'The API does not enforce the rule at all: a library admin revoking its own ' +
              'library_admin is answered 207 role_removed (RBAC-007). On verawood the console ' +
              'also omits the control rather than greying it out with a tooltip.',
          ),
        ],
      },
      async ({
        page,
        config,
        adminConsole,
        authoringLibrary,
        studioAuthorSession,
        studioColleague,
      }) => {
        void studioAuthorSession;
        // The subject has to be the **viewer**: only your own admin row gets this
        // treatment. It is a fresh colleague rather than the worker author,
        // because the author accumulates a library_admin row per library it
        // creates in the run and the view pages at ten.
        const admin = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          authoringLibrary.id,
          [admin.identity.username],
          ['library_admin', 'library_author'],
        );
        const mine = await listUserAssignments(admin.request, config, admin.identity.username);
        expect(mine.count).toBe(2);

        // Looked at from that colleague's own browser.
        const audit = adminConsole.auditFor(admin.page);
        await audit.goto(admin.identity.username);
        await expect(audit.rows).toHaveCount(mine.count);

        // Exactly the admin assignment is unremovable: every other row has a live
        // delete control. (`main` greys the admin row's control out, which
        // `rbac-audit-team-layout` asserts; `verawood` renders none.)
        const adminAssignments = mine.assignments.filter((row) => row.role.endsWith('_admin'));
        expect(adminAssignments).toHaveLength(1);
        await expect(audit.deleteControls).toHaveCount(mine.count - adminAssignments.length);
      },
    );

    test(
      'lays the table out as Team Members does, greying out your own admin role',
      {
        tag: '@rbac-audit-team-layout',
        annotation: [
          testId('TC-00565'),
          testId('TC-00567'),
          knownGap(
            'The API does not enforce the rule at all: a library admin revoking its own ' +
              'library_admin is answered 207 role_removed (RBAC-007).',
          ),
        ],
      },
      async ({
        page,
        config,
        adminConsole,
        authoringLibrary,
        studioAuthorSession,
        studioColleague,
      }) => {
        void studioAuthorSession;
        // As in the case above, the subject is the viewer, so its admin row gets
        // the self-protection treatment.
        const admin = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          authoringLibrary.id,
          [admin.identity.username],
          ['library_admin', 'library_author'],
        );
        const mine = await listUserAssignments(admin.request, config, admin.identity.username);
        expect(mine.count).toBe(2);

        const audit = adminConsole.auditFor(admin.page);
        await audit.goto(admin.identity.username);
        await expect(audit.rows).toHaveCount(mine.count);

        // Role, Scope, Organization, Permissions, Actions — the Team Members
        // order (frontend-app-admin-console#255). The scope is named by the
        // library's title and the organization by its key, both our own data.
        await expect(audit.columnHeaders).toHaveCount(5);
        await expect(audit.cell(audit.row(0), 1)).toContainText(authoringLibrary.title);
        await expect(audit.cell(audit.row(0), 2)).toHaveText(authoringLibrary.org);

        // Your own admin role keeps its delete control, greyed out, and hovering
        // it explains why; the other row's control is live.
        await expect(audit.deleteControls).toHaveCount(1);
        await expect(audit.disabledDeleteControls).toHaveCount(1);
        await expect(audit.tooltip).toHaveCount(0);
        await audit.disabledDeleteControls.hover();
        await expect(audit.tooltip).toHaveCount(1);
      },
    );
  },
);
