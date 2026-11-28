import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  PLATFORM_ROLES,
  fetchStudioUsername,
  listAssignments,
  listRoleUsers,
  listTeamMembers,
} from '../../../src/api';
import { TEAM_MEMBER_COLUMN_COUNT } from '../../../src/pages/admin-console';
import { checkA11y } from '../../../src/a11y';
import { issue, knownGap, testId } from '../../../src/reporting';
import { RBAC_TAGS, ADMIN_CONSOLE_A11Y_BASELINE } from '../helpers';

/** The Team Members table's page: the console lists ten rows at a time. */
const TEAM_MEMBERS_PAGE_SIZE = 10;

/**
 * The console's **Team Members** tab: what the table lists, how it narrows, and
 * what it marks.
 *
 * What a row is depends on the console's generation. `verawood` lists one row
 * per **assignment** from `/api/authz/v1/assignments/`, so the course's creator —
 * carrying both `course_admin` and `course_staff` after migration — is two rows.
 * `main` lists one row per **user** from `/api/authz/v1/users/`, with the rest of
 * that user's roles behind a "+N more roles" toggle
 * (frontend-app-admin-console#222). The table reports which it renders, and the
 * oracle is `listTeamMembers` under that grouping: the console is asserted to
 * render what the API returns, never to contain a particular label.
 */
