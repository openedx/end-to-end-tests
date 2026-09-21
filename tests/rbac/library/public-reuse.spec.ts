import { expect, test } from '../../../src/fixtures';
import {
  availableComponentTypes,
  buildSection,
  commitLibrary,
  fetchContainer,
  fetchLibrary,
  libraryOlx,
  setCourseTeamRole,
  setLibraryBlockOlx,
  updateLibrary,
} from '../../../src/api';
import { LIBRARY_SELECTORS, TIMEOUTS } from '../../../src/config';
import { seedScopeAssignments } from '../../../src/steps';
import { issue, knownGap, testId } from '../../../src/reporting';
import { RBAC_LIBRARY_TAGS, authorBlock, libraryLabel } from './helpers';

/**
 * Public reuse of a library's published content (`TC-00575`) — the sidebar
 * switch that lets Studio users with no role in the library pull its published
 * items into their courses.
 *
 * Epic 10 already covers the switch's own round trip and the access it grants
 * (`TC-00333`, `TC-00420`–`TC-00426`, `studio/library/public-read.spec.ts`).
 * What this case adds, and what is asserted here, is the RBAC sheet's three
 * clauses on top of that: the success message the flip shows, that a reusing
 * outsider sees **published** items only, and that the roles without
 * `manage_library_team` — assigned here through authz rather than the legacy
 * team endpoint — get the switch read-only in whichever state it is in.
 *
 * The outcome is read from the picker of a course the outsider actually works
 * on, because public read grants nothing to an account that cannot author.
 */
test.describe('AuthZ library public reuse', { tag: ['@regression', ...RBAC_LIBRARY_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'offers published content to an unaffiliated author only while the switch is on',
    {
      annotation: [
        testId('TC-00575'),
        issue('https://github.com/openedx/openedx-authz/issues/239'),
      ],
    },
    async (
      {
        page,
        config,
        authoringLibrary,
        libraryPage,
        contentCourse,
        resyncStudioAuthor,
        studioAuthorSession,
        studioColleague,
      },
      testInfo,
    ) => {
      void studioAuthorSession;
      const library = authoringLibrary.id;
      const published = libraryLabel('reusable', testInfo.testId);
      const draft = libraryLabel('draft', testInfo.testId);
      await authorBlock(page.request, config, library, published);
      await commitLibrary(page.request, config, library);
      const held = await authorBlock(page.request, config, library, draft);
      await setLibraryBlockOlx(page.request, config, held.id, libraryOlx.html(draft, draft));

      // The outsider: no role in the library, but staff on a course of ours, so
      // they have somewhere to reuse content into.
      const outsider = await studioColleague();
      await resyncStudioAuthor();
      await setCourseTeamRole(
        page.request,
        config,
        contentCourse.courseKey,
        outsider.identity.email,
        'staff',
      );
      const section = await buildSection(
        page.request,
        config,
        contentCourse.courseKey,
        libraryLabel('picker', testInfo.testId),
        { subsections: [{ units: [{ blocks: [] }] }] },
      );
      const unitKey = section.units[0]?.usageKey ?? '';
      const types = availableComponentTypes(await fetchContainer(page.request, config, unitKey));

      // Off by default. (The flip saves silently on this build — see the held
      // case below — so the reading is the API's, not a message's.)
      await libraryPage.goto(library);
      await libraryPage.openInfo();
      await expect(libraryPage.sidebar.publicReadSwitch).not.toBeChecked();
      expect((await libraryPage.sidebar.setPublicRead(true))?.status()).toBe(200);
      await expect
        .poll(() =>
          fetchLibrary(page.request, config, library).then((entry) => entry.allow_public_read),
        )
        .toBe(true);

      // The outsider may now reuse the library — and sees its published item
      // but not the one that has never been published.
      await outsider.unitPage.goto(unitKey);
      await outsider.unitPage.openAddComponent(types.indexOf('library_v2'));
      await outsider.libraryPicker.root.waitFor();
      await outsider.libraryPicker.selectLibrary(library, authoringLibrary.slug);
      await expect(outsider.libraryPicker.cardFor(published).first()).toBeVisible({
        timeout: TIMEOUTS.librarySearch,
      });
      await expect(outsider.libraryPicker.cardFor(draft)).toHaveCount(0);
      await outsider.libraryPicker.close();

      // Off again: the library is not offered at all.
      await libraryPage.goto(library);
      await libraryPage.openInfo();
      expect((await libraryPage.sidebar.setPublicRead(false))?.status()).toBe(200);
      await outsider.unitPage.goto(unitKey);
      await outsider.unitPage.openAddComponent(types.indexOf('library_v2'));
      await outsider.libraryPicker.root.waitFor();
      await outsider.libraryPicker.searchLibraries(authoringLibrary.slug);
      await expect(outsider.libraryPicker.libraryRadio(library)).toHaveCount(0, {
        timeout: TIMEOUTS.librarySearch,
      });
    },
  );

  test(
    'shows the switch read-only to a role that cannot manage the team',
    {
      annotation: [
        testId('TC-00575'),
        issue('https://github.com/openedx/openedx-authz/issues/239'),
      ],
    },
    async ({ page, config, authoringLibrary, studioAuthorSession, studioColleague }) => {
      void studioAuthorSession;
      const library = authoringLibrary.id;
      const author = await studioColleague();
      const contributor = await studioColleague();
      await seedScopeAssignments(
        page.request,
        config,
        library,
        [author.identity.username],
        ['library_author'],
      );
      await seedScopeAssignments(
        page.request,
        config,
        library,
        [contributor.identity.username],
        ['library_contributor'],
      );

      // Off: both see it, neither can move it.
      for (const actor of [author, contributor]) {
        await actor.libraryPage.goto(library);
        await actor.libraryPage.openInfo();
        await expect(actor.libraryPage.sidebar.publicReadSwitch).toBeVisible();
        await expect(actor.libraryPage.sidebar.publicReadSwitch).toBeDisabled();
        await expect(actor.libraryPage.sidebar.publicReadSwitch).not.toBeChecked();
      }

      // On: still read-only, and showing the state the admin left it in.
      await updateLibrary(page.request, config, library, { allowPublicRead: true });
      for (const actor of [author, contributor]) {
        await actor.libraryPage.goto(library);
        await actor.libraryPage.openInfo();
        await expect(actor.libraryPage.sidebar.publicReadSwitch).toBeChecked();
        await expect(actor.libraryPage.sidebar.publicReadSwitch).toBeDisabled();
      }
    },
  );

  test.fixme(
    'reports a saved public-reuse change',
    {
      annotation: [
        testId('TC-00575'),
        knownGap(
          'Flipping the switch saves (the PATCH answers 200) but the MFE shows nothing at all: no ' +
            'toast, alert or saving state, in either direction (`RBAC-013`). The case, and ' +
            "openedx-authz#239's acceptance criteria, ask for a success message.",
        ),
      ],
    },
    async ({ page, config, authoringLibrary, libraryPage, studioAuthorSession }) => {
      void studioAuthorSession;
      const library = authoringLibrary.id;
      await libraryPage.goto(library);
      await libraryPage.openInfo();

      expect((await libraryPage.sidebar.setPublicRead(true))?.status()).toBe(200);
      await expect(page.locator(LIBRARY_SELECTORS.toast)).toBeVisible();
      expect((await fetchLibrary(page.request, config, library)).allow_public_read).toBe(true);
    },
  );
});
