import { readFile } from 'node:fs/promises';

import type { APIRequestContext, Download, TestInfo } from '@playwright/test';

import { getRunId, type AppConfig } from '../config';
import {
  deleteTaxonomy,
  importTaxonomy,
  listTaxonomies,
  listTaxonomyTags,
  setTaxonomyOrgs,
  taxonomiesNamed,
  type ImportableTaxonomyType,
  type TagsImportFile,
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

/**
 * The suite's competency tree tag values and Competency IDs (the JSON `id`), our own
 * data. Three top-level tags: a group with two leaves, a group with a group and a
 * leaf below it, and a chain six levels deep (the API's maximum depth). The IDs are
 * short so a badge never overflows its row.
 */
export const COMPETENCY = {
  communication: { value: 'E2E Communication Skills', id: 'COMP-001' },
  written: { value: 'E2E Written Communication', id: 'COMP-001-A' },
  verbal: { value: 'E2E Verbal Communication', id: 'COMP-001-B' },
  technical: { value: 'E2E Technical Skills', id: 'COMP-002' },
  python: { value: 'E2E Python Programming', id: 'COMP-002-A' },
  django: { value: 'E2E Django Framework', id: 'COMP-002-A-1' },
  chain: [
    { value: 'E2E Chain 1', id: 'CH-1' },
    { value: 'E2E Chain 2', id: 'CH-2' },
    { value: 'E2E Chain 3', id: 'CH-3' },
    { value: 'E2E Chain 4', id: 'CH-4' },
    { value: 'E2E Chain 5', id: 'CH-5' },
    { value: 'E2E Chain 6', id: 'CH-6' },
  ],
} as const;

/** The JSON import file for the competency tree: the twelve tags of {@link COMPETENCY}. */
export function competencyTreeImportFile(): {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
} {
  const C = COMPETENCY;
  const tags = [
    { id: C.communication.id, value: C.communication.value, parent_id: '' },
    { id: C.written.id, value: C.written.value, parent_id: C.communication.id },
    { id: C.verbal.id, value: C.verbal.value, parent_id: C.communication.id },
    { id: C.technical.id, value: C.technical.value, parent_id: '' },
    { id: C.python.id, value: C.python.value, parent_id: C.technical.id },
    { id: C.django.id, value: C.django.value, parent_id: C.python.id },
    ...C.chain.map((link, index) => ({
      id: link.id,
      value: link.value,
      parent_id: C.chain[index - 1]?.id ?? '',
    })),
  ];
  return {
    name: 'e2e-competency-tree.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ tags })),
  };
}

/**
 * The JSON import file for a tree too tall for its column: eight roots
 * (`E2E Scroll Root <n>`, ID `SCR-<n>`) with twelve leaves each (`E2E Scroll Leaf
 * <n>.<m>`, ID `SCR-<n>-<m>`), 104 tags. Expanded, the rows add up to well over the
 * tree's 73rem maximum height.
 */
export function competencyScrollTreeImportFile(): {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
} {
  const tags: { id: string; value: string; parent_id: string }[] = [];
  for (let root = 1; root <= 8; root += 1) {
    tags.push({ id: `SCR-${root}`, value: `E2E Scroll Root ${root}`, parent_id: '' });
    for (let leaf = 1; leaf <= 12; leaf += 1) {
      tags.push({
        id: `SCR-${root}-${leaf}`,
        value: `E2E Scroll Leaf ${root}.${leaf}`,
        parent_id: `SCR-${root}`,
      });
    }
  }
  return {
    name: 'e2e-competency-scroll-tree.json',
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
 * A CSV with three lines of plain text and no columns. The wizard accepts it by its
 * extension and the import endpoint rejects it with 400 (no `id` and `value` headers).
 */
export function invalidRandomTextFile(): {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
} {
  const text = ['This is not a taxonomy.', 'It has no columns.', 'Just three lines of text.'];
  return {
    name: 'e2e-invalid-random.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(text.join('\n')),
  };
}

/** An empty CSV: the wizard accepts it and the import endpoint rejects it with 400. */
export function invalidEmptyFile(): {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
} {
  return { name: 'e2e-invalid-empty.csv', mimeType: 'text/csv', buffer: Buffer.alloc(0) };
}

/**
 * The JSON of {@link taxonomyImportFile} cut off halfway, so it does not parse; the
 * import endpoint rejects it with 400. Throws if the cut text still parses, because a
 * "truncated" file that is valid would make the case pass or fail for the wrong reason.
 */
export function invalidTruncatedJsonFile(): {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
} {
  const text = taxonomyImportFile().buffer.toString('utf8');
  const truncated = text.slice(0, Math.floor(text.length / 2));
  try {
    JSON.parse(truncated);
  } catch {
    return {
      name: 'e2e-invalid-truncated.json',
      mimeType: 'application/json',
      buffer: Buffer.from(truncated),
    };
  }
  throw new Error('The truncated import file still parses as JSON.');
}

/**
 * A CSV headed `code,title,parent` instead of `id,value,parent_id`: the wizard accepts
 * it and the import endpoint rejects it with 400 (no `id` and `value` columns).
 */
export function invalidWrongHeadersFile(): {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
} {
  const csv = ['code,title,parent', 'W1,E2E Wrong Headers One,', 'W2,E2E Wrong Headers Two,W1'];
  return {
    name: 'e2e-invalid-headers.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv.join('\n')),
  };
}

/** A plain-text file, which the wizard's dropzone rejects (it accepts only CSV and JSON). */
export function unsupportedTxtFile(): {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
} {
  return {
    name: 'e2e-unsupported.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('This file type is not a taxonomy import format.'),
  };
}

/** A 1x1 PNG, which the wizard's dropzone rejects (it accepts only CSV and JSON). */
export function unsupportedPngFile(): {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
} {
  return {
    name: 'e2e-unsupported.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
      'base64',
    ),
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
 * Best-effort teardown by name: deletes every taxonomy, disabled ones included, the
 * admin's list holds under `name`. A failed lookup is swallowed like a failed delete. Use
 * it when a test may not have kept the id of a taxonomy the UI created (a double
 * submission, or an import that failed after the server created it).
 */
export async function deleteTaxonomiesNamed(
  request: APIRequestContext,
  config: AppConfig,
  name: string,
): Promise<void> {
  try {
    const named = await taxonomiesNamed(request, config, name);
    await deleteTaxonomiesBestEffort(
      request,
      config,
      named.map((t) => t.id),
    );
  } catch (error) {
    // Teardown must not mask the test's own failure. A failed or truncated lookup leaves
    // leftovers, which a run-unique name keeps from colliding with a later run.
    console.warn(
      `[deleteTaxonomiesNamed] could not clean up "${name}": ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
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

/**
 * One tag of a competency import file. `id` is the Competency ID (`external_id`),
 * `parentId` the ID of the parent row, and `previousId` the ID the tag has now when the
 * row renames it (`previous_id`, accepted by an import only).
 */
export interface CompetencyRow {
  readonly id: string;
  readonly value: string;
  readonly parentId?: string;
  readonly previousId?: string;
}

/**
 * The taxonomies the re-import cases start from, as the rows imported first. A case
 * builds its "after" file from the same rows with {@link renameCompetencyIds}.
 */
export const COMPETENCY_SETS = {
  /** One tag to rename and three that stay as they are. */
  A: [
    { id: 'COMP-A', value: 'Competency A' },
    { id: 'COMP-N1', value: 'Neutral Competency 1' },
    { id: 'COMP-N2', value: 'Neutral Competency 2' },
    { id: 'COMP-N3', value: 'Neutral Competency 3' },
  ],
  /** Two tags whose IDs can be exchanged or left alone. */
  B: [
    { id: 'COMP-A', value: 'Competency X' },
    { id: 'COMP-B', value: 'Competency Y' },
  ],
  /** Three tags whose IDs rotate. */
  E: [
    { id: 'COMP-A', value: 'Competency X' },
    { id: 'COMP-B', value: 'Competency Y' },
    { id: 'COMP-C', value: 'Competency Z' },
  ],
  /** A tag (Y) that takes the ID of another (X) once the file no longer holds X. */
  D: [
    { id: 'COMP-Z', value: 'Competency X' },
    { id: 'COMP-A', value: 'Competency Y' },
    { id: 'COMP-N1', value: 'Neutral Competency 1' },
  ],
  /** A parent with one child. */
  F: [
    { id: 'COMP-P', value: 'Parent P' },
    { id: 'COMP-C1', value: 'Child C', parentId: 'COMP-P' },
  ],
  /** Two parents, each with one child, parents first. */
  G: [
    { id: 'COMP-1', value: 'Parent One' },
    { id: 'COMP-3', value: 'Parent Three' },
    { id: 'COMP-1A', value: 'Child One', parentId: 'COMP-1' },
    { id: 'COMP-3A', value: 'Child Three', parentId: 'COMP-3' },
  ],
} as const satisfies Record<string, readonly CompetencyRow[]>;

/**
 * Rewrites `rows` as the file that renames tags: a row whose `id` is a key of `renames`
 * takes the patch's new `id` and `value` (each kept when absent) and gets its old `id` as
 * `previousId`. A child's `parentId` follows its parent's new ID, as a hand-written file
 * would have it. Rows keep their order.
 */
export function renameCompetencyIds(
  rows: readonly CompetencyRow[],
  renames: Readonly<Record<string, { readonly id?: string; readonly value?: string }>>,
): CompetencyRow[] {
  return rows.map((row) => {
    const patch = renames[row.id];
    const parentPatch = row.parentId === undefined ? undefined : renames[row.parentId];
    const renamed: CompetencyRow = {
      ...row,
      ...(parentPatch?.id === undefined ? {} : { parentId: parentPatch.id }),
    };
    return patch === undefined
      ? renamed
      : {
          ...renamed,
          id: patch.id ?? row.id,
          value: patch.value ?? row.value,
          previousId: row.id,
        };
  });
}

/** Quotes a CSV cell when it holds a comma, a quote or a line break. */
function csvCell(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * The import file for `rows`, as the wizard and the import endpoints take it. A CSV has
 * the columns `id,value,parent_id` and adds `previous_id` only when some row sets it. A
 * JSON file is `{ "tags": [...] }` and carries `previous_id` only on the rows that set it.
 * The file name is fixed and carries the format's extension, which the wizard uses to
 * tell CSV from JSON.
 */
export function competencyImportFile(
  rows: readonly CompetencyRow[],
  options: { readonly format: 'csv' | 'json' },
): TagsImportFile {
  const name = `e2e-competency-ids.${options.format}`;
  if (options.format === 'json') {
    const tags = rows.map((row) => ({
      id: row.id,
      value: row.value,
      parent_id: row.parentId ?? '',
      ...(row.previousId === undefined ? {} : { previous_id: row.previousId }),
    }));
    return {
      name,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ tags })),
    };
  }
  const withPrevious = rows.some((row) => row.previousId !== undefined);
  const header = ['id', 'value', 'parent_id', ...(withPrevious ? ['previous_id'] : [])];
  const lines = rows.map((row) =>
    [row.id, row.value, row.parentId ?? '', ...(withPrevious ? [row.previousId ?? ''] : [])]
      .map(csvCell)
      .join(','),
  );
  return {
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from([header.join(','), ...lines].join('\n')),
  };
}

/** What identifies a tag before and after an import: its database id, external ID and parent. */
export interface TagIds {
  readonly internalId: number | null;
  readonly externalId: string | null;
  readonly parentValue: string | null;
}

/**
 * Reads every tag of a taxonomy keyed by its value (unique within a taxonomy): its
 * database id, Competency ID and parent. A case takes this before an import and again
 * after it to show that tags were renamed in place or left untouched.
 */
export async function readTagIds(
  request: APIRequestContext,
  config: AppConfig,
  taxonomyId: number,
): Promise<Record<string, TagIds>> {
  const tags = await listTaxonomyTags(request, config, taxonomyId);
  return Object.fromEntries(
    tags.map((tag) => [
      tag.value,
      { internalId: tag.internalId, externalId: tag.externalId, parentValue: tag.parentValue },
    ]),
  );
}

/**
 * Imports a Competency taxonomy of `rows` (JSON) named `name`, assigns it to `org` when
 * given, and returns it with the IDs of its tags as {@link readTagIds} reads them. Admin
 * only: call it on an admin request context. The caller deletes the taxonomy.
 */
export async function seedCompetencyTaxonomy(
  request: APIRequestContext,
  config: AppConfig,
  options: {
    readonly name: string;
    readonly rows: readonly CompetencyRow[];
    readonly org?: string;
  },
): Promise<{ readonly taxonomy: Taxonomy; readonly tags: Record<string, TagIds> }> {
  const taxonomy = await importTaxonomy(request, config, {
    name: options.name,
    description: 'E2E suite taxonomy',
    file: competencyImportFile(options.rows, { format: 'json' }),
    taxonomyType: 'competency',
  });
  if (options.org !== undefined) {
    await setTaxonomyOrgs(request, config, taxonomy.id, [options.org]);
  }
  return { taxonomy, tags: await readTagIds(request, config, taxonomy.id) };
}

/** One tag of an exported file: the three columns of its row and the keys the row carries. */
export interface ExportedTag {
  readonly id: string;
  readonly value: string;
  /** `null` for a root tag, whether the file wrote an empty string or `null`. */
  readonly parentId: string | null;
  /** The column names (CSV, the same for every row) or keys of the entry (JSON). */
  readonly keys: readonly string[];
}

interface RawExportedTag {
  readonly id?: string;
  readonly value?: string;
  readonly parent_id?: string | null;
}

/**
 * Parses a taxonomy export (the text of the downloaded CSV or JSON file) into its tags.
 * It only reads: whether the IDs, parents and keys are right is the caller's assertion.
 *
 * @throws {Error} when the text is not the format's shape (no header, no `tags` array), or
 * when a CSV holds a quoted cell.
 */
export function parseExportedIds(text: string, format: 'csv' | 'json'): ExportedTag[] {
  if (format === 'json') {
    const parsed = JSON.parse(text) as { tags?: unknown } | null;
    if (!Array.isArray(parsed?.tags)) {
      throw new Error('The exported JSON has no "tags" array.');
    }
    return (parsed.tags as RawExportedTag[]).map((entry) => ({
      id: entry.id ?? '',
      value: entry.value ?? '',
      parentId: entry.parent_id === undefined || entry.parent_id === '' ? null : entry.parent_id,
      keys: Object.keys(entry),
    }));
  }
  if (text.includes('"')) {
    throw new Error(
      "The exported CSV holds a quoted cell, which this parser does not read: the suite's " +
        'own tag values and IDs contain no commas, quotes or line breaks.',
    );
  }
  const [headerLine, ...lines] = text.split(/\r?\n/).filter((line) => line !== '');
  if (headerLine === undefined) {
    throw new Error('The exported CSV is empty: it has no header row.');
  }
  const header = headerLine.split(',');
  const column = (cells: readonly string[], name: string): string =>
    cells[header.indexOf(name)] ?? '';
  return lines.map((line) => {
    const cells = line.split(',');
    return {
      id: column(cells, 'id'),
      value: column(cells, 'value'),
      parentId: column(cells, 'parent_id') === '' ? null : column(cells, 'parent_id'),
      keys: header,
    };
  });
}

/** Reads the text of a downloaded file (a taxonomy export or template). */
export async function downloadText(download: Download): Promise<string> {
  return readFile(await download.path(), 'utf8');
}
