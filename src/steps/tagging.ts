import type { APIRequestContext, TestInfo } from '@playwright/test';

import { getRunId, type AppConfig } from '../config';
import {
  deleteTaxonomy,
  importTaxonomy,
  listTaxonomies,
  setTaxonomyOrgs,
  type ImportableTaxonomyType,
  type Taxonomy,
} from '../api';

/**
 * The suite's own taxonomy tag values — our data, not localized platform copy,
 * so specs may match them directly. A small tree: three parents, one of them
 * with a single child, so a spec can assert both "child implies parent" (a
 * committed child reads as an implicit count of 2) and pagination-free browsing.
 */
export const TAG = {
  parentOne: 'E2E Parent One',
  childOneA: 'E2E Child One-A',
  childOneB: 'E2E Child One-B',
  parentTwo: 'E2E Parent Two',
  childTwoA: 'E2E Child Two-A',
  childTwoB: 'E2E Child Two-B',
  parentThree: 'E2E Parent Three',
  childThreeA: 'E2E Child Three-A',
} as const;

/** The import file (JSON) the seed uploads, built from {@link TAG} — eight tags. */
export function taxonomyImportFile(): {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
} {
  const tags = [
    { id: 'P1', value: TAG.parentOne, parent_id: '' },
    { id: 'P1C1', value: TAG.childOneA, parent_id: 'P1' },
    { id: 'P1C2', value: TAG.childOneB, parent_id: 'P1' },
    { id: 'P2', value: TAG.parentTwo, parent_id: '' },
    { id: 'P2C1', value: TAG.childTwoA, parent_id: 'P2' },
    { id: 'P2C2', value: TAG.childTwoB, parent_id: 'P2' },
    { id: 'P3', value: TAG.parentThree, parent_id: '' },
    { id: 'P3C1', value: TAG.childThreeA, parent_id: 'P3' },
  ];
  return {
    name: 'e2e-taxonomy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ tags })),
  };
}

/** One extra tag the UI import cases add, kept out of {@link TAG} (drawer specs). */
export const IMPORT_EXTRA_TAG = 'E2E Parent Four';

/** The same eight tags as {@link taxonomyImportFile}, in the CSV import format. */
export function taxonomyImportFileCsv(): {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
} {
  const rows = [
    ['P1', TAG.parentOne, ''],
    ['P1C1', TAG.childOneA, 'P1'],
    ['P1C2', TAG.childOneB, 'P1'],
    ['P2', TAG.parentTwo, ''],
    ['P2C1', TAG.childTwoA, 'P2'],
    ['P2C2', TAG.childTwoB, 'P2'],
    ['P3', TAG.parentThree, ''],
    ['P3C1', TAG.childThreeA, 'P3'],
  ];
  const csv = ['id,value,parent_id', ...rows.map((r) => r.join(','))].join('\n');
  return { name: 'e2e-taxonomy.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) };
}

/**
 * The eight-tag file plus one new root tag ({@link IMPORT_EXTRA_TAG}) — the
 * "modified file" TC-00262 re-imports; the plan is one addition, so the tag list
 * grows from eight to nine.
 */
export function taxonomyImportFileExtended(): {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
} {
  const tags = [
    { id: 'P1', value: TAG.parentOne, parent_id: '' },
    { id: 'P1C1', value: TAG.childOneA, parent_id: 'P1' },
    { id: 'P1C2', value: TAG.childOneB, parent_id: 'P1' },
    { id: 'P2', value: TAG.parentTwo, parent_id: '' },
    { id: 'P2C1', value: TAG.childTwoA, parent_id: 'P2' },
    { id: 'P2C2', value: TAG.childTwoB, parent_id: 'P2' },
    { id: 'P3', value: TAG.parentThree, parent_id: '' },
    { id: 'P3C1', value: TAG.childThreeA, parent_id: 'P3' },
    { id: 'P4', value: IMPORT_EXTRA_TAG, parent_id: '' },
  ];
  return {
    name: 'e2e-taxonomy-modified.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ tags })),
  };
}

/**
 * Seeds a taxonomy for an org, idempotently: if one named `name` already exists
 * (a resumed worker, a retry) it is reused and its org assignment ensured;
 * otherwise the tag file is imported and assigned to the org. Admin-only — call
 * on an admin request context under the admin lock (plan §2.1).
 */
export async function seedTaxonomy(
  request: APIRequestContext,
  config: AppConfig,
  options: { readonly name: string; readonly org: string },
): Promise<Taxonomy> {
  const existing = (await listTaxonomies(request, config)).taxonomies.find(
    (t) => t.name === options.name,
  );
  if (existing !== undefined) {
    if (!existing.allOrgs && !existing.orgs.includes(options.org)) {
      await setTaxonomyOrgs(request, config, existing.id, [options.org]);
    }
    return existing;
  }
  const taxonomy = await importTaxonomy(request, config, {
    name: options.name,
    description: 'E2E suite taxonomy',
    file: taxonomyImportFile(),
  });
  await setTaxonomyOrgs(request, config, taxonomy.id, [options.org]);
  return taxonomy;
}

/**
 * Best-effort teardown of taxonomies a test imported through the UI. A failed
 * delete is swallowed so one leftover never hides the test's own result.
 */
export async function deleteTaxonomiesBestEffort(
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

/**
 * Imports a run-unique taxonomy of `type` (the eight-tag file, no org assignment)
 * and records its id in `created` for the caller's teardown. The name carries the
 * run id, `label`, a slice of the test id and the retry number, so parallel tests
 * and retries never share one; two imports in one test differ by `label`.
 * Admin-only: call on an admin request context.
 */
export async function importTypedTaxonomy(
  request: APIRequestContext,
  config: AppConfig,
  options: {
    readonly type: ImportableTaxonomyType;
    readonly label: string;
    readonly testInfo: TestInfo;
    readonly created: number[];
  },
): Promise<Taxonomy> {
  const taxonomy = await importTaxonomy(request, config, {
    name: `E2E entry ${getRunId()} ${options.label} ${options.testInfo.testId.slice(-6)}R${options.testInfo.retry}`,
    description: 'E2E suite taxonomy',
    file: taxonomyImportFile(),
    taxonomyType: options.type,
  });
  options.created.push(taxonomy.id);
  return taxonomy;
}

/**
 * The items the taxonomy menu offers for what the API says this user may do, in
 * the app's order: re-import needs `canChangeTaxonomy` and a writable taxonomy,
 * export is always offered, delete needs `canDeleteTaxonomy` and a writable
 * taxonomy, manage organizations needs `canChangeTaxonomy`, and apply competencies
 * needs `canTagObject` on a Competency taxonomy. Each item is its `data-testid`,
 * the app's untranslated item key.
 */
export function expectedTaxonomyMenu(taxonomy: Taxonomy): string[] {
  const items: [string, boolean][] = [
    ['taxonomy-menu-import', taxonomy.canChangeTaxonomy && !taxonomy.readOnly],
    ['taxonomy-menu-export', true],
    ['taxonomy-menu-delete', taxonomy.canDeleteTaxonomy && !taxonomy.readOnly],
    ['taxonomy-menu-manageOrgs', taxonomy.canChangeTaxonomy],
    [
      'taxonomy-menu-applyCompetencies',
      taxonomy.canTagObject && taxonomy.taxonomyType === 'competency',
    ],
  ];
  return items.filter(([, shown]) => shown).map(([id]) => id);
}
