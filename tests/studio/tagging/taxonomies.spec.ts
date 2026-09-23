import { readFileSync } from 'node:fs';

import type { APIRequestContext, Download } from '@playwright/test';

import { deleteTaxonomy, fetchTaxonomy, listTaxonomies, listTaxonomyTags } from '../../../src/api';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import {
  IMPORT_EXTRA_TAG,
  TAG,
  taxonomyImportFile,
  taxonomyImportFileCsv,
  taxonomyImportFileExtended,
} from '../../../src/steps';

/**
 * The taxonomy administration pages (BTR TC-00259–00264): the staff-only list
 * and detail pages that import, assign, export, re-import and delete taxonomies.
 * The admin drives the browser under the admin lock ({@link taxonomyAdmin}); the
 * content-tagging API decides the outcome — the imported tags, the org-filtered
 * taxonomy list the author's drawer reads, the export/template download events
 * and the `404` after a delete. The release-varying MFE mount is resolved from
 * the admin's Studio-home redirect, so no course is needed.
 *
 * Each case seeds its own taxonomy through the UI import wizard rather than the
 * shared `workerTaxonomy` fixture: that fixture re-takes the admin lock, which
 * `taxonomyAdmin` already holds for the whole test, so the two together would
 * deadlock. Gated on `taxonomies` and a configured admin (both by the fixture).
 */
