import { expect, test } from '../../../src/fixtures';
import { checkA11y } from '../../../src/a11y';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  buildSection,
  commitLibrary,
  fetchContainer,
  fetchLibrary,
  setCourseTeamRole,
  updateLibrary,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { LIBRARY_A11Y_BASELINE, LIBRARY_TAGS, authorTextBlock, label } from './helpers';

/**
 * "Allow public read" — the library setting that lets any Studio user reuse
 * the library's published content (TC-00333, TC-00420–TC-00426). The admin
 * flips it in the library's info sidebar; a second **course-creator** account
 * (public read grants nothing to a plain learner) reads the library through
 * the API and sees, or does not see, the library in a course's "Library
 * Content" picker. A member without the manage-team right sees the switch but
 * cannot move it.
 */
test.describe('Library public read access', { tag: ['@regression', ...LIBRARY_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'the admin turns public read on and off; an unaffiliated Studio user gains and loses read access',
    {
      annotation: [testId('TC-00333'), testId('TC-00420'), testId('TC-00421'), testId('TC-00422')],
    },
    async ({
      page,
      config,
      studioAuthorSession,
      resyncStudioAuthor,
      authoringLibrary,
      libraryPage,
      studioColleague,
    }) => {
      void studioAuthorSession;
      await resyncStudioAuthor();
      const outsider = await studioColleague();
      await libraryPage.goto(authoringLibrary.id);
      await libraryPage.openInfo();

      // Off by default, and visible to the admin.
      expect(
        (await fetchLibrary(page.request, config, authoringLibrary.id)).allow_public_read,
      ).toBe(false);
      await expect(libraryPage.sidebar.publicReadSwitch).toBeVisible();
      await expect(libraryPage.sidebar.publicReadSwitch).toBeEnabled();
      await expect(libraryPage.sidebar.publicReadSwitch).not.toBeChecked();
      await expect(
        fetchLibrary(outsider.request, config, authoringLibrary.id),
      ).rejects.toMatchObject({ status: 403 });

      // On: the unaffiliated Studio user may read.
      expect((await libraryPage.sidebar.setPublicRead(true))?.status()).toBe(200);
      await expect
        .poll(() =>
          fetchLibrary(page.request, config, authoringLibrary.id).then((l) => l.allow_public_read),
        )
        .toBe(true);
      expect((await fetchLibrary(outsider.request, config, authoringLibrary.id)).id).toBe(
        authoringLibrary.id,
      );

      // Off again: access is revoked.
      expect((await libraryPage.sidebar.setPublicRead(false))?.status()).toBe(200);
      await expect
        .poll(() =>
          fetchLibrary(page.request, config, authoringLibrary.id).then((l) => l.allow_public_read),
        )
        .toBe(false);
      await expect(
        fetchLibrary(outsider.request, config, authoringLibrary.id),
      ).rejects.toMatchObject({ status: 403 });
      await checkA11y(page, { label: 'library-info', additionalBaseline: LIBRARY_A11Y_BASELINE });
    },
  );

  test(
    'a member without the manage-team right sees the switch read-only, off and on',
    { annotation: [testId('TC-00423'), testId('TC-00424')] },
    async ({ page, config, studioAuthorSession, resyncStudioAuthor, authoringLibrary, studioColleague }) => {
      void studioAuthorSession;
      await resyncStudioAuthor();
      const member = await studioColleague({
        libraryAccess: { libraryKey: authoringLibrary.id, level: 'author' },
      });

      await member.libraryPage.goto(authoringLibrary.id);
      await member.libraryPage.openInfo();
      await expect(member.libraryPage.sidebar.publicReadSwitch).toBeVisible();
      await expect(member.libraryPage.sidebar.publicReadSwitch).toBeDisabled();
      await expect(member.libraryPage.sidebar.publicReadSwitch).not.toBeChecked();

      await updateLibrary(page.request, config, authoringLibrary.id, { allowPublicRead: true });
      await member.libraryPage.goto(authoringLibrary.id);
      await member.libraryPage.openInfo();
      await expect(member.libraryPage.sidebar.publicReadSwitch).toBeChecked();
      await expect(member.libraryPage.sidebar.publicReadSwitch).toBeDisabled();
    },
  );

  test(
    'the course picker offers a library to unaffiliated users only while public read is on',
    { annotation: [testId('TC-00425'), testId('TC-00426')] },
    async (
      { page, config, studioAuthorSession, resyncStudioAuthor, authoringLibrary, contentCourse, studioColleague },
      testInfo,
    ) => {
      void studioAuthorSession;
      const title = label('shared', testInfo.testId);
      await authorTextBlock(page.request, config, authoringLibrary.id, title);
      await commitLibrary(page.request, config, authoringLibrary.id);
      // User U authors a course of the worker author's (course staff), but has no
      // role in the library.
      const outsider = await studioColleague();
      // The v2 library writes rotated this context's Studio session, and
      // provisioning the colleague left its LMS half stale; a browser re-sync
      // (which re-logs-in if needed) heals both before the legacy course writes.
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
        label('picker', testInfo.testId),
        {
          subsections: [{ units: [{ blocks: [] }] }],
        },
      );
      const unitKey = section.units[0]?.usageKey ?? '';
      const types = availableComponentTypes(await fetchContainer(page.request, config, unitKey));

      // Off: the library is not offered. (Search for it by slug so the picker's
      // paginated list — many accumulated libraries — cannot hide a false pass.)
      await outsider.unitPage.goto(unitKey);
      await outsider.unitPage.openAddComponent(types.indexOf('library_v2'));
      await outsider.libraryPicker.root.waitFor();
      await outsider.libraryPicker.searchLibraries(authoringLibrary.slug);
      await expect(outsider.libraryPicker.libraryRadio(authoringLibrary.id)).toHaveCount(0);
      await outsider.libraryPicker.close();

      // On: the library is offered and its published content can be added.
      await updateLibrary(page.request, config, authoringLibrary.id, { allowPublicRead: true });
      await outsider.unitPage.goto(unitKey);
      await outsider.unitPage.openAddComponent(types.indexOf('library_v2'));
      await outsider.libraryPicker.searchLibraries(authoringLibrary.slug);
      await expect(outsider.libraryPicker.libraryRadio(authoringLibrary.id)).toHaveCount(1, {
        timeout: TIMEOUTS.librarySearch,
      });
      await outsider.libraryPicker.selectLibrary(authoringLibrary.id);
      await outsider.libraryPicker
        .cardFor(title)
        .first()
        .waitFor({ timeout: TIMEOUTS.librarySearch });
      expect((await outsider.libraryPicker.addToCourse(title)).status()).toBe(200);
    },
  );
});
