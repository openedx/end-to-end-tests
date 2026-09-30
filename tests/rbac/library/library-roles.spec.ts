import { expect, test } from '../../../src/fixtures';
import {
  assignRole,
  canI,
  commitLibrary,
  fetchLibrary,
  libraryOlx,
  listLibraries,
  listLibraryBlocks,
  listRoleUsers,
  publishLibraryBlock,
  setLibraryBlockOlx,
} from '../../../src/api';
import { LIBRARY_SELECTORS, TIMEOUTS, libraryPath } from '../../../src/config';
import { seedScopeAssignments } from '../../../src/steps';
import { issue, knownGap, testId } from '../../../src/reporting';
import { RBAC_LIBRARY_TAGS, authorBlock, libraryLabel, statusOf } from './helpers';

/**
 * The library role ladder — what each of the four authz library roles may do in
 * Studio (`TC-00570`–`TC-00574`).
 *
 * The decisive oracle is the platform: every case drives the library MFE as the
 * role and then asks the v2 API what actually happened, because the MFE offers
 * some controls to roles the API refuses. Two of those gaps are findings of this
 * epic: a `library_contributor` is shown an item's publish control although
 * `POST <block>/publish/` answers 403 (`RBAC-011`), and a `library_user` sees
 * draft items the sheet expects to be hidden (`RBAC-010`).
 *
 * The roles are assigned through the authz API rather than the library's legacy
 * team endpoint so the case is about the authz vocabulary itself, and no waffle
 * flag is needed: library scopes are enforced regardless of
 * `authz.enable_course_authoring`.
 */
