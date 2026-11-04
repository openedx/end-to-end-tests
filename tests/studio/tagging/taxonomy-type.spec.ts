import type { APIRequestContext } from '@playwright/test';

import {
  deleteTaxonomy,
  fetchTaxonomy,
  importTaxonomy,
  listTaxonomyTags,
  type ImportableTaxonomyType,
} from '../../../src/api';
import { checkA11y } from '../../../src/a11y';
import { TAXONOMY_SELECTORS, TIMEOUTS, getRunId, type AppConfig } from '../../../src/config';
import { expect, test, type TaxonomyAdmin } from '../../../src/fixtures';
import {
  IMPORT_EXTRA_TAG,
  taxonomyImportFile,
  taxonomyImportFileExtended,
} from '../../../src/steps';

/**
 * The taxonomy type chosen when a taxonomy is imported, and the type icon on its
 * card in the taxonomy list (openedx-core `taxonomy_type`, frontend-app-authoring
 * #3208 and #3255). No BTR case maps to these.
 *
 * The admin drives the import wizard under the admin lock ({@link taxonomyAdmin});
 * the content-tagging API decides the stored type, and the list page's card is read
 * next to it in one `expect.poll`. Every wizard run starts from `list.goto()`: after
 * a wizard is closed, selecting the same file again in the same page session leaves
 * Continue doing nothing (`TAG-005`,
 * https://github.com/openedx/openedx-core/issues/827), so a reload separates the
 * runs. Gated on `competencies`, which only `main` declares.
 */
test.describe(
  'Taxonomy type',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@taxonomies', '@competencies'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test('offers Tags and Competency on the populate step, Tags selected', async ({
      taxonomyAdmin,
    }) => {
      const { list, page } = taxonomyAdmin;
      await list.goto();
      await list.openImportToPopulate(taxonomyImportFile());

      await expect(list.typeSelect).toBeVisible();
      await expect(list.typeSelect).toHaveValue('tags');
      // Option `value` attributes are the untranslated API values; their text is copy.
      const values = await list.typeOptions.evaluateAll((options) =>
        options.map((o) => (o as HTMLOptionElement).value),
      );
      expect(values).toEqual(['tags', 'competency']);

      // The select follows the description field. DOM order is language- and
      // layout-independent, unlike a bounding-box comparison.
      const followsDescription = await list.typeSelect.evaluate((select, descriptionSelector) => {
        const description = document.querySelector(descriptionSelector);
        return (
          description !== null &&
          Boolean(description.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING)
        );
      }, TAXONOMY_SELECTORS.populateDescInput);
      expect(followsDescription).toBe(true);

      await checkA11y(page, { label: 'studio-taxonomy-import-populate' });
    });

    test('imports a taxonomy as Competency and shows the Competency icon', async ({
      config,
      taxonomyAdmin,
    }) => {
      const created: number[] = [];
      try {
        const id = await importAs(taxonomyAdmin, 'competency', 'competency', created);
        await taxonomyAdmin.list.goto();
        await expectTypeAndIcon(taxonomyAdmin, config, id, 'competency');
        await checkA11y(taxonomyAdmin.page, { label: 'studio-taxonomy-list-types' });
      } finally {
        await cleanup(taxonomyAdmin.request, config, created);
      }
    });

    test('imports a taxonomy with the default type as Tags and shows the Tags icon', async ({
      config,
      taxonomyAdmin,
    }) => {
      const created: number[] = [];
      try {
        const id = await importAs(taxonomyAdmin, 'default', undefined, created);
        await taxonomyAdmin.list.goto();
        await expectTypeAndIcon(taxonomyAdmin, config, id, 'tags');
        await checkA11y(taxonomyAdmin.page, { label: 'studio-taxonomy-list-types' });
      } finally {
        await cleanup(taxonomyAdmin.request, config, created);
      }
    });

    test('shows exactly one type icon on every card of the list', async ({
      config,
      taxonomyAdmin,
    }) => {
      const { list, request, page } = taxonomyAdmin;
      const created: number[] = [];
      try {
        const suffix = test.info().testId.slice(-6);
        const seeded = new Map<number, ImportableTaxonomyType>();
        for (const type of ['competency', 'tags'] as const) {
          const taxonomy = await importTaxonomy(request, config, {
            name: `E2E ${getRunId()} type seeded-${type} ${suffix}`,
            file: taxonomyImportFile(),
            taxonomyType: type,
          });
          created.push(taxonomy.id);
          seeded.set(taxonomy.id, type);
        }

        await list.goto();
        // `expectTypeAndIcon` needs each seeded card on the list, so an empty list
        // cannot pass.
        for (const [id, type] of seeded) {
          await expectTypeAndIcon(taxonomyAdmin, config, id, type);
        }
        // Every card the page shows, seeded or not, holds exactly one type icon. The
        // cards and their icon counts come from one read, so the cards another run
        // adds or deletes meanwhile cannot skew the comparison; the cards that break
        // the rule are listed by test id.
        const cards = await list.cardIconCounts();
        expect(cards.length).toBeGreaterThanOrEqual(seeded.size);
        expect(cards.filter(({ icons }) => icons !== 1)).toEqual([]);

        await checkA11y(page, { label: 'studio-taxonomy-list-types' });
      } finally {
        await cleanup(request, config, created);
      }
    });

    test('imports with the type last chosen when Competency is switched back to Tags', async ({
      config,
      taxonomyAdmin,
    }) => {
      const { list } = taxonomyAdmin;
      const created: number[] = [];
      try {
        await list.goto();
        await list.openImportToPopulate(taxonomyImportFile());
        await list.fillPopulate(`E2E ${getRunId()} type switched ${test.info().testId.slice(-6)}`, {
          type: 'competency',
        });
        await list.chooseType('tags');
        await expect(list.typeSelect).toHaveValue('tags');
        const id = await list.submitImport();
        created.push(id);

        await list.goto();
        await expectTypeAndIcon(taxonomyAdmin, config, id, 'tags');
      } finally {
        await cleanup(taxonomyAdmin.request, config, created);
      }
    });

    test('shows the Tags icon for a taxonomy imported without a type', async ({
      config,
      taxonomyAdmin,
    }) => {
      const created: number[] = [];
      try {
        // No `taxonomyType`: the request carries no `taxonomy_type` field, so the
        // backend's own default is what is read back.
        const taxonomy = await importTaxonomy(taxonomyAdmin.request, config, {
          name: `E2E ${getRunId()} type unset ${test.info().testId.slice(-6)}`,
          file: taxonomyImportFile(),
        });
        created.push(taxonomy.id);
        // The import response already carries the backend's default.
        expect(taxonomy.taxonomyType).toBe('tags');

        await taxonomyAdmin.list.goto();
        await expectTypeAndIcon(taxonomyAdmin, config, taxonomy.id, 'tags');
      } finally {
        await cleanup(taxonomyAdmin.request, config, created);
      }
    });

    test('keeps the Competency type when the taxonomy is re-imported', async ({
      config,
      taxonomyAdmin,
    }) => {
      const { detail, page, request } = taxonomyAdmin;
      const created: number[] = [];
      try {
        const taxonomy = await importTaxonomy(request, config, {
          name: `E2E ${getRunId()} type reimport ${test.info().testId.slice(-6)}`,
          file: taxonomyImportFile(),
          taxonomyType: 'competency',
        });
        created.push(taxonomy.id);

        // A fresh page load, and a file with different content, before the wizard:
        // `TAG-005`: https://github.com/openedx/openedx-core/issues/827
        await detail.goto(taxonomy.id);
        // `TAG-004`: the breadcrumb's `ol.list-inline` holds non-`<li>` children.
        await checkA11y(page, { label: 'studio-taxonomy-detail', additionalBaseline: ['list'] });
        await detail.reimport(taxonomy.id, taxonomyImportFileExtended());

        await expect
          .poll(
            async () => ({
              storedType: (await fetchTaxonomy(request, config, taxonomy.id)).taxonomyType,
              hasNewTag: (await listTaxonomyTags(request, config, taxonomy.id))
                .map((t) => t.value)
                .includes(IMPORT_EXTRA_TAG),
            }),
            { timeout: TIMEOUTS.action },
          )
          .toEqual({ storedType: 'competency', hasNewTag: true });
      } finally {
        await cleanup(request, config, created);
      }
    });
  },
);

