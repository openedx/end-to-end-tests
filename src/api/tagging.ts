import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { studioJson, studioOrigin, studioWriteHeaders, STUDIO_JSON_ACCEPT } from './studio-origin';

/**
 * Content tagging: the CMS `content_tagging/v1/` API behind the authoring MFE's
 * taxonomy pages and the tag drawers. Measured on Tutor `main` (2026-09-16, Epic
 * 11 plan §1.2); `release/verawood` has the same routes.
 *
 * Two personas act here (plan §2.1):
 * - **Taxonomy management** (create/import, assign org, export, delete) needs a
 *   taxonomy admin (staff/superuser); an author reads taxonomies but is refused
 *   these writes.
 * - **Object tagging** (`object_tags`) needs write access to the object's course.
 *   On `main`/`verawood` that goes through openedx-authz, granted to a course's
 *   creator at creation, so the worker author tags only courses it created.
 *
 * The API is DRF, so reads ride the request context's JWT; writes send the
 * Studio CSRF token and `Referer` ({@link studioWriteHeaders}), like every other
 * CMS write in the suite.
 */
export const TAGGING_BASE = '/api/content_tagging/v1';

/** One taxonomy as the list/detail endpoints return it. */
export interface Taxonomy {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly allowMultiple: boolean;
  readonly allowFreeText: boolean;
  readonly readOnly: boolean;
  readonly exportId: string;
  readonly tagsCount: number;
  readonly orgs: readonly string[];
  readonly allOrgs: boolean;
  /** Whether this session may add or change tags with this taxonomy on an object. */
  readonly canTagObject: boolean;
  readonly canChangeTaxonomy: boolean;
  readonly canDeleteTaxonomy: boolean;
}

interface RawTaxonomy {
  readonly id: number;
  readonly name?: string;
  readonly description?: string;
  readonly enabled?: boolean;
  readonly allow_multiple?: boolean;
  readonly allow_free_text?: boolean;
  readonly read_only?: boolean;
  readonly export_id?: string;
  readonly tags_count?: number;
  readonly orgs?: readonly string[];
  readonly all_orgs?: boolean;
  readonly can_tag_object?: boolean;
  readonly can_change_taxonomy?: boolean;
  readonly can_delete_taxonomy?: boolean;
}

function toTaxonomy(raw: RawTaxonomy): Taxonomy {
  return {
    id: raw.id,
    name: raw.name ?? '',
    description: raw.description ?? '',
    enabled: raw.enabled ?? false,
    allowMultiple: raw.allow_multiple ?? false,
    allowFreeText: raw.allow_free_text ?? false,
    readOnly: raw.read_only ?? false,
    exportId: raw.export_id ?? '',
    tagsCount: raw.tags_count ?? 0,
    orgs: raw.orgs ?? [],
    allOrgs: raw.all_orgs ?? false,
    canTagObject: raw.can_tag_object ?? false,
    canChangeTaxonomy: raw.can_change_taxonomy ?? false,
    canDeleteTaxonomy: raw.can_delete_taxonomy ?? false,
  };
}

interface RawTaxonomyList {
  readonly count: number;
  readonly can_add_taxonomy: boolean;
  readonly results: readonly RawTaxonomy[];
}

/** A taxonomy list page plus whether this session may create taxonomies at all. */
export interface TaxonomyList {
  readonly count: number;
  readonly canAddTaxonomy: boolean;
  readonly taxonomies: readonly Taxonomy[];
}

export interface ListTaxonomiesOptions {
  /** Restrict to taxonomies assigned to this org (what an author sees in a course's drawer). */
  readonly org?: string;
  /** Only enabled taxonomies (the drawer's filter). Defaults to true. */
  readonly enabled?: boolean;
}

/**
 * Lists taxonomies. The MFE's taxonomy page passes no org (the admin's full
 * list); a course's drawer effectively sees `org=<course org>` — the oracle for
 * "assigned to the org appears / after delete is gone" (TC-00260/00264).
 */
export async function listTaxonomies(
  request: APIRequestContext,
  config: AppConfig,
  options: ListTaxonomiesOptions = {},
): Promise<TaxonomyList> {
  const params = new URLSearchParams();
  if (options.enabled ?? true) params.set('enabled', 'true');
  if (options.org !== undefined) params.set('org', options.org);
  const url = `${studioOrigin(config)}${TAGGING_BASE}/taxonomies/?${params.toString()}`;
  const raw = await studioJson<RawTaxonomyList>(
    await request.get(url, { headers: STUDIO_JSON_ACCEPT }),
    'Listing taxonomies',
  );
  return {
    count: raw.count,
    canAddTaxonomy: raw.can_add_taxonomy,
    taxonomies: raw.results.map(toTaxonomy),
  };
}