test.describe(
  'Taxonomy administration',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@taxonomies'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'imports a new taxonomy from JSON and from CSV',
      { annotation: testId('TC-00259') },
      async ({ config, taxonomyAdmin }) => {
        const created: number[] = [];
        try {
          await taxonomyAdmin.list.goto();
          const jsonId = await taxonomyAdmin.list.importNewTaxonomy(
            taxonomyImportFile(),
            `E2E import JSON ${test.info().testId.slice(-6)}`,
          );
          created.push(jsonId);
          const jsonTags = await listTaxonomyTags(taxonomyAdmin.request, config, jsonId);
          expect(jsonTags.map((t) => t.value)).toContain(TAG.parentOne);
          expect(jsonTags).toHaveLength(8);

          await taxonomyAdmin.list.goto();
          const csvId = await taxonomyAdmin.list.importNewTaxonomy(
            taxonomyImportFileCsv(),
            `E2E import CSV ${test.info().testId.slice(-6)}`,
          );
          created.push(csvId);
          const csvTags = await listTaxonomyTags(taxonomyAdmin.request, config, csvId);
          expect(csvTags.map((t) => t.value)).toContain(TAG.parentTwo);
          expect(csvTags).toHaveLength(8);

          await checkA11y(taxonomyAdmin.page, { label: 'studio-taxonomy-list' });
        } finally {
          await cleanup(taxonomyAdmin.request, config, created);
        }
      },
    );

    test(
      'assigns an org and the taxonomy becomes available to that org',
      { annotation: testId('TC-00260') },
      async ({ config, taxonomyAdmin }) => {
        const org = taxonomyAdmin.org;
        const created: number[] = [];
        try {
          await taxonomyAdmin.list.goto();
          const id = await taxonomyAdmin.list.importNewTaxonomy(
            taxonomyImportFile(),
            `E2E assign org ${test.info().testId.slice(-6)}`,
          );
          created.push(id);
          // Unassigned: the org's drawer (an org-filtered taxonomy list) omits it.
          const before = await listTaxonomies(taxonomyAdmin.request, config, { org });
          expect(before.taxonomies.map((t) => t.id)).not.toContain(id);

          await taxonomyAdmin.detail.goto(id);
          await taxonomyAdmin.detail.assignAllOrgs();

          await expect
            .poll(async () =>
              (await listTaxonomies(taxonomyAdmin.request, config, { org })).taxonomies.map(
                (t) => t.id,
              ),
            )
            .toContain(id);
        } finally {
          await cleanup(taxonomyAdmin.request, config, created);
        }
      },
    );

    test(
      'exports the taxonomy as CSV and JSON',
      { annotation: testId('TC-00261') },
      async ({ config, taxonomyAdmin }) => {
        const created: number[] = [];
        try {
          await taxonomyAdmin.list.goto();
          const id = await taxonomyAdmin.list.importNewTaxonomy(
            taxonomyImportFile(),
            `E2E export ${test.info().testId.slice(-6)}`,
          );
          created.push(id);
          await taxonomyAdmin.detail.goto(id);

          const csv = await taxonomyAdmin.detail.export(id, 'csv');
          expect(csv.suggestedFilename()).toMatch(/\.csv$/);
          expect((await readFirstLine(csv)).length).toBeGreaterThan(0);

          const json = await taxonomyAdmin.detail.export(id, 'json');
          expect(json.suggestedFilename()).toMatch(/\.json$/);
          expect((await readFirstLine(json)).length).toBeGreaterThan(0);
        } finally {
          await cleanup(taxonomyAdmin.request, config, created);
        }
      },
    );

    test(
      're-imports a modified file and the new tag appears',
      { annotation: testId('TC-00262') },
      async ({ config, taxonomyAdmin }) => {
        const created: number[] = [];
        try {
          await taxonomyAdmin.list.goto();
          const id = await taxonomyAdmin.list.importNewTaxonomy(
            taxonomyImportFile(),
            `E2E reimport ${test.info().testId.slice(-6)}`,
          );
          created.push(id);
          expect(await listTaxonomyTags(taxonomyAdmin.request, config, id)).toHaveLength(8);

          await taxonomyAdmin.detail.goto(id);
          await taxonomyAdmin.detail.reimport(id, taxonomyImportFileExtended());

          await expect
            .poll(async () =>
              (await listTaxonomyTags(taxonomyAdmin.request, config, id)).map((t) => t.value),
            )
            .toContain(IMPORT_EXTRA_TAG);
        } finally {
          await cleanup(taxonomyAdmin.request, config, created);
        }
      },
    );

    test(
      'downloads the CSV and JSON import templates',
      { annotation: testId('TC-00263') },
      async ({ taxonomyAdmin }) => {
        await taxonomyAdmin.list.goto();
        const csv = await taxonomyAdmin.list.downloadTemplate('csv');
        expect(csv.suggestedFilename()).toMatch(/\.csv$/);
        const json = await taxonomyAdmin.list.downloadTemplate('json');
        expect(json.suggestedFilename()).toMatch(/\.json$/);
      },
    );

    test(
      'deletes a taxonomy and it is gone from the org and the API',
      { annotation: testId('TC-00264') },
      async ({ config, taxonomyAdmin }) => {
        const org = taxonomyAdmin.org;
        await taxonomyAdmin.list.goto();
        const id = await taxonomyAdmin.list.importNewTaxonomy(
          taxonomyImportFile(),
          `E2E delete ${test.info().testId.slice(-6)}`,
        );
        await taxonomyAdmin.detail.goto(id);
        await taxonomyAdmin.detail.assignAllOrgs();
        await expect
          .poll(async () =>
            (await listTaxonomies(taxonomyAdmin.request, config, { org })).taxonomies.map(
              (t) => t.id,
            ),
          )
          .toContain(id);

        await taxonomyAdmin.detail.delete(id);

        await expect
          .poll(async () =>
            (await listTaxonomies(taxonomyAdmin.request, config, { org })).taxonomies.map(
              (t) => t.id,
            ),
          )
          .not.toContain(id);
        await expect(fetchTaxonomy(taxonomyAdmin.request, config, id)).rejects.toThrow();
      },
    );
  },
);

/** Reads a download's first line of text (the export/template oracle). */
async function readFirstLine(download: Download): Promise<string> {
  const path = await download.path();
  if (path === null) return '';
  return readFileSync(path, 'utf8').split('\n')[0] ?? '';
}

/** Best-effort teardown of taxonomies a test imported through the UI. */
async function cleanup(
  request: APIRequestContext,
  cfg: AppConfig,
  ids: readonly number[],
): Promise<void> {
  for (const id of ids) {
    try {
      await deleteTaxonomy(request, cfg, id);
    } catch {
      // A run-unique name means a leftover never collides with a later run.
    }
  }
}
