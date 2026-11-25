import { fetchTaxonomy, listTaxonomies, listTaxonomyTags, taxonomiesNamed } from '../../../src/api';
import { checkA11y } from '../../../src/a11y';
import { importedTaxonomyId } from '../../../src/pages/studio/taxonomies/import-wizard.block';
import { TIMEOUTS, getRunId } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import {
  TAG,
  deleteTaxonomiesBestEffort,
  deleteTaxonomiesNamed,
  invalidEmptyFile,
  invalidRandomTextFile,
  invalidTruncatedJsonFile,
  invalidWrongHeadersFile,
  taxonomyImportFile,
  taxonomyImportFileCsv,
  unsupportedPngFile,
  unsupportedTxtFile,
} from '../../../src/steps';

/**
 * The "Import Competency Framework" button in the Competency Management page's header
 * and the import wizard it opens (openedx-core #706,
 * https://github.com/openedx/openedx-core/issues/706; frontend-app-authoring #3263). No BTR
 * case maps to these.
 *
 * The admin ({@link competencyTaxonomyAdmin}) seeds the source Competency taxonomy
 * through the content-tagging API and drives the page under the admin lock. The
 * author case acts as the worker author, with its taxonomy seeded by
 * {@link competencyTaxonomySeeder}, and never takes the admin fixture. The API gives
 * each case's precondition (who may create taxonomies, the taxonomy's type and tagging
 * right) so that a missing precondition fails with a message instead of passing
 * vacuously. Cases share one admin login per test, because each test holds the admin
 * lock: the cases that import nothing are one test with a step per case, and the import
 * cases are two tests, each with one seeded source and a step per case. Nothing here
 * intercepts a response: the failures come from the server rejecting a file.
 *
 * Not covered: where a Tags-type import lands. The route guard sends a navigation to
 * `/taxonomy/<id>/competencies` for a non-Competency taxonomy to `/taxonomy/<id>`, so a
 * test could not tell a wrong navigation from the right one; the redirect itself is
 * `competency-route-guard.spec.ts`.
 *
 * Accessibility: the Upload step and the page showing the import-error alert are scanned
 * here. The populate step has no scan here: `taxonomy-type.spec.ts` already scans the same
 * dialog on that step (`studio-taxonomy-import-populate`).
 *
 * The double-click step counts the import requests (recorded from the start of that step)
 * and the taxonomies the server holds. It cannot prove the guard under a slow
 * response, because delaying a response is forbidden (ADR-0003); it catches the removal
 * of the guard on a fast one.
 *
 * Gated on `competencies`, which only `main` declares. Every wizard run that picks a
 * file starts from a fresh page load, and a case that reopens the wizard in one page
 * session picks a differently named file, because choosing the same file again leaves
 * Continue doing nothing (https://github.com/openedx/openedx-core/issues/827).
 */