/**
 * Runs the import wizard end to end, choosing `type` only when given, and records
 * the created id in `created` for teardown.
 */
async function importAs(
  { list }: TaxonomyAdmin,
  variant: string,
  type: ImportableTaxonomyType | undefined,
  created: number[],
): Promise<number> {
  await list.goto();
  const id = await list.importNewTaxonomy(
    taxonomyImportFile(),
    `E2E ${getRunId()} type ${variant} ${test.info().testId.slice(-6)}`,
    type,
  );
  created.push(id);
  return id;
}

/**
 * The stored type (API) and the card's icons (list page) are read together in one
 * poll, on the list page the caller has already opened: the API reports the expected
 * type for the taxonomy, and its card shows exactly one type icon, of that type.
 */
async function expectTypeAndIcon(
  { list, request }: TaxonomyAdmin,
  config: AppConfig,
  id: number,
  type: ImportableTaxonomyType,
): Promise<void> {
  await expect
    .poll(
      async () => ({
        storedType: (await fetchTaxonomy(request, config, id)).taxonomyType,
        iconsOfType: await list.cardTypeIcon(id, type).count(),
        iconsOnCard: await list.cardTypeIcons(id).count(),
      }),
      { timeout: TIMEOUTS.action },
    )
    .toEqual({ storedType: type, iconsOfType: 1, iconsOnCard: 1 });
}

/** Best-effort teardown of taxonomies a test imported through the UI. */
async function cleanup(
  request: APIRequestContext,
  config: AppConfig,
  ids: readonly number[],
): Promise<void> {
  for (const id of ids) {
    try {
      await deleteTaxonomy(request, config, id);
    } catch {
      // A run-unique name means a leftover never collides with a later run.
    }
  }
}