/** Reads one taxonomy by id. */
export async function fetchTaxonomy(
  request: APIRequestContext,
  config: AppConfig,
  taxonomyId: number,
): Promise<Taxonomy> {
  const url = `${studioOrigin(config)}${TAGGING_BASE}/taxonomies/${taxonomyId}/`;
  return toTaxonomy(
    await studioJson<RawTaxonomy>(
      await request.get(url, { headers: STUDIO_JSON_ACCEPT }),
      `Reading taxonomy ${taxonomyId}`,
    ),
  );
}

export interface ImportTaxonomyOptions {
  readonly name: string;
  readonly description?: string;
  /** The tag file contents and its format (a checked-in JSON/CSV fixture). */
  readonly file: { readonly name: string; readonly mimeType: string; readonly buffer: Buffer };
}

/**
 * Imports a new taxonomy from a tag file — what the taxonomy page's Import button
 * does. Admin-only; an author is refused. The tags import synchronously, so the
 * returned taxonomy already carries its `tags_count`.
 */
export async function importTaxonomy(
  request: APIRequestContext,
  config: AppConfig,
  options: ImportTaxonomyOptions,
): Promise<Taxonomy> {
  const url = `${studioOrigin(config)}${TAGGING_BASE}/taxonomies/import/`;
  const response = await request.post(url, {
    headers: await studioWriteHeaders(request, config),
    multipart: {
      taxonomy_name: options.name,
      taxonomy_description: options.description ?? '',
      file: options.file,
    },
  });
  return toTaxonomy(
    await studioJson<RawTaxonomy>(response, `Importing taxonomy "${options.name}"`),
  );
}

/**
 * Assigns a taxonomy to one or more orgs (or all orgs) — the Manage Organizations
 * modal. Admin-only. After this the taxonomy appears in those orgs' course
 * drawers.
 */
export async function setTaxonomyOrgs(
  request: APIRequestContext,
  config: AppConfig,
  taxonomyId: number,
  orgs: readonly string[] | 'all',
): Promise<void> {
  const url = `${studioOrigin(config)}${TAGGING_BASE}/taxonomies/${taxonomyId}/orgs/`;
  const data = orgs === 'all' ? { all_orgs: true } : { orgs };
  const response = await request.fetch(url, {
    method: 'PUT',
    data,
    headers: await studioWriteHeaders(request, config),
  });
  await studioJson<unknown>(response, `Assigning taxonomy ${taxonomyId} to orgs`, {
    allowEmpty: true,
  });
}

/** Deletes a taxonomy. Admin-only; `204` on success, then a `GET` is `404`. */
export async function deleteTaxonomy(
  request: APIRequestContext,
  config: AppConfig,
  taxonomyId: number,
): Promise<void> {
  const url = `${studioOrigin(config)}${TAGGING_BASE}/taxonomies/${taxonomyId}/`;
  const response = await request.fetch(url, {
    method: 'DELETE',
    headers: await studioWriteHeaders(request, config),
  });
  await studioJson<unknown>(response, `Deleting taxonomy ${taxonomyId}`, { allowEmpty: true });
}

/** One tag in a taxonomy, as `taxonomies/<id>/tags/` lists it. */
export interface TaxonomyTag {
  readonly value: string;
  readonly externalId: string | null;
  readonly childCount: number;
  readonly depth: number;
  readonly parentValue: string | null;
}

interface RawTaxonomyTag {
  readonly value: string;
  readonly external_id: string | null;
  readonly child_count: number;
  readonly depth: number;
  readonly parent_value: string | null;
}

interface RawTagList {
  readonly count: number;
  readonly results: readonly RawTaxonomyTag[];
}

/**
 * Lists a taxonomy's tags (flattened) — the oracle for "the drawer shows the
 * imported parents and their nested children". `fullDepth` returns every tag in
 * one page rather than paginating parents-first.
 */
export async function listTaxonomyTags(
  request: APIRequestContext,
  config: AppConfig,
  taxonomyId: number,
): Promise<readonly TaxonomyTag[]> {
  const url = `${studioOrigin(config)}${TAGGING_BASE}/taxonomies/${taxonomyId}/tags/?full_depth_threshold=1000`;
  const raw = await studioJson<RawTagList>(
    await request.get(url, { headers: STUDIO_JSON_ACCEPT }),
    `Listing tags of taxonomy ${taxonomyId}`,
  );
  return raw.results.map((t) => ({
    value: t.value,
    externalId: t.external_id,
    childCount: t.child_count,
    depth: t.depth,
    parentValue: t.parent_value,
  }));
}

/** The download URL for a taxonomy export (the export modal / re-import step). */
export function taxonomyExportUrl(
  config: AppConfig,
  taxonomyId: number,
  format: 'csv' | 'json',
): string {
  return `${studioOrigin(config)}${TAGGING_BASE}/taxonomies/${taxonomyId}/export/?output_format=${format}&download=1`;
}

/** The download URL for the blank import template (the Download template button). */
export function taxonomyTemplateUrl(config: AppConfig, format: 'csv' | 'json'): string {
  return `${studioOrigin(config)}${TAGGING_BASE}/taxonomies/import/template.${format}`;
}

