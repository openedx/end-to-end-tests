import { expect, test } from '../../../src/fixtures';
import { checkA11y } from '../../../src/a11y';
import { DEFAULT_COURSE_ORG, fetchLibrary, libraryKeyFor, newLibrarySlug } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { LIBRARY_A11Y_BASELINE, LIBRARY_TAGS, label } from './helpers';

/**
 * Creating a content library from Studio Home (TC-00327) and the library's
 * settings view (TC-00365).
 *
 * The form drives the creation; `POST /api/libraries/v2/` and the library's
 * own `GET` decide pass/fail. The org is the suite's content org, which the
 * worker author may create libraries in (Studio's `allowed_organizations_for_libraries`).
 */
test.describe('Content library creation', { tag: ['@regression', ...LIBRARY_TAGS] }, () => {
  test(
    'creates a new library from Studio Home',
    { annotation: testId('TC-00327') },
    async (
      { page, config, studioAuthorSession, studioHomePage, createLibraryPage, libraryPage },
      testInfo,
    ) => {
      void studioAuthorSession;
      const org = config.org ?? DEFAULT_COURSE_ORG;
      const slug = newLibrarySlug('create');
      const title = label('library', testInfo.testId);

      await studioHomePage.goto();
      await expect(studioHomePage.newLibraryLink).toBeVisible();
      await studioHomePage.newLibrary();
      await createLibraryPage.fill({ title, org, slug });
      const created = await createLibraryPage.submit();
      expect(created.status()).toBe(200);

      // The MFE lands on the new library; the API knows it by the key the form implied.
      await expect(page).toHaveURL((url) =>
        url.pathname.endsWith(`/library/${libraryKeyFor(org, slug)}`),
      );
      const library = await fetchLibrary(page.request, config, libraryKeyFor(org, slug));
      expect(library).toMatchObject({ org, slug, title, num_blocks: 0, can_edit_library: true });

      await libraryPage.root.waitFor();
      await checkA11y(page, { label: 'library-home', additionalBaseline: LIBRARY_A11Y_BASELINE });
    },
  );

  test(
    'shows the library settings in the info sidebar',
    { annotation: testId('TC-00365') },
    async ({ page, config, studioAuthorSession, workerLibrary, libraryPage }) => {
      void studioAuthorSession;
      await libraryPage.goto(workerLibrary.libraryKey);
      await libraryPage.openInfo();

      // The settings the sidebar renders are the library's own fields: the
      // public-read switch reflects `allow_public_read`, and the team control is
      // offered (a link into the admin console, or the team modal's button).
      const library = await fetchLibrary(page.request, config, workerLibrary.libraryKey);
      await expect(libraryPage.sidebar.publicReadSwitch).toBeVisible();
      await expect(libraryPage.sidebar.publicReadSwitch).toBeChecked({
        checked: library.allow_public_read,
      });
      await expect(
        libraryPage.sidebar.manageTeamLink.or(libraryPage.sidebar.manageTeamButton).first(),
      ).toBeVisible();
      await checkA11y(page, { label: 'library-info', additionalBaseline: LIBRARY_A11Y_BASELINE });
    },
  );
});
