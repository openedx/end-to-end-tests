import type { APIRequestContext } from '@playwright/test';

import {
  DEFAULT_COURSE_ORG,
  addTag,
  buildSection,
  fetchObjectTagCounts,
  fetchObjectTags,
  importTags,
  previewTagsImport,
  setObjectTags,
  tagCountFor,
  type TagsImportOutcome,
} from '../../../src/api';
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
 * file and adds nothing the file's variants could change. Every case seeds its own taxonomy
 * and deletes it in `finally`: an import changes the taxonomy, so a second case could not
 * reuse it.
 *
 * The cases that check a tag stays on a unit (a rename, a swap and a freed-ID rename) take
 * the worker's `contentCourse` and `studioAuthorSession` before the admin fixture, so the
 * author is ready before the admin lock is taken. The author builds its own section with
 * one unit and tags the unit; the admin seeds the taxonomy and assigns it to the suite org
 * only, which is what lets the author tag with it. The oracle is the tag's database id,
 * plus the unit's applied tags and their count read as the author. The other cases assign
 * no org, because the admin sees every taxonomy.
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

    const suiteOrg = (config: AppConfig): string => config.org ?? DEFAULT_COURSE_ORG;

    /**
     * A section with one unit that the author builds in the worker's course; returns the
     * unit's key.
     */
    async function authorUnit(
      author: APIRequestContext,
      config: AppConfig,
      courseKey: string,
    ): Promise<string> {
      const section = await buildSection(author, config, courseKey, name('section'));
      const unit = section.units[0]?.usageKey;
      if (unit === undefined) throw new Error('The built section has no unit.');
      return unit;
    }

    /** The values the unit carries from taxonomy `taxonomyId`, sorted, read by `reader`. */
    async function appliedValues(
      reader: APIRequestContext,
      config: AppConfig,
      unit: string,
      taxonomyId: number,
    ): Promise<string[]> {
      const applied = await fetchObjectTags(reader, config, unit);
      return (applied.find((t) => t.taxonomyId === taxonomyId)?.tags ?? [])
        .map((t) => t.value)
        .sort();
    }

    /**
     * Re-imports `file` into a taxonomy through the wizard from a fresh page load: opens the
     * wizard, chooses the file, reaches the Plan step (where `atPlan` runs, when given),
     * continues and confirms. The plan and confirm outcomes come back for the test to assert.
     */
    async function reimportThroughWizard(
      detail: TaxonomyAdmin['detail'],
      taxonomyId: number,
      file: ReturnType<typeof competencyImportFile>,
      atPlan?: () => Promise<void>,
    ): Promise<{ planStatus: number; confirmedOk: boolean }> {
      const { wizard } = detail;
      await detail.goto(taxonomyId);
      await detail.openReimport();
      const plan = await wizard.chooseFileForPlan(taxonomyId, file);
      await wizard.continueToPlan();
      await atPlan?.();
      await wizard.continueToConfirm();
      const confirmed = await wizard.confirmReimport(taxonomyId);
      return { planStatus: plan.status(), confirmedOk: confirmed.ok() };
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
     * Seeds a taxonomy of `rows`, re-imports `file` into it through the endpoints and reads
     * every tag's ids before and after. The plan and the import must both be accepted.
     */
    async function seedAndReimport(
      admin: APIRequestContext,
      config: AppConfig,
      created: number[],
      variant: string,
      rows: Parameters<typeof seedCompetencyTaxonomy>[2]['rows'],
      file: ReturnType<typeof competencyImportFile>,
    ): Promise<{ before: Record<string, TagIds>; after: Record<string, TagIds> }> {
      const { taxonomy, tags: before } = await seedCompetencyTaxonomy(admin, config, {
        name: name(variant),
        rows,
      });
      created.push(taxonomy.id);
      const { plan, result } = await reimportThroughApi(admin, config, taxonomy.id, file);
      expect(plan.ok, 'plan').toBe(true);
      expect(result.ok, 'import').toBe(true);
      return { before, after: await readTagIds(admin, config, taxonomy.id) };
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

        const run = await reimportThroughWizard(
          detail,
          taxonomy.id,
          competencyImportFile(
            renameCompetencyIds(COMPETENCY_SETS.A, { 'COMP-A': { id: 'COMP-B' } }),
            { format },
          ),
          async () => {
            // One change; the three untouched tags are "no changes" lines the wizard drops.
            await expect(wizard.planActions).toHaveCount(1);
            if (scan) {
              await checkA11y(page, {
                label: 'studio-taxonomy-reimport-plan',
                include: TAXONOMY_SELECTORS.dialog,
              });
            }
          },
        );

        const after = await readTagIds(request, config, taxonomy.id);
        await expect(wizard.dialog).toHaveCount(0);
        await detail.goto(taxonomy.id);
        const exported = parseExportedIds(
          await downloadText(await detail.export(taxonomy.id, format)),
          format,
        );
        return {
          planStatus: run.planStatus,
          confirmedOk: run.confirmedOk,
          before,
          after,
          exported,
        };
      } finally {
        await deleteTaxonomiesBestEffort(request, config, created);
      }
    }

    // The CSV run scans the Plan step; the JSON run does the same without a second scan.
    for (const { format, scan } of [
      { format: 'csv', scan: true },
      { format: 'json', scan: false },
    ] as const) {
      test(`renames a Competency ID through the wizard and exports it as ${format.toUpperCase()}`, async ({
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

    test('keeps a unit tagged with a renamed Competency', async ({
      contentCourse,
      studioAuthorSession,
      competencyTaxonomyAdmin,
      page,
      config,
    }) => {
      void studioAuthorSession;
      const { detail, request } = competencyTaxonomyAdmin;
      const created: number[] = [];
      try {
        const unit = await authorUnit(page.request, config, contentCourse.courseKey);
        const { taxonomy, tags: before } = await seedCompetencyTaxonomy(request, config, {
          name: name('tagged-rename'),
          rows: COMPETENCY_SETS.A,
          org: suiteOrg(config),
        });
        created.push(taxonomy.id);
        await setObjectTags(page.request, config, unit, taxonomy.id, ['Competency A']);

        const run = await reimportThroughWizard(
          detail,
          taxonomy.id,
          competencyImportFile(
            renameCompetencyIds(COMPETENCY_SETS.A, { 'COMP-A': { id: 'COMP-B' } }),
            { format: 'csv' },
          ),
        );
        expect(run.confirmedOk).toBe(true);

        const after = await readTagIds(request, config, taxonomy.id);
        expect(after['Competency A']?.externalId).toBe('COMP-B');
        expect(internalIdOf(after, 'Competency A')).toBe(internalIdOf(before, 'Competency A'));
        expect(await appliedValues(page.request, config, unit, taxonomy.id)).toEqual([
          'Competency A',
        ]);
        expect(tagCountFor(await fetchObjectTagCounts(page.request, config, [unit]), unit)).toBe(1);
      } finally {
        await deleteTaxonomiesBestEffort(request, config, created);
      }
    });

    test('keeps a unit tagged after two Competency IDs are exchanged in the wizard', async ({
      contentCourse,
      studioAuthorSession,
      competencyTaxonomyAdmin,
      page,
      config,
    }) => {
      void studioAuthorSession;
      const { detail, request } = competencyTaxonomyAdmin;
      const created: number[] = [];
      try {
        const unit = await authorUnit(page.request, config, contentCourse.courseKey);
        const { taxonomy, tags: before } = await seedCompetencyTaxonomy(request, config, {
          name: name('tagged-swap'),
          rows: COMPETENCY_SETS.B,
          org: suiteOrg(config),
        });
        created.push(taxonomy.id);
        await setObjectTags(page.request, config, unit, taxonomy.id, [
          'Competency X',
          'Competency Y',
        ]);

        const run = await reimportThroughWizard(
          detail,
          taxonomy.id,
          competencyImportFile(
            renameCompetencyIds(COMPETENCY_SETS.B, {
              'COMP-A': { id: 'COMP-B' },
              'COMP-B': { id: 'COMP-A' },
            }),
            { format: 'csv' },
          ),
          // The plan holds more than one line (the exact number depends on the plan format).
          async () => {
            await expect.poll(() => detail.wizard.planActions.count()).toBeGreaterThanOrEqual(2);
          },
        );
        expect(run.planStatus).toBe(200);
        expect(run.confirmedOk).toBe(true);

        const after = await readTagIds(request, config, taxonomy.id);
        expect(Object.keys(after)).toHaveLength(2);
        expect(after['Competency X']?.externalId).toBe('COMP-B');
        expect(after['Competency Y']?.externalId).toBe('COMP-A');
        for (const value of ['Competency X', 'Competency Y']) {
          expect(internalIdOf(after, value), value).toBe(internalIdOf(before, value));
        }
        expect(await appliedValues(page.request, config, unit, taxonomy.id)).toEqual([
          'Competency X',
          'Competency Y',
        ]);
        expect(tagCountFor(await fetchObjectTagCounts(page.request, config, [unit]), unit)).toBe(2);
      } finally {
        await deleteTaxonomiesBestEffort(request, config, created);
      }
    });

    test('reports nothing to change when an export is imported back', async ({
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

    test('leaves a tag alone when previous_id equals its id', async ({
      config,
      competencyAdminApi,
    }) => {
      const created: number[] = [];
      try {
        const { before, after } = await seedAndReimport(
          competencyAdminApi,
          config,
          created,
          'idempotent',
          COMPETENCY_SETS.B,
          competencyImportFile(renameCompetencyIds(COMPETENCY_SETS.B, { 'COMP-B': {} }), {
            format: 'json',
          }),
        );
        expect(after).toEqual(before);
      } finally {
        await deleteTaxonomiesBestEffort(competencyAdminApi, config, created);
      }
    });

    test('creates a tag for a new row without previous_id', async ({
      config,
      competencyAdminApi,
    }) => {
      const created: number[] = [];
      try {
        const { before, after } = await seedAndReimport(
          competencyAdminApi,
          config,
          created,
          'new-row',
          COMPETENCY_SETS.A,
          competencyImportFile([...COMPETENCY_SETS.A, { id: 'COMP-Z', value: 'Competency Z' }], {
            format: 'csv',
          }),
        );
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

    test('renames a Competency ID by letter case only', async ({ config, competencyAdminApi }) => {
      const created: number[] = [];
      try {
        const { before, after } = await seedAndReimport(
          competencyAdminApi,
          config,
          created,
          'case-only',
          COMPETENCY_SETS.A,
          competencyImportFile(
            renameCompetencyIds(COMPETENCY_SETS.A, { 'COMP-A': { id: 'comp-a' } }),
            { format: 'csv' },
          ),
        );
        expect(Object.keys(after)).toHaveLength(4);
        expect(after['Competency A']?.externalId).toBe('comp-a');
        expect(internalIdOf(after, 'Competency A')).toBe(internalIdOf(before, 'Competency A'));
      } finally {
        await deleteTaxonomiesBestEffort(competencyAdminApi, config, created);
      }
    });

    test('rotates three Competency IDs whatever the row order', async ({
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
          const { before, after } = await seedAndReimport(
            competencyAdminApi,
            config,
            created,
            `rotation-${order}`,
            COMPETENCY_SETS.E,
            competencyImportFile(rows, { format: 'csv' }),
          );
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

    test('renames onto an ID the same import frees and keeps the unit tagged', async ({
      contentCourse,
      studioAuthorSession,
      competencyAdminApi,
      page,
      config,
    }) => {
      void studioAuthorSession;
      const created: number[] = [];
      // Competency X is left out of the file, and Competency Y takes the ID X held.
      const renamed = renameCompetencyIds(
        COMPETENCY_SETS.D.filter((row) => row.id !== 'COMP-Z'),
        { 'COMP-A': { id: 'COMP-Z' } },
      );
      try {
        const unit = await authorUnit(page.request, config, contentCourse.courseKey);
        for (const [position, rows] of [
          ['first', renamed],
          ['last', [...renamed].reverse()],
        ] as const) {
          const { taxonomy, tags: before } = await seedCompetencyTaxonomy(
            competencyAdminApi,
            config,
            {
              name: name(`vacate-${position}`),
              rows: COMPETENCY_SETS.D,
              org: suiteOrg(config),
            },
          );
          created.push(taxonomy.id);
          await setObjectTags(page.request, config, unit, taxonomy.id, ['Competency Y']);

          const { plan, result } = await reimportThroughApi(
            competencyAdminApi,
            config,
            taxonomy.id,
            competencyImportFile(rows, { format: 'csv' }),
          );
          expect(plan.ok, `plan, rename ${position}`).toBe(true);
          expect(result.ok, `import, rename ${position}`).toBe(true);

          const after = await readTagIds(competencyAdminApi, config, taxonomy.id);
          expect(Object.keys(after).sort(), `tags, rename ${position}`).toEqual([
            'Competency Y',
            'Neutral Competency 1',
          ]);
          expect(after['Competency Y']?.externalId, `Y's ID, rename ${position}`).toBe('COMP-Z');
          expect(internalIdOf(after, 'Competency Y'), `Y, rename ${position}`).toBe(
            internalIdOf(before, 'Competency Y'),
          );
          expect(after['Neutral Competency 1'], `N1, rename ${position}`).toEqual(
            before['Neutral Competency 1'],
          );
          expect(
            await appliedValues(page.request, config, unit, taxonomy.id),
            `applied tags, rename ${position}`,
          ).toEqual(['Competency Y']);
        }
      } finally {
        await deleteTaxonomiesBestEffort(competencyAdminApi, config, created);
      }
    });

    test('lets a child follow its renamed parent', async ({ config, competencyAdminApi }) => {
      const created: number[] = [];
      try {
        const { before, after } = await seedAndReimport(
          competencyAdminApi,
          config,
          created,
          'parent-renamed',
          COMPETENCY_SETS.F,
          competencyImportFile(
            renameCompetencyIds(COMPETENCY_SETS.F, { 'COMP-P': { id: 'COMP-P2' } }),
            { format: 'csv' },
          ),
        );
        expect(after['Parent P']?.externalId).toBe('COMP-P2');
        expect(internalIdOf(after, 'Parent P')).toBe(internalIdOf(before, 'Parent P'));
        expect(after['Child C']?.externalId).toBe('COMP-C1');
        expect(after['Child C']?.parentValue).toBe('Parent P');
        expect(internalIdOf(after, 'Child C')).toBe(internalIdOf(before, 'Child C'));
      } finally {
        await deleteTaxonomiesBestEffort(competencyAdminApi, config, created);
      }
    });

    test('renames a parent and its child together', async ({ config, competencyAdminApi }) => {
      const created: number[] = [];
      try {
        const { before, after } = await seedAndReimport(
          competencyAdminApi,
          config,
          created,
          'parent-and-child',
          COMPETENCY_SETS.F,
          competencyImportFile(
            renameCompetencyIds(COMPETENCY_SETS.F, {
              'COMP-P': { id: 'COMP-P2' },
              'COMP-C1': { id: 'COMP-C2' },
            }),
            { format: 'json' },
          ),
        );
        expect(after['Parent P']?.externalId).toBe('COMP-P2');
        expect(after['Child C']?.externalId).toBe('COMP-C2');
        expect(internalIdOf(after, 'Parent P')).toBe(internalIdOf(before, 'Parent P'));
        expect(internalIdOf(after, 'Child C')).toBe(internalIdOf(before, 'Child C'));
        expect(after['Child C']?.parentValue).toBe('Parent P');
      } finally {
        await deleteTaxonomiesBestEffort(competencyAdminApi, config, created);
      }
    });

    test('renames a Competency ID and the tag value together', async ({
      config,
      competencyAdminApi,
    }) => {
      const created: number[] = [];
      try {
        const { before, after } = await seedAndReimport(
          competencyAdminApi,
          config,
          created,
          'id-and-value',
          COMPETENCY_SETS.F,
          competencyImportFile(
            renameCompetencyIds(COMPETENCY_SETS.F, {
              'COMP-P': { id: 'COMP-P2', value: 'Parent P Renamed' },
            }),
            { format: 'csv' },
          ),
        );
        expect(after['Parent P Renamed']?.externalId).toBe('COMP-P2');
        expect(internalIdOf(after, 'Parent P Renamed')).toBe(internalIdOf(before, 'Parent P'));
        expect(Object.keys(after)).not.toContain('Parent P');
        expect(after['Child C']?.parentValue).toBe('Parent P Renamed');
      } finally {
        await deleteTaxonomiesBestEffort(competencyAdminApi, config, created);
      }
    });

    test('exchanges the IDs of two parents that have children', async ({
      config,
      competencyAdminApi,
    }) => {
      const created: number[] = [];
      try {
        const { before, after } = await seedAndReimport(
          competencyAdminApi,
          config,
          created,
          'parents-swap',
          COMPETENCY_SETS.G,
          competencyImportFile(
            // The children's `parent_id` follows the new IDs: Child One under COMP-3, Child
            // Three under COMP-1.
            renameCompetencyIds(COMPETENCY_SETS.G, {
              'COMP-1': { id: 'COMP-3' },
              'COMP-3': { id: 'COMP-1' },
            }),
            { format: 'csv' },
          ),
        );
        expect(after['Parent One']?.externalId).toBe('COMP-3');
        expect(after['Parent Three']?.externalId).toBe('COMP-1');
        for (const value of ['Parent One', 'Parent Three']) {
          expect(internalIdOf(after, value), value).toBe(internalIdOf(before, value));
        }
        expect(after['Child One']?.parentValue).toBe('Parent One');
        expect(after['Child Three']?.parentValue).toBe('Parent Three');
      } finally {
        await deleteTaxonomiesBestEffort(competencyAdminApi, config, created);
      }
    });
  },
);