test.describe('AuthZ library roles', { tag: ['@regression', ...RBAC_LIBRARY_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'gives a library admin the whole library, its team and its public-reuse switch',
    { annotation: testId('TC-00570') },
    async (
      { page, config, adminConsole, authoringLibrary, libraryPage, studioAuthorSession },
      testInfo,
    ) => {
      void studioAuthorSession;
      // The worker author created this library, which is what made it the
      // library's `library_admin` — the role under test.
      const library = authoringLibrary.id;
      expect(
        await canI(page.request, config, 'content_libraries.manage_library_team', library),
      ).toBe(true);
      const title = libraryLabel('admin', testInfo.testId);
      const block = await authorBlock(page.request, config, library, title);

      // Drafts included: the admin sees content that has never been published.
      await libraryPage.goto(library);
      await expect(libraryPage.cardTitles.filter({ hasText: title })).toHaveCount(1, {
        timeout: TIMEOUTS.librarySearch,
      });

      // Both publish actions the case asks for: the item, then the library.
      expect(await statusOf(publishLibraryBlock(page.request, config, block.id))).toBe(200);
      await setLibraryBlockOlx(page.request, config, block.id, libraryOlx.html(title, 'again'));
      await libraryPage.openInfo();
      await expect(libraryPage.sidebar.publishAllButton).toBeVisible();
      expect((await libraryPage.sidebar.publishAll()).status()).toBe(200);
      await expect
        .poll(() =>
          fetchLibrary(page.request, config, library).then((l) => l.has_unpublished_changes),
        )
        .toBe(false);

      // The sidebar's team and reuse controls, both live for this role.
      await expect(libraryPage.sidebar.manageTeamLink).toBeVisible();
      await expect(libraryPage.sidebar.publicReadSwitch).toBeEnabled();

      // And the console it links to offers the team actions: assigning a role,
      // and removing someone else's.
      await adminConsole.console.goto(library);
      await expect(adminConsole.console.assignRoleButton).toBeVisible();
    },
  );

  test(
    'lets a library author create, edit and publish content — and, on this build, the library too',
    {
      annotation: [
        testId('TC-00571'),
        issue('https://github.com/openedx/wg-build-test-release/issues/589'),
      ],
    },
    async ({ page, config, authoringLibrary, studioAuthorSession, rbacCast }, testInfo) => {
      void studioAuthorSession;
      const library = authoringLibrary.id;
      const author = await rbacCast('libraryAuthor');
      await seedScopeAssignments(
        page.request,
        config,
        library,
        [author.identity.username],
        ['library_author'],
      );
      const title = libraryLabel('author', testInfo.testId);
      const block = await authorBlock(page.request, config, library, title);

      // Content: created, edited and published by the role itself.
      const own = await authorBlock(author.request, config, library, `${title} own`);
      expect(
        (await listLibraryBlocks(page.request, config, library)).results.map((item) => item.id),
      ).toContain(own.id);
      expect(
        await statusOf(
          setLibraryBlockOlx(author.request, config, block.id, libraryOlx.html(title, 'edited')),
        ),
      ).toBe(200);

      // The item's publish control is offered and works, through the UI.
      await author.libraryPage.goto(library);
      await author.libraryPage.openCard(title);
      await expect(author.libraryPage.sidebar.publishStatusDraft).toBeVisible();
      expect((await author.libraryPage.sidebar.publish()).status()).toBe(200);

      // The sheet expects "publish the library" to be denied to this role. It
      // is not: `library_author` holds `publish_library_content`, the info
      // panel offers Publish All, and the commit answers 200. The platform's
      // model is what is asserted; the discrepancy is `RBAC-012`.
      expect(
        await canI(author.request, config, 'content_libraries.publish_library_content', library),
      ).toBe(true);
      await author.libraryPage.goto(library);
      await author.libraryPage.openInfo();
      await expect(author.libraryPage.sidebar.publishAllButton).toBeVisible();
      expect(await statusOf(commitLibrary(author.request, config, library))).toBe(200);

      // Team management, though, is not theirs: the switch is read-only, and the
      // platform refuses the right the console's Assign Role action needs. (The
      // console still *offers* that action to this role — wg#603, reported by
      // TC-00396 — so what the button does, not whether it is drawn, is what
      // this case can assert.)
      await expect(author.libraryPage.sidebar.publicReadSwitch).toBeDisabled();
      expect(
        await canI(author.request, config, 'content_libraries.manage_library_team', library),
      ).toBe(false);
      await expect(
        assignRole(author.request, config, {
          role: 'library_user',
          scopes: [library],
          users: [author.identity.username],
        }),
      ).rejects.toMatchObject({ status: 403 });
    },
  );

  test(
    'lets a library contributor edit content but refuses every publish',
    {
      annotation: [
        testId('TC-00572'),
        issue('https://github.com/openedx/wg-build-test-release/issues/589'),
      ],
    },
    async ({ page, config, authoringLibrary, studioAuthorSession, rbacCast }, testInfo) => {
      void studioAuthorSession;
      const library = authoringLibrary.id;
      const contributor = await rbacCast('libraryContributor');
      await seedScopeAssignments(
        page.request,
        config,
        library,
        [contributor.identity.username],
        ['library_contributor'],
      );
      const title = libraryLabel('contrib', testInfo.testId);
      const block = await authorBlock(page.request, config, library, title);

      // Creating and editing: allowed.
      await authorBlock(contributor.request, config, library, `${title} own`);
      expect(
        await statusOf(
          setLibraryBlockOlx(
            contributor.request,
            config,
            block.id,
            libraryOlx.html(title, 'edited'),
          ),
        ),
      ).toBe(200);

      // Publishing: refused, both for one item and for the library.
      expect(
        await canI(
          contributor.request,
          config,
          'content_libraries.publish_library_content',
          library,
        ),
      ).toBe(false);
      expect(await statusOf(publishLibraryBlock(contributor.request, config, block.id))).toBe(403);
      expect(await statusOf(commitLibrary(contributor.request, config, library))).toBe(403);

      // The library-level action is also absent from the UI…
      await contributor.libraryPage.goto(library);
      await contributor.libraryPage.openInfo();
      await expect(contributor.libraryPage.sidebar.publishAllButton).toHaveCount(0);
      await expect(contributor.libraryPage.sidebar.publicReadSwitch).toBeDisabled();

      // …but the *item's* publish control is offered to this role, and the
      // platform then refuses the click with a 403 and leaves the draft as it
      // was (`RBAC-011`). Asserted because a user who is shown an action that
      // cannot work is the case's real risk, and because it is the platform,
      // not the button, that decides.
      await contributor.libraryPage.goto(library);
      await contributor.libraryPage.openCard(title);
      await expect(contributor.libraryPage.sidebar.publishStatusDraft).toBeVisible();
      expect((await contributor.libraryPage.sidebar.publish()).status()).toBe(403);
      await expect
        .poll(() =>
          listLibraryBlocks(page.request, config, library).then(
            (listed) =>
              listed.results.find((item) => item.id === block.id)?.has_unpublished_changes,
          ),
        )
        .toBe(true);

      // And no team management: the platform refuses the write the console's
      // Assign Role action makes (which it offers this role anyway — wg#603,
      // TC-00396).
      expect(
        await canI(contributor.request, config, 'content_libraries.manage_library_team', library),
      ).toBe(false);
      await expect(
        assignRole(contributor.request, config, {
          role: 'library_user',
          scopes: [library],
          users: [contributor.identity.username],
        }),
      ).rejects.toMatchObject({ status: 403 });
    },
  );

  test(
    'gives a library user a read-only library',
    {
      annotation: [
        testId('TC-00573'),
        issue('https://github.com/openedx/wg-build-test-release/issues/589'),
      ],
    },
    async ({ page, config, authoringLibrary, studioAuthorSession, rbacCast }, testInfo) => {
      void studioAuthorSession;
      const library = authoringLibrary.id;
      const reader = await rbacCast('libraryUser');
      await seedScopeAssignments(
        page.request,
        config,
        library,
        [reader.identity.username],
        ['library_user'],
      );
      const title = libraryLabel('reader', testInfo.testId);
      const block = await authorBlock(page.request, config, library, title);
      await commitLibrary(page.request, config, library);

      // Read: the library and its published content are theirs to see, and the
      // team is listed to them.
      expect((await fetchLibrary(reader.request, config, library)).can_edit_library).toBe(false);
      expect(
        (await listLibraryBlocks(reader.request, config, library)).results.map((item) => item.id),
      ).toContain(block.id);
      expect(
        (await listRoleUsers(reader.request, config, library)).members.map((row) => row.username),
      ).toContain(reader.identity.username);

      // Write: nothing. Create, edit and publish are all refused.
      expect(
        await canI(reader.request, config, 'content_libraries.edit_library_content', library),
      ).toBe(false);
      expect(await statusOf(authorBlock(reader.request, config, library, `${title} denied`))).toBe(
        403,
      );
      expect(
        await statusOf(
          setLibraryBlockOlx(reader.request, config, block.id, libraryOlx.html(title, 'nope')),
        ),
      ).toBe(403);
      expect(await statusOf(publishLibraryBlock(reader.request, config, block.id))).toBe(403);
      expect(await statusOf(commitLibrary(reader.request, config, library))).toBe(403);

      // And the MFE offers this role no authoring control at all: the info
      // panel keeps only its close button, and an item's sidebar neither edits
      // nor publishes.
      await reader.libraryPage.goto(library);
      await reader.libraryPage.openInfo();
      await expect(reader.libraryPage.sidebar.publishAllButton).toHaveCount(0);
      await expect(reader.libraryPage.sidebar.publicReadSwitch).toBeDisabled();
      await reader.libraryPage.goto(library);
      await reader.libraryPage.openCard(title);
      await expect(reader.libraryPage.sidebar.publishStatusButton).toHaveCount(0);
      await expect(reader.page.locator(LIBRARY_SELECTORS.sidebarEditComponentButton)).toHaveCount(
        0,
      );

      // No team management either (wg#603 again: the action is offered, the
      // write is refused).
      expect(
        await canI(reader.request, config, 'content_libraries.manage_library_team', library),
      ).toBe(false);
      await expect(
        assignRole(reader.request, config, {
          role: 'library_user',
          scopes: [library],
          users: [reader.identity.username],
        }),
      ).rejects.toMatchObject({ status: 403 });
    },
  );

  test.fixme(
    'hides unpublished content from a library user',
    {
      annotation: [
        testId('TC-00573'),
        knownGap(
          'A `library_user` sees drafts exactly as an author does: a never-published block is listed ' +
            "to them, and a published block's unpublished title is what the card shows (`RBAC-010`). " +
            'The case asks for draft items to be invisible to this role.',
        ),
      ],
    },
    async ({ page, config, authoringLibrary, studioAuthorSession, rbacCast }, testInfo) => {
      void studioAuthorSession;
      const library = authoringLibrary.id;
      const published = libraryLabel('v1', testInfo.testId);
      const draft = libraryLabel('v2', testInfo.testId);
      const block = await authorBlock(page.request, config, library, published);
      await commitLibrary(page.request, config, library);
      await setLibraryBlockOlx(page.request, config, block.id, libraryOlx.html(draft, draft));
      const neverPublished = await authorBlock(page.request, config, library, `${draft} new`);

      const reader = await rbacCast('libraryUser');
      await seedScopeAssignments(
        page.request,
        config,
        library,
        [reader.identity.username],
        ['library_user'],
      );

      // What the case asks for: the published state only.
      const listed = await listLibraryBlocks(reader.request, config, library);
      expect(listed.results.map((item) => item.id)).not.toContain(neverPublished.id);
      await reader.libraryPage.goto(library);
      await expect(reader.libraryPage.cardTitles.filter({ hasText: draft })).toHaveCount(0);
      await expect(reader.libraryPage.cardTitles.filter({ hasText: published })).toHaveCount(1);
    },
  );

  test(
    'shows a user with no role neither the library nor its content',
    { annotation: testId('TC-00574') },
    async ({ config, authoringLibrary, studioAuthorSession, rbacCast }) => {
      void studioAuthorSession;
      const library = authoringLibrary.id;
      const outsider = await rbacCast('outsider');

      // The platform refuses them the library outright.
      expect(await canI(outsider.request, config, 'content_libraries.view_library', library)).toBe(
        false,
      );
      expect(await statusOf(fetchLibrary(outsider.request, config, library))).toBe(403);
      expect(
        (
          await listLibraries(outsider.request, config, { textSearch: authoringLibrary.slug })
        ).results.map((entry) => entry.id),
      ).not.toContain(library);

      // Studio home does not list it…
      await outsider.studioHomePage.goto();
      await outsider.studioHomePage.openLibrariesTab();
      await expect(outsider.studioHomePage.libraryCardLink(library)).toHaveCount(0);

      // …and the direct URL answers with the MFE's access-denied view rather
      // than the library.
      await outsider.page.goto(libraryPath(config, library), { waitUntil: 'domcontentloaded' });
      // Either alert satisfies the case ("an access denied or not found
      // error"); this build answers with its not-found one, which is also how it
      // avoids telling an outsider that the library exists.
      await expect(
        outsider.page.locator(
          `${LIBRARY_SELECTORS.permissionDeniedAlert}, ${LIBRARY_SELECTORS.notFoundAlert}`,
        ),
      ).toBeVisible({ timeout: TIMEOUTS.navigation });
      await expect(outsider.page.locator(LIBRARY_SELECTORS.page)).toHaveCount(0);
    },
  );
});
