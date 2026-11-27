import type { APIRequestContext } from '@playwright/test';

import { addTag, importTags, previewTagsImport, type TagsImportOutcome } from '../../../src/api';
import { checkA11y } from '../../../src/a11y';
import { TAXONOMY_SELECTORS, TIMEOUTS, type AppConfig } from '../../../src/config';
import { expect, test, type TaxonomyAdmin } from '../../../src/fixtures';
import {
  COMPETENCY_SETS,
  competencyImportFile,
  deleteTaxonomiesBestEffort,
  downloadText,
  parseExportedIds,
  readTagIds,
  renameCompetencyIds,
  seedCompetencyTaxonomy,
  type ExportedTag,
  type TagIds,
} from '../../../src/steps';

/**
 * Re-importing a Competency taxonomy with `previous_id` renames a tag's Competency ID in
 * place (openedx-core #673, https://github.com/openedx/openedx-core/issues/673, PR #804),
 * and every tag has an external ID, generated when none is given (#758,
 * https://github.com/openedx/openedx-core/issues/758, PR #825). No BTR case maps to these.
 *
 * "Renamed in place" is the tag's database id (`_id`) staying the same: each case reads
 * every tag's id before the import and compares after it. The cases that exercise the
 * wizard (the plan it draws, the export it feeds) use {@link competencyTaxonomyAdmin}
 * and seed on its own session; the cases that only vary the file send it straight to the
 * import endpoints under {@link competencyAdminApi}, because the wizard sends the same
 * file and adds nothing the file's variants could change. The admin sees every taxonomy,
 * so none is assigned to an org. Every case seeds its own taxonomy and deletes it in
 * `finally`: an import changes the taxonomy, so a second case could not reuse it.
 *
 * Every wizard run starts from a fresh page load, because choosing the same file again
 * in one page session leaves Continue doing nothing
 * (https://github.com/openedx/openedx-core/issues/827, TAG-005 in docs/findings.md).
 *
 * Accessibility: the wizard's Plan step is scanned here, inside the dialog only: no other
 * spec opens a re-import Plan step, and the detail page's breadcrumb debt (TAG-004) sits
 * behind the dialog and out of the scan.
 *
 * Gated on `competencies`, which only `main` declares.
 */
