import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { fetchStudioUsername, listAssignments, listRoleUsers } from '../../../src/api';
import { checkA11y } from '../../../src/a11y';
import { issue, knownGap, testId } from '../../../src/reporting';
import { ADMIN_CONSOLE_A11Y_BASELINE } from '../helpers';

/**
 * The console's **Team Members** tab: what the table lists, how it narrows, and
 * what it marks.
 *
 * The table is one row per **assignment**, not per user, so the course's creator
 * — carrying both `course_admin` and `course_staff` after migration — is two
 * rows. The oracle throughout is `/api/authz/v1/assignments/`: the console is
 * asserted to render what the API returns, never to contain a particular label.
 */
test.describe(
  'Roles and Permissions console — Team Members',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@rbac'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'lists one row per role assignment, marks your own, and pages at ten',
      { annotation: testId('TC-00561') },
      async ({ page, config, adminConsole, authzTarget, studioAuthorSession }) => {
        void studioAuthorSession;
        // Ask the platform who this browser is, rather than trusting a fixture's
        // record of it: the console marks rows by the signed-in account.
        const me = await fetchStudioUsername(page.request, config);
        const scoped = await listRoleUsers(page.request, config, authzTarget.courseKey);
        const assignments = await listAssignments(page.request, config, {
          scopes: [authzTarget.courseKey],
          pageSize: 50,
        });

        await adminConsole.console.goto(authzTarget.courseKey);
        const table = adminConsole.teamMembers;

        // Six columns, and as many rows as the API reports assignments in scope.
        await expect(table.columnHeaders).toHaveCount(6);
        await expect(table.rows).toHaveCount(assignments.count);

        // One row per assignment: the author holds two roles on a course it
        // created and migrated, and appears once for each.
        const mine = table.rowsFor(me);
        const myRoles = scoped.members.find((member) => member.username === me)?.roles ?? [];
        await expect(mine).toHaveCount(myRoles.length);
        expect(myRoles.length).toBeGreaterThan(1);

        // The signed-in user's own rows carry the "(Me)" marker; other rows do not.
        await expect(table.currentUserMarker(mine.first())).toBeVisible();

        // Every row the console can name renders its role marker; each row's
        // scope cell names the course the table is filtered to.
        await expect(table.roleMarker(mine.first())).toHaveCount(1);
        await expect(table.cell(mine.first(), 'scope')).toContainText(authzTarget.courseKey);

        // The footer's pager exists and is at its only page for a table this size.
        await expect(table.footer).toBeVisible();
        await expect(table.nextPage).toBeDisabled();

        await checkA11y(page, {
          label: 'admin-console-team-members',
          additionalBaseline: ADMIN_CONSOLE_A11Y_BASELINE,
        });
      },
    );

    test(
      'narrows by search and by filter, and restores when they are cleared',
      {
        annotation: [
          testId('TC-00562'),
          issue('https://github.com/openedx/frontend-app-admin-console/issues/162'),
        ],
      },
      async ({ page, config, adminConsole, authzTarget, studioAuthorSession }) => {
        void studioAuthorSession;
        const me = await fetchStudioUsername(page.request, config);
        await adminConsole.console.goto(authzTarget.courseKey);
        const table = adminConsole.teamMembers;

        // The API answers what the table should show; `toHaveCount` retries until
        // the render settles, so nothing here races the console's own fetching.
        const inScope = async (query: Parameters<typeof listAssignments>[2] = {}) =>
          (
            await listAssignments(page.request, config, {
              scopes: [authzTarget.courseKey],
              pageSize: 50,
              ...query,
            })
          ).count;
        await expect(table.rows).toHaveCount(await inScope());

        // Searching by an account's name narrows the table to that account, and
        // the console asks the API for exactly that search.
        const searched = await table.search(me);
        expect(new URL(searched.url()).searchParams.get('search')).toBe(me);
        const mineCount = await inScope({ search: me });
        await expect(table.rows).toHaveCount(mineCount);
        await expect(table.rowsFor(me)).toHaveCount(mineCount);

        // Clearing it puts every row back.
        await table.clearSearch();
        await expect(table.rows).toHaveCount(await inScope());

        // A role filter narrows by role, and the console marks that filter as
        // applied — the structural signal, not its label.
        const filtered = await table.applyFirstFilterOption('role');
        expect(new URL(filtered.response.url()).searchParams.get('roles')).toBe(filtered.value);
        expect(await adminConsole.console.isFilterApplied(1)).toBe(true);
        await expect(table.rows).toHaveCount(await inScope({ roles: [filtered.value] }));
      },
    );

    // The console can only show a platform-level row that the API returns, and
    // openedx-authz stopped returning them: a superuser's own assignments read
    // back as `count: 0` (measured on 1.23.0, `RBAC-002`). There is nothing to
    // render, so the case has no subject on this target.
    test.fixme(
      'marks Super Admin and Global Staff rows as platform-managed',
      {
        annotation: [
          testId('TC-00568'),
          knownGap(
            'openedx-authz 1.23 exposes no assignment rows for superusers or global staff, so ' +
              'the console has no platform-level row to mark; re-check on a release that does.',
          ),
        ],
      },
      async ({ adminConsole, authzTarget }) => {
        await adminConsole.console.goto(authzTarget.courseKey);
        const table = adminConsole.teamMembers;
        await expect(table.rows.filter({ hasText: 'django.superuser' })).toHaveCount(1);
      },
    );
  },
);
