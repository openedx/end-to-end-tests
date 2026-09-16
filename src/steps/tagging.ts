import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { TIMEOUTS } from '../config';
import {
  acceptAgreement,
  fetchObjectTagCounts,
  importTaxonomy,
  listTaxonomies,
  setObjectTags,
  setTaxonomyOrgs,
  tagCountFor,
  type Taxonomy,
} from '../api';
import { pollUntil, type PollOutcome } from './poll';

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
 * Applies a taxonomy's tag values to an object — a convenience over
 * {@link setObjectTags} for seeding a starting state. The caller must have write
 * access to the object's course.
 */
export async function tagObject(
  request: APIRequestContext,
  config: AppConfig,
  objectId: string,
  taxonomyId: number,
  tags: readonly string[],
): Promise<void> {
  await setObjectTags(request, config, objectId, taxonomyId, tags);
}

/**
 * Polls one object's implicit tag count until it reaches `expected` (the count
 * refreshes on a delay after a drawer Save — the sheet's own note on the card
 * badge). Never throws: returns the outcome with the last reading, under the
 * Meilisearch-backed lag budget the card badge shares.
 */
export async function waitForTagCount(
  request: APIRequestContext,
  config: AppConfig,
  objectId: string,
  expected: number,
): Promise<PollOutcome<number>> {
  return pollUntil(
    async () =>
      tagCountFor(
        await fetchObjectTagCounts(request, config, [objectId], { implicit: true }),
        objectId,
      ),
    (count) => count === expected,
    TIMEOUTS.librarySearch,
  );
}

/**
 * Accepts every configured upload agreement for the caller, so a spec on a
 * gating-enabled install is not blocked from uploading. A no-op when the list is
 * empty. Runs on the caller's own JWT context.
 */
export async function acceptUploadAgreements(
  request: APIRequestContext,
  config: AppConfig,
  agreementTypes: readonly string[],
): Promise<void> {
  for (const type of agreementTypes) {
    await acceptAgreement(request, config, type);
  }
}