test.describe(
  'Roles and Permissions console — Team Members',
  { tag: ['@regression', ...RBAC_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'lists the team, marks your own row, and pages at ten',
      { annotation: testId('TC-00561') },
      async ({ page, config, adminConsole, authzTarget, studioAuthorSession }) => {
        void studioAuthorSession;
        // Ask the platform who this browser is, rather than trusting a fixture's
        // record of it: the console marks rows by the signed-in account.
        const me = await fetchStudioUsername(page.request, config);
        const scoped = await listRoleUsers(page.request, config, authzTarget.courseKey);

        await adminConsole.console.goto(authzTarget.courseKey);
        const table = adminConsole.teamMembers;
        const grouping = await table.grouping();
        const team = await listTeamMembers(page.request, config, grouping, {
          scopes: [authzTarget.courseKey],
          pageSize: 50,
        });

        // The grouping's columns, and as many rows as the API reports in scope.
        await expect(table.columnHeaders).toHaveCount(TEAM_MEMBER_COLUMN_COUNT[grouping]);
        await expect(table.rows).toHaveCount(team.count);

        // The author holds two roles on a course it created and migrated: two
        // rows grouped by assignment, or one row whose other role sits behind
        // the "more roles" toggle grouped by user — as many rows as the API
        // answers for the author, and a toggle on each that stands for more.
        const mine = table.rowsFor(me);
        const myRoles = scoped.members.find((member) => member.username === me)?.roles ?? [];
        expect(myRoles.length).toBeGreaterThan(1);
        const myRows = team.rows.filter((row) => row.username === me);
        expect(myRows.reduce((sum, row) => sum + row.assignmentCount, 0)).toBe(myRoles.length);
        await expect(mine).toHaveCount(myRows.length);
        await expect(table.moreRolesToggle(mine)).toHaveCount(
          myRows.filter((row) => row.assignmentCount > 1).length,
        );

        // The signed-in user's own row is marked as theirs.
        await expect.poll(() => table.isMarkedAsCurrentUser(mine.first(), me)).toBe(true);

        // The role marker is rendered, and the scope cell names the course the
        // table is filtered to — by key when grouped by assignment, by the
        // display name the API pairs with it when grouped by user.
        await expect(table.roleMarker(mine.first())).toHaveCount(1);
        expect(myRows[0]?.first?.scope).toBe(authzTarget.courseKey);
        await expect(await table.cell(mine.first(), 'scope')).toContainText(
          myRows[0]?.scopeName ?? authzTarget.courseKey,
        );

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
        const grouping = await table.grouping();

        // The API answers what the table should show; `toHaveCount` retries until
        // the render settles, so nothing here races the console's own fetching.
        const inScope = async (query: Parameters<typeof listTeamMembers>[3] = {}) =>
          (
            await listTeamMembers(page.request, config, grouping, {
              scopes: [authzTarget.courseKey],
              pageSize: 50,
              ...query,
            })
          ).count;
        await expect(table.rows).toHaveCount(await inScope());

        // Typing part of an account's name narrows the table to the accounts
        // the platform matches, and the console asks the API for exactly that.
        const account = (
          await listTeamMembers(page.request, config, grouping, {
            scopes: [authzTarget.courseKey],
            search: me,
          })
        ).rows.find((row) => row.username === me);
        expect(account?.email).toBeTruthy();
        const email = account?.email ?? '';
        const partOfName = me.slice(0, -1);
        const searched = await table.search(partOfName);
        expect(new URL(searched.url()).searchParams.get('search')).toBe(partOfName);
        const byName = await inScope({ search: partOfName });
        expect(byName).toBeGreaterThan(0);
        await expect(table.rows).toHaveCount(byName);
        await expect(table.rowsFor(email)).toHaveCount(byName);

        // Clearing it puts every row back; part of the e-mail address (through
        // its `@`, which no username holds) narrows the same way.
        await table.clearSearch();
        await expect(table.rows).toHaveCount(await inScope());
        const partOfEmail = email.slice(0, email.indexOf('@') + 2);
        await table.search(partOfEmail);
        const byEmail = await inScope({ search: partOfEmail });
        expect(byEmail).toBeGreaterThan(0);
        await expect(table.rows).toHaveCount(byEmail);
        await expect(table.rowsFor(email)).toHaveCount(byEmail);
        await table.clearSearch();
        await expect(table.rows).toHaveCount(await inScope());

        // The console opened on this course, so its Scope filter is the one
        // applied filter and has the one chip under the filter row.
        const applied = async () => [
          await adminConsole.console.isFilterApplied(0),
          await adminConsole.console.isFilterApplied(1),
          await adminConsole.console.isFilterApplied(2),
        ];
        expect(await applied()).toEqual([false, false, true]);
        await expect(table.filterChips).toHaveCount(1);

        // An organization narrows by organization and adds its chip.
        const org = await table.applyFirstFilterOption('organization');
        expect(new URL(org.response.url()).searchParams.get('orgs')).toBe(org.value);
        await table.closeFilterMenu();
        await expect(table.filterChips).toHaveCount(2);
        await expect(table.rows).toHaveCount(await inScope({ orgs: [org.value] }));

        // A role narrows further and adds a third chip; the Role menu lists its
        // roles under a heading per kind of scope. The console marks each
        // applied filter on its toggle — the structural signal, not a label.
        const role = await table.applyFirstFilterOption('role');
        expect(new URL(role.response.url()).searchParams.get('roles')).toBe(role.value);
        expect(await table.filterGroupNames.count()).toBeGreaterThan(0);
        await table.closeFilterMenu();
        await expect(table.filterChips).toHaveCount(3);
        expect(await applied()).toEqual([true, true, true]);
        const narrowed = await inScope({ orgs: [org.value], roles: [role.value] });
        expect(narrowed).toBeLessThanOrEqual(await inScope({ orgs: [org.value] }));
        await expect(table.rows).toHaveCount(narrowed);

        // One chip's X removes that filter alone (chips sit in the order their
        // filters were applied, so the last is the role's) and the table follows.
        await table.removeFilterChip(2);
        await expect(table.filterChips).toHaveCount(2);
        await expect.poll(applied).toEqual([true, false, true]);
        await expect(table.rows).toHaveCount(await inScope({ orgs: [org.value] }));

        // Clear filters removes them all, the scope the console opened on
        // included: no chip, no applied toggle, and the unfiltered first page.
        await table.clearAllFilters();
        await expect(table.filterChips).toHaveCount(0);
        await expect.poll(applied).toEqual([false, false, false]);
        const everyone = await listTeamMembers(page.request, config, grouping, {
          pageSize: TEAM_MEMBERS_PAGE_SIZE,
        });
        await expect(table.rows).toHaveCount(Math.min(everyone.count, TEAM_MEMBERS_PAGE_SIZE));

        // And the Scope filter, chosen from its own menu this time, narrows the
        // table back to this course.
        await table.applyFilterOption('scope', authzTarget.courseKey);
        await expect.poll(applied).toEqual([false, false, true]);
        await expect(table.filterChips).toHaveCount(1);
        await expect(table.rows).toHaveCount(await inScope());
      },
    );

    // The console can only show a platform-level row that the API returns, and
    // openedx-authz stopped returning them (#345, a short-term fix; #347 brings
    // them back): a superuser's own assignments read back as `count: 0`
    // (measured on 1.23.0, `RBAC-002`). There is nothing to render, so the case
    // has no subject on this target.
    test.fixme(
      'marks Super Admin and Global Staff rows as platform-managed',
      {
        annotation: [
          testId('TC-00568'),
          knownGap(
            'RBAC-002: openedx-authz 1.23 exposes no assignment rows for superusers or global staff, so ' +
              'the console has no platform-level row to mark; re-check on a release that does.',
          ),
          issue('https://github.com/openedx/openedx-authz/issues/347'),
        ],
      },
      async ({ page, config, adminConsole }) => {
        // The premise first: the platform exposes assignments for its own roles.
        // That is what 1.23 stopped doing, so this is where the case stops.
        const platform = await listAssignments(page.request, config, {
          roles: [...PLATFORM_ROLES],
          pageSize: 50,
        });
        expect(platform.count).toBeGreaterThan(0);

        // Such a row is listed, and offers no way to take the role away here —
        // it is managed in Django admin. The subject is located by the username
        // the API returned, which is data rather than a rendered label.
        const subject = platform.assignments[0]?.username ?? '';
        await adminConsole.console.goto();
        const table = adminConsole.teamMembers;
        const row = table.rowsFor(subject).first();
        await expect(row).toBeVisible();
        await expect(table.roleMarker(row)).toHaveCount(1);
      },
    );
  },
);
