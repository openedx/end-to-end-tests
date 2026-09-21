import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { testId } from '../../../src/reporting';

/**
 * Reaching the **Roles and Permissions console**, and what it opens onto.
 *
 * The sheet describes three entry points. Two are scoped to a resource and work
 * here: a library's sidebar offers the console whatever the flag says, and a
 * course's Settings menu swaps Course Team for the console once AuthZ is on for
 * that course. The third — Studio Home's own link — is rendered from the flag
 * read with **no course context**, so only a target that has enabled AuthZ
 * globally shows it; that assertion carries `@rbac-global` and skips elsewhere
 * rather than pretending the entry point is missing.
 */
test.describe(
  'Roles and Permissions console access',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@rbac'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'opens from a library sidebar and from an AuthZ course’s Settings menu',
      { annotation: [testId('TC-00560'), testId('TC-00631')] },
      async ({
        page,
        config,
        adminConsole,
        authzTarget,
        authoringLibrary,
        libraryPage,
        studioCourseOutlinePage,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        void config;

        // Entry point 1 — a library's sidebar, which needs no flag at all: the
        // library MFE hands team management to the console wherever one is
        // configured.
        await libraryPage.goto(authoringLibrary.id);
        await libraryPage.openInfo();
        await expect(libraryPage.sidebar.manageTeamLink).toBeVisible();
        const fromLibrary = await adminConsole.console.linkTarget(
          libraryPage.sidebar.manageTeamLink,
        );
        expect(fromLibrary.base).toBe(`${adminConsole.origin}/authz`);
        expect(fromLibrary.scope).toBe(authoringLibrary.id);

        // Entry point 2 — the course header's Settings menu, once AuthZ is on for
        // that course. The link replaces Course Team, which is why the legacy
        // entry is gone here.
        await studioCourseOutlinePage.goto(authzTarget.courseKey);
        await studioCourseOutlinePage.openSettingsMenu();
        await expect(studioCourseOutlinePage.rolesAndPermissionsLink).toBeVisible();
        const fromCourse = await adminConsole.console.linkTarget(
          studioCourseOutlinePage.rolesAndPermissionsLink,
        );
        expect(fromCourse.base).toBe(`${adminConsole.origin}/authz`);
        expect(fromCourse.scope).toBe(authzTarget.courseKey);
        await expect(studioCourseOutlinePage.courseTeamLink).toHaveCount(0);

        // The console itself opens on Team Members, preset to the scope it was
        // opened for: it asks this installation's authz API about that course —
        // the gated spec's proof that the surface is really there — the first tab
        // is selected, and the scope filter shows as applied.
        const opened = await adminConsole.console.waitForAssignments(authzTarget.courseKey, () =>
          adminConsole.console.goto(authzTarget.courseKey),
        );
        expect(opened.ok()).toBe(true);
        await expect(adminConsole.console.tabs.first()).toHaveAttribute('aria-selected', 'true');
        expect(await adminConsole.console.isFilterApplied(2)).toBe(true);

        // Unfiltered, the same console opens with no scope applied.
        await adminConsole.console.goto();
        expect(await adminConsole.console.isFilterApplied(2)).toBe(false);
        await expect(page).toHaveURL(new RegExp(`${adminConsole.origin}/authz`));
      },
    );

    test(
      'offers the console from Studio home where AuthZ is on for the whole target',
      { tag: '@rbac-global', annotation: testId('TC-00560') },
      async ({ page, studioHomePage, adminConsole, studioAuthorSession }) => {
        void studioAuthorSession;
        // Studio Home has no course in context, so the authoring MFE renders this
        // entry point from the *global* flag alone — a per-course or per-org
        // override never produces it (Epic 12 plan §1.8.8).
        await studioHomePage.goto();
        await expect(page.locator(`a[href*="${adminConsole.origin}"]`).first()).toBeVisible();
      },
    );
  },
);
