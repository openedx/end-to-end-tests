import { expect, test } from '../../../src/fixtures';
import { checkA11y } from '../../../src/a11y';
import { TIMEOUTS, getRunId } from '../../../src/config';
import {
  DEFAULT_COURSE_ORG,
  addLegacyLibraryBlock,
  createLegacyLibrary,
  listLegacyLibraries,
  listLibraryBlocks,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { waitForMigration } from '../../../src/steps';
import { LIBRARY_A11Y_BASELINE, label } from './helpers';

/**
 * Legacy (v1) content libraries: creating one (TC-00250) and migrating one
 * (TC-00369) or several (TC-00370) into a v2 library through the migration
 * stepper. Gated on `content-libraries-v1`. Legacy libraries cannot be deleted
 * through any API, so each test creates as few as it needs.
 *
 * On `main` the authoring MFE no longer renders the legacy "create library"
 * form; TC-00250 drives the legacy Studio endpoint the form posts to and
 * asserts Studio Home's libraries listing.
 */
test.describe(
  'Legacy content libraries and migration',
  {
    tag: [
      '@regression',
      '@studio',
      '@author',
      '@mfe-authoring',
      '@content-libraries',
      '@content-libraries-v1',
    ],
  },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'creates a legacy library that the platform lists as not yet migrated',
      { annotation: testId('TC-00250') },
      async ({ page, config, studioAuthorSession, legacyLibrary, studioHomePage }) => {
        void studioAuthorSession;
        const listed = (await listLegacyLibraries(page.request, config)).find(
          (l) => l.library_key === legacyLibrary.libraryKey,
        );
        expect(listed).toMatchObject({
          display_name: legacyLibrary.displayName,
          is_migrated: false,
        });
        await studioHomePage.goto();
        await studioHomePage.openLibrariesTab();
        await expect(studioHomePage.newLibraryLink).toBeVisible();
      },
    );

    test(
      'migrates one legacy library into a v2 library',
      { annotation: testId('TC-00369') },
      async ({
        page,
        config,
        studioAuthorSession,
        legacyLibrary,
        authoringLibrary,
        legacyMigrationPage,
      }) => {
        void studioAuthorSession;
        await legacyMigrationPage.goto();
        await checkA11y(page, {
          label: 'legacy-migrate',
          additionalBaseline: LIBRARY_A11Y_BASELINE,
        });
        await legacyMigrationPage.search(legacyLibrary.displayName);
        await legacyMigrationPage.selectLegacyLibrary(legacyLibrary.displayName);
        await legacyMigrationPage.next();
        await legacyMigrationPage.selectDestination(authoringLibrary.id);
        await legacyMigrationPage.next();
        const [task] = await legacyMigrationPage.confirm();
        expect(task).toBeDefined();
        await expect(page).toHaveURL(
          (url) => url.searchParams.get('migration_task') === task?.uuid,
        );

        const migration = await waitForMigration(page.request, config, task?.uuid ?? '');
        expect(migration.last).toMatchObject({ state: 'Succeeded' });
        const blocks = await listLibraryBlocks(page.request, config, authoringLibrary.id);
        expect(blocks.results.map((b) => b.display_name).sort()).toEqual(
          [...legacyLibrary.blockNames].sort(),
        );
        const legacy = (await listLegacyLibraries(page.request, config)).find(
          (l) => l.library_key === legacyLibrary.libraryKey,
        );
        expect(legacy).toMatchObject({ is_migrated: true, migrated_to_key: authoringLibrary.id });
      },
    );

    test(
      'bulk-migrates several legacy libraries into one v2 library',
      { annotation: testId('TC-00370') },
      async (
        { page, config, studioAuthorSession, legacyLibrary, authoringLibrary, legacyMigrationPage },
        testInfo,
      ) => {
        void studioAuthorSession;
        const org = config.org ?? DEFAULT_COURSE_ORG;
        const secondName = label('legacy-b', testInfo.testId);
        const secondKey = await createLegacyLibrary(page.request, config, {
          org,
          number: `LB${getRunId()}${testInfo.testId.replace(/[^\w]/g, '').slice(-6)}R${testInfo.retry}`,
          displayName: secondName,
        });
        await addLegacyLibraryBlock(page.request, config, secondKey, 'html', `${secondName} text`);

        await legacyMigrationPage.goto();
        await legacyMigrationPage.selectLegacyLibrary(legacyLibrary.displayName);
        await legacyMigrationPage.selectLegacyLibrary(secondName);
        await legacyMigrationPage.next();
        await legacyMigrationPage.selectDestination(authoringLibrary.id);
        await legacyMigrationPage.next();
        const tasks = await legacyMigrationPage.confirm();
        for (const task of tasks) {
          expect(
            (await waitForMigration(page.request, config, task?.uuid ?? '')).last,
          ).toMatchObject({
            state: 'Succeeded',
          });
        }

        const blocks = await listLibraryBlocks(page.request, config, authoringLibrary.id);
        expect(blocks.results.map((b) => b.display_name).sort()).toEqual(
          [...legacyLibrary.blockNames, `${secondName} text`].sort(),
        );
        const migrated = (await listLegacyLibraries(page.request, config)).filter((l) =>
          [legacyLibrary.libraryKey, secondKey].includes(l.library_key),
        );
        expect(migrated.map((l) => l.is_migrated)).toEqual([true, true]);
        expect(migrated.map((l) => l.migrated_to_key)).toEqual([
          authoringLibrary.id,
          authoringLibrary.id,
        ]);
      },
    );
  },
);