test.describe(
  'Re-import with previous_id',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@taxonomies', '@competencies'] },
  () => {
    // The admin fixtures hold the cross-worker admin lock for the whole test, so a test can
    // wait for it; the UI cases walk the wizard and delete in teardown, which can be slow
    // (TAG-007 in docs/findings.md).
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    const name = (variant: string): string =>
      `E2E competency-id ${variant} ${test.info().testId.slice(-6)}`;

    /** The database id of the tag valued `value`; fails when the tag or its id is missing. */
    function internalIdOf(tags: Record<string, TagIds>, value: string): number {
      const id = tags[value]?.internalId;
      if (typeof id !== 'number') {
        throw new Error(`Tag "${value}" has no database id: ${JSON.stringify(tags[value])}`);
      }
      return id;
    }

    /** The plan, then the import, of `file` into a taxonomy, straight to the endpoints. */
    async function reimportThroughApi(
      request: APIRequestContext,
      config: AppConfig,
      taxonomyId: number,
      file: ReturnType<typeof competencyImportFile>,
    ): Promise<{ plan: TagsImportOutcome; result: TagsImportOutcome }> {
      const plan = await previewTagsImport(request, config, taxonomyId, file);
      const result = await importTags(request, config, taxonomyId, file);
      return { plan, result };
    }

    /**
     * Renames Competency A to COMP-B through the re-import wizard in `format`, then exports
     * the taxonomy in the same format. The Plan step's single change and the optional
     * accessibility scan (`scan`) happen on that step, where they can be seen; the outcome
     * comes back for the test to assert.
     */
    async function renameThroughWizard(
      admin: TaxonomyAdmin,
      config: AppConfig,
      format: 'csv' | 'json',
      scan: boolean,
    ): Promise<{
      planStatus: number;
      confirmedOk: boolean;
      before: Record<string, TagIds>;
      after: Record<string, TagIds>;
      exported: ExportedTag[];
    }> {
      const { detail, request, page } = admin;
      const { wizard } = detail;
      const created: number[] = [];
      try {
        const { taxonomy, tags: before } = await seedCompetencyTaxonomy(request, config, {
          name: name(`rename-${format}`),
          rows: COMPETENCY_SETS.A,
        });
        created.push(taxonomy.id);

        await detail.goto(taxonomy.id);
        await detail.openReimport();
        const plan = await wizard.chooseFileForPlan(
          taxonomy.id,
          competencyImportFile(
            renameCompetencyIds(COMPETENCY_SETS.A, { 'COMP-A': { id: 'COMP-B' } }),
            {
              format,
            },
          ),
        );
        await wizard.continueToPlan();
        // One change; the three untouched tags are "no changes" lines the wizard drops.
        await expect(wizard.planActions).toHaveCount(1);
        if (scan) {
          await checkA11y(page, {
            label: 'studio-taxonomy-reimport-plan',
            include: TAXONOMY_SELECTORS.dialog,
          });
        }
        await wizard.continueToConfirm();
        const confirmed = await wizard.confirmReimport(taxonomy.id);

        const after = await readTagIds(request, config, taxonomy.id);
        await expect(wizard.dialog).toHaveCount(0);
        await detail.goto(taxonomy.id);
        const exported = parseExportedIds(
          await downloadText(await detail.export(taxonomy.id, format)),
          format,
        );
        return {
          planStatus: plan.status(),
          confirmedOk: confirmed.ok(),
          before,
          after,
          exported,
        };
      } finally {
        await deleteTaxonomiesBestEffort(request, config, created);
      }
    }

    // CI-01 scans the Plan step; CI-02 does the same run in JSON without a second scan.
    for (const { format, caseId, scan } of [
      { format: 'csv', caseId: 'CI-01', scan: true },
      { format: 'json', caseId: 'CI-02', scan: false },
    ] as const) {
      test(`renames a Competency ID through the wizard and exports it as ${format.toUpperCase()} (${caseId})`, async ({
        config,
        competencyTaxonomyAdmin,
      }) => {
        const run = await renameThroughWizard(competencyTaxonomyAdmin, config, format, scan);
        const { before, after, exported } = run;
        expect(run.planStatus, 'plan response').toBe(200);
        expect(run.confirmedOk, 'confirm response ok').toBe(true);
        expect(Object.keys(after), 'tags after the import').toHaveLength(4);
        expect(after['Competency A']?.externalId, 'renamed Competency ID').toBe('COMP-B');
        expect(internalIdOf(after, 'Competency A'), 'renamed in place').toBe(
          internalIdOf(before, 'Competency A'),
        );
        expect(Object.values(after).map((t) => t.externalId)).not.toContain('COMP-A');
        expect(exported.find((t) => t.value === 'Competency A')).toMatchObject({
          id: 'COMP-B',
          parentId: null,
        });
        expect(exported.map((t) => t.id)).not.toContain('COMP-A');
        // The backend writes `parent_id` only on tags that have a parent, so a root entry has
        // just `id` and `value`. A key outside these three, `previous_id` included, fails.
        for (const tag of exported) {
          expect(tag.keys.filter((key) => !['id', 'value', 'parent_id'].includes(key))).toEqual([]);
        }
      });
    }

    test('leaves a tag alone when previous_id equals its id (CI-04)', async ({
      config,
      competencyAdminApi,
    }) => {
      const created: number[] = [];
      try {
        const { taxonomy, tags: before } = await seedCompetencyTaxonomy(
          competencyAdminApi,
          config,
          { name: name('idempotent'), rows: COMPETENCY_SETS.B },
        );
        created.push(taxonomy.id);

        const { plan, result } = await reimportThroughApi(
          competencyAdminApi,
          config,
          taxonomy.id,
          competencyImportFile(renameCompetencyIds(COMPETENCY_SETS.B, { 'COMP-B': {} }), {
            format: 'json',
          }),
        );
        expect(plan.ok).toBe(true);
        expect(result.ok).toBe(true);
        expect(await readTagIds(competencyAdminApi, config, taxonomy.id)).toEqual(before);
      } finally {
        await deleteTaxonomiesBestEffort(competencyAdminApi, config, created);
      }
    });

    test('creates a tag for a new row without previous_id (CI-05)', async ({
      config,
      competencyAdminApi,
    }) => {
      const created: number[] = [];
      try {
        const { taxonomy, tags: before } = await seedCompetencyTaxonomy(
          competencyAdminApi,
          config,
          { name: name('new-row'), rows: COMPETENCY_SETS.A },
        );
        created.push(taxonomy.id);

        const { plan, result } = await reimportThroughApi(
          competencyAdminApi,
          config,
          taxonomy.id,
          competencyImportFile([...COMPETENCY_SETS.A, { id: 'COMP-Z', value: 'Competency Z' }], {
            format: 'csv',
          }),
        );
        expect(plan.ok).toBe(true);
        expect(result.ok).toBe(true);

        const after = await readTagIds(competencyAdminApi, config, taxonomy.id);
        expect(Object.keys(after)).toHaveLength(5);
        expect(after['Competency Z']?.externalId).toBe('COMP-Z');
        expect(Object.values(before).map((t) => t.internalId)).not.toContain(
          internalIdOf(after, 'Competency Z'),
        );
        for (const [value, ids] of Object.entries(before)) {
          expect(after[value]).toEqual(ids);
        }
      } finally {
        await deleteTaxonomiesBestEffort(competencyAdminApi, config, created);
      }
    });

    test('rotates three Competency IDs whatever the row order (CI-07)', async ({
      config,
      competencyAdminApi,
    }) => {
      const created: number[] = [];
      const rotation = renameCompetencyIds(COMPETENCY_SETS.E, {
        'COMP-A': { id: 'COMP-B' },
        'COMP-B': { id: 'COMP-C' },
        'COMP-C': { id: 'COMP-A' },
      });
      try {
        for (const [order, rows] of [
          ['xyz', rotation],
          ['zyx', [...rotation].reverse()],
        ] as const) {
          const { taxonomy, tags: before } = await seedCompetencyTaxonomy(
            competencyAdminApi,
            config,
            { name: name(`rotation-${order}`), rows: COMPETENCY_SETS.E },
          );
          created.push(taxonomy.id);

          const { plan, result } = await reimportThroughApi(
            competencyAdminApi,
            config,
            taxonomy.id,
            competencyImportFile(rows, { format: 'csv' }),
          );
          expect(plan.ok, `plan, order ${order}`).toBe(true);
          expect(result.ok, `import, order ${order}`).toBe(true);

          const after = await readTagIds(competencyAdminApi, config, taxonomy.id);
          expect(Object.keys(after), `tags, order ${order}`).toHaveLength(3);
          expect(
            [after['Competency X'], after['Competency Y'], after['Competency Z']].map(
              (t) => t?.externalId,
            ),
            `Competency IDs, order ${order}`,
          ).toEqual(['COMP-B', 'COMP-C', 'COMP-A']);
          for (const value of ['Competency X', 'Competency Y', 'Competency Z']) {
            expect(internalIdOf(after, value), `${value}, order ${order}`).toBe(
              internalIdOf(before, value),
            );
          }
        }
      } finally {
        await deleteTaxonomiesBestEffort(competencyAdminApi, config, created);
      }
    });

    test('lets a child follow its renamed parent (CI-09)', async ({
      config,
      competencyAdminApi,
    }) => {
      const created: number[] = [];
      try {
        const { taxonomy, tags: before } = await seedCompetencyTaxonomy(
          competencyAdminApi,
          config,
          { name: name('parent-renamed'), rows: COMPETENCY_SETS.F },
        );
        created.push(taxonomy.id);

        const { plan, result } = await reimportThroughApi(
          competencyAdminApi,
          config,
          taxonomy.id,
          competencyImportFile(
            renameCompetencyIds(COMPETENCY_SETS.F, { 'COMP-P': { id: 'COMP-P2' } }),
            { format: 'csv' },
          ),
        );
        expect(plan.ok).toBe(true);
        expect(result.ok).toBe(true);

        const after = await readTagIds(competencyAdminApi, config, taxonomy.id);
        expect(after['Parent P']?.externalId).toBe('COMP-P2');
        expect(internalIdOf(after, 'Parent P')).toBe(internalIdOf(before, 'Parent P'));
        expect(after['Child C']?.externalId).toBe('COMP-C1');
        expect(after['Child C']?.parentValue).toBe('Parent P');
        expect(internalIdOf(after, 'Child C')).toBe(internalIdOf(before, 'Child C'));
      } finally {
        await deleteTaxonomiesBestEffort(competencyAdminApi, config, created);
      }
    });

    test('reports nothing to change when an export is imported back (CI-14)', async ({
      config,
      competencyTaxonomyAdmin,
    }) => {
      const { detail, request } = competencyTaxonomyAdmin;
      const { wizard } = detail;
      const created: number[] = [];
      try {
        const { taxonomy } = await seedCompetencyTaxonomy(request, config, {
          name: name('export-roundtrip'),
          rows: COMPETENCY_SETS.A,
        });
        created.push(taxonomy.id);
        // Two tags without an ID: the backend generates theirs.
        await addTag(request, config, taxonomy.id, { tag: 'Generated Root' });
        await addTag(request, config, taxonomy.id, {
          tag: 'Generated Child',
          parentTagValue: 'Generated Root',
        });
        const before = await readTagIds(request, config, taxonomy.id);
        expect(Object.keys(before)).toHaveLength(6);

        for (const format of ['csv', 'json'] as const) {
          await detail.goto(taxonomy.id);
          const text = await downloadText(await detail.export(taxonomy.id, format));
          const exported = parseExportedIds(text, format);
          expect(exported, `${format} export`).toHaveLength(6);
          for (const tag of exported) {
            expect(tag.id, `${format} export, ${tag.value}`).not.toBe('');
            expect(tag.keys, `${format} export, ${tag.value}`).not.toContain('previous_id');
          }

          await detail.openReimport();
          const plan = await wizard.chooseFileForPlan(taxonomy.id, {
            name: `e2e-exported.${format}`,
            mimeType: format === 'csv' ? 'text/csv' : 'application/json',
            buffer: Buffer.from(text),
          });
          expect(plan.status()).toBe(200);
          await plan.finished();
          await wizard.continueToPlan();
          await expect(wizard.planActions).toHaveCount(0);
          await expect(wizard.continueButton).toBeDisabled();
          await wizard.cancel();

          expect(await readTagIds(request, config, taxonomy.id), `${format} round trip`).toEqual(
            before,
          );
        }
      } finally {
        await deleteTaxonomiesBestEffort(request, config, created);
      }
    });
  },
);