test.describe(
  'Import Competency Framework',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@taxonomies', '@competencies'] },
  () => {
    // The admin fixture holds the cross-worker admin lock for the whole test, so a test can
    // wait for it; imports use the `taxonomyImport` budget, teardown deletes can be slow
    // (TAG-007 in docs/findings.md), and the merged tests walk up to eight wizard runs each.
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test('lets an admin open and fill the import wizard, and creates nothing until Import', async ({
      config,
      competencyTaxonomyAdmin,
    }) => {
      const { competency, page, request, seed } = competencyTaxonomyAdmin;
      const { wizard } = competency;
      const name = `E2E ${getRunId()} framework admin ${test.info().testId.slice(-6)}`;
      const imports = wizard.recordImportRequests();
      try {
        const source = await seed({ type: 'competency', label: 'framework-admin-source' });
        const sourcePage = new RegExp(`/taxonomy/${source.id}/competencies$`);
        expect((await listTaxonomies(request, config)).canAddTaxonomy).toBe(true);

        // Every step starts from a fresh load, because a reopened wizard that is given the
        // same file again leaves Continue doing nothing
        // (https://github.com/openedx/openedx-core/issues/827).
        await test.step('the header button opens the wizard on the upload step', async () => {
          await competency.goto(source.id);
          await expect(competency.importFrameworkButton).toHaveCount(1);

          await competency.openImportWizard();
          await expect(wizard.uploadStep).toBeVisible();
          await expect(wizard.populateStep).toHaveCount(0);
          await expect(wizard.planStep).toHaveCount(0);
          await expect(wizard.confirmStep).toHaveCount(0);
          await expect(wizard.dropzone).toBeVisible();
          await expect(wizard.fileInfo).toHaveCount(0);
          // `STUDIO-007`: the dropzone's hidden file input has no label. Baselined on this scan
          // only.
          await checkA11y(page, {
            label: 'studio-competency-import-upload',
            additionalBaseline: ['label'],
          });
          // The button is a StatefulButton: a disabled one keeps `aria-disabled` and has
          // no native `disabled`.
          await expect(wizard.primaryButton).toHaveAttribute('aria-disabled', 'true');
        });

        await test.step('the populate step preselects Competency and lets the type change', async () => {
          await competency.goto(source.id);
          await competency.openImportWizard();
          await wizard.uploadToPopulate(taxonomyImportFileCsv());

          await expect(wizard.populateStep).toBeVisible();
          await expect(wizard.typeSelect).toHaveValue('competency');
          await expect(wizard.typeSelect).toBeEnabled();
          // Option `value` attributes are the untranslated API values; their text is copy.
          const values = await wizard.typeOptions.evaluateAll((options) =>
            options.map((o) => (o as HTMLOptionElement).value),
          );
          expect(values).toEqual(['tags', 'competency']);

          await wizard.chooseType('tags');
          await expect(wizard.typeSelect).toHaveValue('tags');
          await wizard.chooseType('competency');
          await expect(wizard.typeSelect).toHaveValue('competency');
        });

        await test.step('Cancel on the upload step closes the wizard and creates nothing', async () => {
          await competency.goto(source.id);
          await competency.openImportWizard();
          await wizard.cancel();
          await expect(wizard.dialog).toHaveCount(0);
          await expect(page).toHaveURL(sourcePage);
        });

        await test.step('Cancel on the populate step closes the wizard and creates nothing', async () => {
          await competency.goto(source.id);
          await competency.openImportWizard();
          await wizard.uploadToPopulate(taxonomyImportFileCsv());
          await wizard.fillPopulate(name);
          await wizard.cancel();
          await expect(wizard.dialog).toHaveCount(0);
          await expect(page).toHaveURL(sourcePage);
        });

        await test.step('the close button closes the wizard and creates nothing', async () => {
          await competency.goto(source.id);
          await competency.openImportWizard();
          await wizard.close();
          await expect(wizard.dialog).toHaveCount(0);
          await expect(page).toHaveURL(sourcePage);
        });

        await test.step('Import stays disabled until both name and description are filled', async () => {
          await competency.goto(source.id);
          await competency.openImportWizard();
          await wizard.uploadToPopulate(taxonomyImportFileCsv());

          // An enabled StatefulButton renders `aria-disabled="false"`.
          await expect(wizard.importButton).toHaveAttribute('aria-disabled', 'true');

          await wizard.nameInput.fill(name);
          await expect(wizard.importButton).toHaveAttribute('aria-disabled', 'true');
          await wizard.clickDisabledImport();

          // Filling the description enables Import. Waiting for that change gives the
          // swallowed click time to have sent a request, so the counts below are not read
          // before one could appear.
          await wizard.descriptionInput.fill('E2E suite taxonomy');
          await expect(wizard.importButton).toHaveAttribute('aria-disabled', 'false');
          await expect(wizard.dialog).toBeVisible();
          expect(imports.requests).toHaveLength(0);

          await wizard.nameInput.clear();
          await expect(wizard.importButton).toHaveAttribute('aria-disabled', 'true');

          await wizard.nameInput.fill(name);
          await expect(wizard.importButton).toHaveAttribute('aria-disabled', 'false');
        });

        const unsupported = [
          { label: 'a .txt file', rejected: unsupportedTxtFile(), valid: taxonomyImportFileCsv() },
          { label: 'a .png file', rejected: unsupportedPngFile(), valid: taxonomyImportFile() },
        ];
        for (const { label, rejected, valid } of unsupported) {
          await test.step(`the upload step rejects ${label} and still accepts a supported file`, async () => {
            await competency.goto(source.id);
            await competency.openImportWizard();
            await wizard.chooseFile(rejected);

            // The rejection is checked asynchronously, so its class comes first: an
            // absence asserted before it would pass whether or not the file was handled.
            await expect(wizard.rejectedDropzone).toBeVisible();
            await expect(wizard.fileInfo).toHaveCount(0);
            await expect(wizard.populateStep).toHaveCount(0);
            await expect(wizard.primaryButton).toHaveAttribute('aria-disabled', 'true');

            // A rejection does not block the wizard: a supported file is still accepted.
            await wizard.chooseFile(valid);
            await expect(wizard.fileInfo).toBeVisible();
            await expect(wizard.primaryButton).toHaveAttribute('aria-disabled', 'false');
          });
        }

        // No step submitted the form.
        expect(imports.requests).toHaveLength(0);
        expect(await taxonomiesNamed(request, config, name)).toHaveLength(0);
      } finally {
        imports.stop();
        await deleteTaxonomiesNamed(request, config, name);
      }
    });

    test('shows an author who cannot create taxonomies no header button', async ({
      config,
      page,
      competencyTaxonomySeeder,
      authorTaxonomyPages,
      authoredCourse,
    }) => {
      // A non-staff user sees an org-assigned taxonomy only with a role in a course of
      // that org; the worker author's course in the suite org gives it.
      void authoredCourse;
      const { competency } = authorTaxonomyPages;
      const seeded = await competencyTaxonomySeeder({
        taxonomyType: 'competency',
        access: 'suite-org',
      });
      const taxonomy = await fetchTaxonomy(page.request, config, seeded.id);
      expect(taxonomy).toMatchObject({ taxonomyType: 'competency', canTagObject: true });
      expect((await listTaxonomies(page.request, config)).canAddTaxonomy).toBe(false);

      // The button shows only once the page has the taxonomy list, so the page's own
      // list request is awaited before the absence is asserted.
      await competency.openAwaitingTaxonomyList(taxonomy.id);

      // The page renders nothing for an author from the taxonomy-list response (the title
      // and the tree come from other requests), so this check runs after that response
      // has fully loaded and the title and tree have drawn. It cannot wait on a positive signal
      // from the same render.
      await expect(competency.rootRow).toBeVisible();
      await expect(competency.title).toContainText(taxonomy.name);
      await expect(competency.headerActions).toHaveCount(0);
    });

    test('imports from the header button: lands on the new taxonomy and sends one request on a double-click', async ({
      config,
      competencyTaxonomyAdmin,
    }) => {
      const { competency, page, request, seed } = competencyTaxonomyAdmin;
      const { wizard } = competency;
      const suffix = test.info().testId.slice(-6);
      const importName = `E2E ${getRunId()} framework import ${suffix}`;
      const doubleName = `E2E ${getRunId()} framework double ${suffix}`;
      const created: number[] = [];
      try {
        const source = await seed({ type: 'competency', label: 'framework-import-source' });
        const sourceTagCount = (await listTaxonomyTags(request, config, source.id)).length;

        await test.step('imports a CSV and lands on the Competency Management page of the new taxonomy', async () => {
          await competency.goto(source.id);
          // The type stays as the page preselected it.
          const response = await competency.importFramework(taxonomyImportFileCsv(), importName);
          const id = await importedTaxonomyId(response);
          created.push(id);

          const newPage = new RegExp(`/taxonomy/${id}/competencies$`);
          await expect(wizard.dialog).toHaveCount(0);
          await expect(page).toHaveURL(newPage);
          // The Competency Management page draws the tree root; the redirect target of
          // the route guard (frontend-app-authoring #3264) does not.
          await expect(competency.rootRow).toBeVisible();
          await expect(competency.title).toContainText(importName);

          expect((await fetchTaxonomy(request, config, id)).taxonomyType).toBe('competency');
          const tags = await listTaxonomyTags(request, config, id);
          expect(tags.map((t) => t.value).sort()).toEqual(Object.values(TAG).sort());
          expect(await listTaxonomyTags(request, config, source.id)).toHaveLength(sourceTagCount);
        });

        await test.step('sends one import request when Import is double-clicked', async () => {
          // Recording starts here, so the count covers this step's requests only.
          const imports = wizard.recordImportRequests();
          try {
            await competency.goto(source.id);
            await competency.openImportWizard();
            await wizard.uploadToPopulate(taxonomyImportFile());
            await wizard.fillPopulate(doubleName);
            const response = await wizard.doubleClickImport();
            const id = await importedTaxonomyId(response);
            created.push(id);

            await expect(page).toHaveURL(new RegExp(`/taxonomy/${id}/competencies$`));
            // A second request would have left by now: the first one has been answered and
            // the page it led to has drawn.
            await expect(competency.rootRow).toBeVisible();
            expect(imports.requests).toHaveLength(1);
            expect(await taxonomiesNamed(request, config, doubleName)).toHaveLength(1);
          } finally {
            imports.stop();
          }
        });
      } finally {
        await deleteTaxonomiesBestEffort(request, config, created);
        await deleteTaxonomiesNamed(request, config, importName);
        await deleteTaxonomiesNamed(request, config, doubleName);
      }
    });

    test('shows an error and starts clean after the server rejects the file', async ({
      config,
      competencyTaxonomyAdmin,
    }) => {
      const { competency, page, request, seed } = competencyTaxonomyAdmin;
      const { wizard } = competency;
      const suffix = test.info().testId.slice(-6);
      const variants = [
        { label: 'random-text', file: invalidRandomTextFile() },
        { label: 'empty', file: invalidEmptyFile() },
        { label: 'truncated-json', file: invalidTruncatedJsonFile() },
        { label: 'wrong-headers', file: invalidWrongHeadersFile() },
      ].map((variant) => ({
        ...variant,
        name: `E2E ${getRunId()} framework invalid ${variant.label} ${suffix}`,
      }));
      const alertName = `E2E ${getRunId()} framework alert ${suffix}`;
      const nameA = `E2E ${getRunId()} framework reopen-a ${suffix}`;
      const nameB = `E2E ${getRunId()} framework reopen-b ${suffix}`;
      const created: number[] = [];
      try {
        const source = await seed({ type: 'competency', label: 'framework-invalid-source' });
        const sourcePage = new RegExp(`/taxonomy/${source.id}/competencies$`);

        for (const { label, file, name } of variants) {
          await test.step(`shows an error and creates nothing when the server rejects ${label}`, async () => {
            // A fresh load per variant (https://github.com/openedx/openedx-core/issues/827).
            await competency.goto(source.id);
            const response = await competency.importFramework(file, name);

            expect(response.status()).toBe(400);
            await expect(wizard.dialog).toHaveCount(0);
            await expect(competency.errorAlert).toHaveCount(1);
            // The full-page connection error replaces the tree, so the root row tells
            // the import-error alert from it.
            await expect(competency.rootRow).toBeVisible();
            await expect(page).toHaveURL(sourcePage);
            await expect(competency.title).toContainText(source.name);
            // The empty file is rejected in serializer validation, before a taxonomy exists;
            // for the other files the server creates one and deletes it when the import fails.
            expect(await taxonomiesNamed(request, config, name)).toHaveLength(0);
          });
        }

        await test.step('scans the import-error alert and dismisses it', async () => {
          await competency.goto(source.id);
          const response = await competency.importFramework(invalidRandomTextFile(), alertName);
          expect(response.status()).toBe(400);
          await expect(competency.errorAlert).toHaveCount(1);
          await expect(competency.rootRow).toBeVisible();
          // TAG-004: the page's breadcrumb, baselined on this scan like the route-guard one.
          await checkA11y(page, {
            label: 'studio-competency-import-error',
            additionalBaseline: ['list'],
          });

          await competency.dismissImportError();
          await expect(competency.errorAlert).toHaveCount(0);
        });

        await test.step('reopens the wizard from a clean state after a failed import', async () => {
          // An earlier step in this test used the same wrong-headers CSV. A fresh load clears
          // the wizard's file cache, so it is accepted again
          // (https://github.com/openedx/openedx-core/issues/827).
          await competency.goto(source.id);
          const failed = await competency.importFramework(invalidWrongHeadersFile(), nameA, {
            type: 'tags',
          });
          expect(failed.status()).toBe(400);
          await expect(competency.errorAlert).toHaveCount(1);
          // The full-page connection error replaces the tree, so the root row tells the
          // import-error alert from it.
          await expect(competency.rootRow).toBeVisible();

          // No reload: the wizard is reopened in the same page session. The second file
          // differs from the first (JSON, not CSV), because picking the same file again
          // after reopening leaves Continue doing nothing
          // (https://github.com/openedx/openedx-core/issues/827).
          await competency.openImportWizard();
          await expect(wizard.uploadStep).toBeVisible();
          await expect(wizard.fileInfo).toHaveCount(0);
          await expect(wizard.dropzone).toBeVisible();
          await wizard.uploadToPopulate(taxonomyImportFile());

          await expect(wizard.nameInput).toHaveValue('');
          await expect(wizard.descriptionInput).toHaveValue('');
          await expect(wizard.typeSelect).toHaveValue('competency');
          await expect(wizard.importButton).toHaveAttribute('aria-disabled', 'true');

          await wizard.fillPopulate(nameB);
          const idB = await importedTaxonomyId(await wizard.submitImport());
          created.push(idB);

          await expect(page).toHaveURL(new RegExp(`/taxonomy/${idB}/competencies$`));
          await expect(competency.rootRow).toBeVisible();

          expect(await taxonomiesNamed(request, config, nameA)).toHaveLength(0);
          expect((await fetchTaxonomy(request, config, idB)).taxonomyType).toBe('competency');
        });
      } finally {
        await deleteTaxonomiesBestEffort(request, config, created);
        for (const { name } of variants) await deleteTaxonomiesNamed(request, config, name);
        await deleteTaxonomiesNamed(request, config, alertName);
        await deleteTaxonomiesNamed(request, config, nameA);
        await deleteTaxonomiesNamed(request, config, nameB);
      }
    });
  },
);