/** One applied tag on an object, with its full lineage (parents first). */
export interface AppliedTag {
  readonly value: string;
  /** Ancestry from the root parent down to this tag; a child lists its parent(s). */
  readonly lineage: readonly string[];
  readonly canDeleteObjectTag: boolean;
  readonly isCopied: boolean;
}

/** The tags applied to one object, grouped by taxonomy. */
export interface ObjectTaxonomyTags {
  readonly taxonomyId: number;
  readonly name: string;
  readonly canTagObject: boolean;
  readonly exportId: string;
  readonly tags: readonly AppliedTag[];
}

interface RawAppliedTag {
  readonly value: string;
  readonly lineage: readonly string[];
  readonly can_delete_objecttag: boolean;
  readonly is_copied: boolean;
}

interface RawObjectTaxonomy {
  readonly taxonomy_id: number;
  readonly name: string;
  readonly can_tag_object: boolean;
  readonly export_id: string;
  readonly tags: readonly RawAppliedTag[];
}

type RawObjectTags = Record<string, { readonly taxonomies: readonly RawObjectTaxonomy[] }>;

function toObjectTaxonomyTags(raw: RawObjectTaxonomy): ObjectTaxonomyTags {
  return {
    taxonomyId: raw.taxonomy_id,
    name: raw.name,
    canTagObject: raw.can_tag_object,
    exportId: raw.export_id,
    tags: raw.tags.map((t) => ({
      value: t.value,
      lineage: t.lineage,
      canDeleteObjectTag: t.can_delete_objecttag,
      isCopied: t.is_copied,
    })),
  };
}

/**
 * Reads the tags applied to one object (a course key or a block usage key) —
 * **the drawer oracle**. Returns one entry per taxonomy that has tags on the
 * object; an untagged object returns `[]`.
 */
export async function fetchObjectTags(
  request: APIRequestContext,
  config: AppConfig,
  objectId: string,
): Promise<readonly ObjectTaxonomyTags[]> {
  const url = `${studioOrigin(config)}${TAGGING_BASE}/object_tags/${encodeURIComponent(objectId)}/`;
  const raw = await studioJson<RawObjectTags>(
    await request.get(url, { headers: STUDIO_JSON_ACCEPT }),
    `Reading object tags of ${objectId}`,
  );
  const entry = raw[objectId];
  return (entry?.taxonomies ?? []).map(toObjectTaxonomyTags);
}

/**
 * Sets the tags for one object under one taxonomy — the drawer's Save. Passing
 * `[]` clears them. The tag values must exist in the taxonomy; an unknown value
 * is a `400`. Returns the object's tags after the write.
 *
 * Committing a child value implies its parents (the count then includes them);
 * removing the child removes the implied parents. The author may only tag a
 * course they have write access to — a refusal is a typed {@link ApiError} 403.
 */
export async function setObjectTags(
  request: APIRequestContext,
  config: AppConfig,
  objectId: string,
  taxonomyId: number,
  tags: readonly string[],
): Promise<readonly ObjectTaxonomyTags[]> {
  const url = `${studioOrigin(config)}${TAGGING_BASE}/object_tags/${encodeURIComponent(objectId)}/`;
  const response = await request.fetch(url, {
    method: 'PUT',
    data: { tagsData: [{ taxonomy: taxonomyId, tags }] },
    headers: await studioWriteHeaders(request, config),
  });
  const raw = await studioJson<RawObjectTags>(response, `Setting object tags on ${objectId}`, {
    forbiddenHint:
      'the session may not tag this object — object tags need write access to its course ' +
      '(openedx-authz manage_tags, held by the course creator)',
  });
  const entry = raw[objectId];
  return (entry?.taxonomies ?? []).map(toObjectTaxonomyTags);
}

/**
 * Reads the applied-tag count per object — what the card badge and the drawer's
 * taxonomy chip show. With `implicit` the count includes implied parents (a
 * single committed child reads as 2); without it, only explicit tags. An object
 * with no tags is **absent** from the result, so callers default to 0.
 */
export async function fetchObjectTagCounts(
  request: APIRequestContext,
  config: AppConfig,
  objectIds: readonly string[],
  options: { readonly implicit?: boolean } = {},
): Promise<Record<string, number>> {
  const keys = objectIds.map((id) => encodeURIComponent(id)).join(',');
  const query = options.implicit ? '?count_implicit' : '';
  const url = `${studioOrigin(config)}${TAGGING_BASE}/object_tag_counts/${keys}/${query}`;
  return studioJson<Record<string, number>>(
    await request.get(url, { headers: STUDIO_JSON_ACCEPT }),
    'Reading object tag counts',
  );
}

/** The count for one object, defaulting an absent key to 0. */
export function tagCountFor(counts: Record<string, number>, objectId: string): number {
  return counts[objectId] ?? 0;
}

/** The download URL for a course's object-tags export (the outline's "export tags"). */
export function objectTagsExportUrl(config: AppConfig, courseKey: string): string {
  return `${studioOrigin(config)}${TAGGING_BASE}/object_tags/${encodeURIComponent(courseKey)}/export/`;
}
