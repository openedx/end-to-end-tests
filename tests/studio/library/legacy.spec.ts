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
 * Legacy (v1) content libraries: creating one from Studio Home (TC-00250) and
 * migrating one (TC-00369) or several (TC-00370) into a v2 library through the
 * migration stepper. Gated on `content-libraries-v1`. Legacy libraries cannot be
 * deleted through any API, so each test creates as few as it needs.
 *
 * TC-00250 drives the legacy create form ("New library" on Studio Home's Legacy
 * Libraries tab), which only `verawood` ships — `main`'s authoring MFE creates
 * v2 libraries alone — so it is further gated on `content-libraries-v1-create`
 * and does not run on `main`.
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
      'creates a legacy library from Studio Home’s New library form',
      { tag: '@content-libraries-v1-create', annotation: testId('TC-00250') },
      async (
        { page, config, studioAuthorSession, studioHomePage, createLegacyLibraryPage },
        testInfo,
      ) => {
        void studioAuthorSession;
        const library = {
          title: label('legacy-new', testInfo.testId),
          org: config.org ?? DEFAULT_COURSE_ORG,
          number: `LN${getRunId()}${testInfo.testId.replace(/[^\w]/g, '').slice(-6)}R${testInfo.retry}`,
        };

        await studioHomePage.goto();
        await studioHomePage.newLegacyLibrary();
        await checkA11y(page, {
          label: 'legacy-library-create',
          additionalBaseline: LIBRARY_A11Y_BASELINE,
        });
        await createLegacyLibraryPage.fillForm(library);
        const response = await createLegacyLibraryPage.submit();
        expect(response.ok()).toBe(true);
        const { library_key: libraryKey } = (await response.json()) as { library_key?: string };
        expect(libraryKey).toContain(library.number);

        // Studio lists the new legacy library, not yet migrated.
        const listed = (await listLegacyLibraries(page.request, config)).find(
          (l) => l.library_key === libraryKey,
        );
        expect(listed).toMatchObject({ display_name: library.title, is_migrated: false });
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
