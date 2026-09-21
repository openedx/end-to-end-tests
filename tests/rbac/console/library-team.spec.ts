import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  LIBRARY_ROLES,
  fetchLibrary,
  listAssignments,
  listLibraries,
  listRoleUsers,
} from '../../../src/api';
import { seedScopeAssignments } from '../../../src/steps';
import { testId } from '../../../src/reporting';

/**
 * The library half of the console's Team Members tab — the sheet's
 * `STUDIO LIBRARIES: Manage Team` block, which Epic 10 handed over because the
 * library MFE gives team management to this console wherever one is configured.
 *
 * Both cases run with no waffle flag: creating a library makes the worker author
 * its `library_admin`, and library roles are enforced whatever
 * `authz.enable_course_authoring` says.
 */
test.describe(
  'Roles and Permissions console — library team',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@rbac', '@content-libraries'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'pages the team at ten rows',
      { annotation: testId('TC-00374') },
      async ({ page, config, adminConsole, authoringLibrary, studioAuthorSession, studioColleague }) => {
        void studioAuthorSession;
        const library = authoringLibrary.id;

        // The sheet wants a team of 12+. Rows are one per **assignment**, not per
        // user, so three accounts holding all four library roles are twelve rows
        // — plus the author's own, which creating the library granted.
        const colleagues = [await studioColleague(), await studioColleague(), await studioColleague()];
        await seedScopeAssignments(
          page.request,
          config,
          library,
          colleagues.map((colleague) => colleague.identity.username),
          LIBRARY_ROLES,
        );
        const total = (await listAssignments(page.request, config, { scopes: [library], pageSize: 50 }))
          .count;
        expect(total).toBeGreaterThan(12);

        await adminConsole.console.goto(library);
        const table = adminConsole.teamMembers;

        // Ten rows on the first page, the rest on the second, and the pager's
        // ends are disabled where there is nowhere further to go.
        await expect(table.rows).toHaveCount(10);
        await expect(table.previousPage).toBeDisabled();
        await expect(table.nextPage).toBeEnabled();

        await table.nextPage.click();
        await expect(table.rows).toHaveCount(total - 10);
        await expect(table.previousPage).toBeEnabled();
        await expect(table.nextPage).toBeDisabled();

        // Back to the first page, which is ten rows again.
        await table.previousPage.click();
        await expect(table.rows).toHaveCount(10);
      },
    );

    test(
      'shows a non-member neither the library nor its team',
      { annotation: testId('TC-00373') },
      async ({ config, adminConsole, authoringLibrary, studioAuthorSession, studioColleague }) => {
        void studioAuthorSession;
        const library = authoringLibrary.id;
        const outsider = await studioColleague();

        // Studio does not offer the library to a user with no role in it: it is
        // absent from their library list and refused by key.
        const listed = await listLibraries(outsider.request, config, {
          textSearch: authoringLibrary.slug,
        });
        expect(listed.results.map((entry) => entry.id)).not.toContain(library);
        await expect(fetchLibrary(outsider.request, config, library)).rejects.toMatchObject({
          status: 403,
        });
        await expect(listRoleUsers(outsider.request, config, library)).rejects.toMatchObject({
          status: 403,
        });

        // The console renders for them — it is not library-specific — but with
        // the library's scope preset it has nothing to show: no team, no rows.
        // (It shows an empty table rather than an access-denied view; the
        // refusals above are what actually protects the library.)
        await adminConsole.console.goto(library);
        await expect(adminConsole.teamMembers.rows).toHaveCount(0);
        expect(await adminConsole.console.isFilterApplied(2)).toBe(true);
      },
    );
  },
);
