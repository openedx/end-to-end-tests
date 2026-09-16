import { randomUUID } from 'node:crypto';

import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import type { LibraryContainerType } from '../config/selectors/library';
import { ApiError } from './errors';
import {
  STUDIO_JSON_ACCEPT,
  nonJsonPreview,
  studioOrigin,
  studioWriteHeaders,
} from './studio-origin';

/**
 * Content libraries v2 — the CMS `/api/libraries/v2/` API the library-authoring
 * MFE is built on. Measured on Tutor `main` (2026-09-15, see the Epic 10 plan
 * §1.2): DRF, JSON, authenticated by the **Studio session** (no JWT needed), so
 * in a browser test the author's `page.request` drives it. Writes carry Studio's
 * CSRF token like every other CMS write.
 *
 * Keys: a library is `lib:<org>:<slug>`, a component `lb:<org>:<slug>:<type>:<id>`,
 * a container `lct:<org>:<slug>:<unit|subsection|section>:<slug>`.
 */
export const LIBRARIES_V2_PATH = '/api/libraries/v2/';

export type LibraryAccessLevel = 'admin' | 'author' | 'read';

/** A library, as `GET /api/libraries/v2/<lib>/` returns it. */
export interface ContentLibrary {
  readonly id: string;
  readonly org: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly num_blocks: number;
  readonly last_published: string | null;
  readonly published_by: string;
  readonly last_draft_created: string | null;
  readonly last_draft_created_by: string;
  readonly allow_public_learning: boolean;
  readonly allow_public_read: boolean;
  readonly has_unpublished_changes: boolean;
  readonly has_unpublished_deletes: boolean;
  readonly license: string;
  readonly can_edit_library: boolean;
}

/** Fields shared by components and containers in every listing. */
export interface LibraryItem {
  readonly id: string;
  readonly display_name: string;
  readonly published_display_name: string | null;
  readonly tags_count: number;
  readonly last_published: string | null;
  readonly published_by: string | null;
  readonly last_draft_created: string | null;
  readonly last_draft_created_by: string | null;
  readonly has_unpublished_changes: boolean;
  readonly created: string;
  readonly modified: string;
  readonly collections: readonly { readonly key: string; readonly title: string }[];
  readonly can_stand_alone: boolean;
}

export interface LibraryBlock extends LibraryItem {
  readonly block_type: string;
}

export interface LibraryContainer extends LibraryItem {
  readonly container_type: LibraryContainerType;
  readonly container_type_code: LibraryContainerType;
}

export interface LibraryCollection {
  readonly id: number;
  /** The slugified title — what the MFE's `/collection/<key>` route uses. */
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly enabled: boolean;
  /** Numeric publishable-entity ids of the members (opaque; assert on the count). */
  readonly entities: readonly number[];
}

export interface LibraryHierarchyEntry {
  readonly id: string;
  readonly display_name: string;
  readonly has_unpublished_changes: boolean;
}

/** `GET …/hierarchy/`: every ancestor and descendant of an item, by level. */
export interface LibraryHierarchy {
  readonly sections: readonly LibraryHierarchyEntry[];
  readonly subsections: readonly LibraryHierarchyEntry[];
  readonly units: readonly LibraryHierarchyEntry[];
  readonly components: readonly LibraryHierarchyEntry[];
  readonly object_key: string;
}

export interface LibraryTeamMember {
  readonly access_level: LibraryAccessLevel;
  readonly email: string;
  readonly username: string;
  readonly group_name: string | null;
}

export interface LibraryPage<T> {
  readonly count: number;
  readonly num_pages: number;
  readonly current_page: number;
  readonly results: readonly T[];
}

/**
 * Raised when `DELETE /api/libraries/v2/<lib>/` answers `500`: the platform's
 * `delete_library` trips a `RestrictedError` for any library that has ever
 * held a container or a publish with side effects (`LIB-001`). Component-only
 * libraries delete fine. Fixtures catch this and leave the library behind.
 */
export class LibraryDeleteRestrictedError extends ApiError {
  constructor(libraryKey: string, details: { url: string; body: string }) {
    super(
      `Deleting ${libraryKey} failed (HTTP 500): the platform cannot delete a library that ` +
        'has held containers or published with side effects (LIB-001). Leaving it in place.',
      { status: 500, url: details.url, body: details.body },
    );
    this.name = 'LibraryDeleteRestrictedError';
  }
}

function libraryUrl(config: AppConfig, path: string): string {
  return `${studioOrigin(config)}${LIBRARIES_V2_PATH}${path}`;
}

async function libraryRead<T>(
  request: APIRequestContext,
  config: AppConfig,
  path: string,
  what: string,
): Promise<T> {
  const response = await request.get(libraryUrl(config, path), { headers: STUDIO_JSON_ACCEPT });
  return parse<T>(response, what);
}

async function libraryWrite<T>(
  request: APIRequestContext,
  config: AppConfig,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  what: string,
  data?: unknown,
): Promise<T> {
  const response = await request.fetch(libraryUrl(config, path), {
    method,
    data,
    headers: await studioWriteHeaders(request, config),
  });
  return parse<T>(response, what);
}

async function parse<T>(
  response: Awaited<ReturnType<APIRequestContext['fetch']>>,
  what: string,
): Promise<T> {
  const status = response.status();
  const text = await response.text();
  if (status === 403) {
    throw new ApiError(
      `${what} was refused (HTTP 403): the session is not a member of this library with the ` +
        `needed access level. ${nonJsonPreview(text)}`,
      { status, url: response.url(), body: text },
    );
  }
  if (!response.ok()) {
    throw new ApiError(`${what} failed (HTTP ${status}): ${nonJsonPreview(text)}`, {
      status,
      url: response.url(),
      body: text,
      retryable: status >= 500,
    });
  }
  if (status === 204 || text.trim() === '') {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(`${what} returned a non-JSON body: ${nonJsonPreview(text)}`, {
      status,
      url: response.url(),
      body: text.slice(0, 500),
      retryable: true,
    });
  }
}

// --- libraries -----------------------------------------------------------------

export interface CreateLibraryOptions {
  readonly org: string;
  /** Unique per library within the org; `[a-z0-9-_]` — see {@link newLibrarySlug}. */
  readonly slug: string;
  readonly title: string;
  readonly description?: string;
  readonly allowPublicRead?: boolean;
  readonly allowPublicLearning?: boolean;
}

/** A run-unique library slug, `e2e-<12 hex>` with an optional readable label. */
export function newLibrarySlug(label = ''): string {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  return label ? `e2e-${label}-${suffix}`.toLowerCase() : `e2e-${suffix}`;
}

/** The library key the platform will assign: `lib:<org>:<slug>`. */
export function libraryKeyFor(org: string, slug: string): string {
  return `lib:${org}:${slug}`;
}

/**
 * Raised when the slug is already taken in the org — the `400` the seed uses to
 * find a library from an earlier attempt instead of creating a second one.
 */
export class LibraryExistsError extends ApiError {
  constructor(libraryKey: string, details: { url: string; body: string }) {
    super(`Studio already has a library ${libraryKey}.`, {
      status: 400,
      url: details.url,
      body: details.body,
    });
    this.name = 'LibraryExistsError';
  }
}

export async function createLibrary(
  request: APIRequestContext,
  config: AppConfig,
  options: CreateLibraryOptions,
): Promise<ContentLibrary> {
  const url = libraryUrl(config, '');
  const response = await request.fetch(url, {
    method: 'POST',
    headers: await studioWriteHeaders(request, config),
    data: {
      org: options.org,
      slug: options.slug,
      title: options.title,
      description: options.description ?? '',
      allow_public_learning: options.allowPublicLearning ?? false,
      allow_public_read: options.allowPublicRead ?? false,
      license: '',
    },
  });
  if (response.status() === 400) {
    const body = await response.text();
    if (body.includes('already exists')) {
      throw new LibraryExistsError(libraryKeyFor(options.org, options.slug), { url, body });
    }
    throw new ApiError(
      `Creating library ${options.slug} failed (HTTP 400): ${nonJsonPreview(body)}`,
      {
        status: 400,
        url,
        body,
      },
    );
  }
  return parse<ContentLibrary>(response, `Creating library ${options.slug}`);
}

export async function fetchLibrary(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
): Promise<ContentLibrary> {
  return libraryRead(request, config, `${libraryKey}/`, `Reading library ${libraryKey}`);
}

export interface LibraryListQuery {
  readonly textSearch?: string;
  readonly org?: string;
  readonly order?: string;
  readonly pageSize?: number;
}

export async function listLibraries(
  request: APIRequestContext,
  config: AppConfig,
  query: LibraryListQuery = {},
): Promise<LibraryPage<ContentLibrary>> {
  const params = new URLSearchParams({ pagination: 'true' });
  if (query.textSearch) params.set('text_search', query.textSearch);
  if (query.org) params.set('org', query.org);
  if (query.order) params.set('order', query.order);
  if (query.pageSize) params.set('page_size', String(query.pageSize));
  return libraryRead(request, config, `?${params.toString()}`, 'Listing libraries');
}

export interface UpdateLibraryOptions {
  readonly title?: string;
  readonly description?: string;
  readonly allowPublicRead?: boolean;
  readonly allowPublicLearning?: boolean;
}

export async function updateLibrary(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  options: UpdateLibraryOptions,
): Promise<ContentLibrary> {
  return libraryWrite(
    request,
    config,
    'PATCH',
    `${libraryKey}/`,
    `Updating library ${libraryKey}`,
    {
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.description === undefined ? {} : { description: options.description }),
      ...(options.allowPublicRead === undefined
        ? {}
        : { allow_public_read: options.allowPublicRead }),
      ...(options.allowPublicLearning === undefined
        ? {}
        : { allow_public_learning: options.allowPublicLearning }),
    },
  );
}

/**
 * Deletes a library. Throws {@link LibraryDeleteRestrictedError} on the platform's
 * `500` (`LIB-001`) so a fixture can distinguish "cannot be deleted" from a
 * broken session.
 */
export async function deleteLibrary(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
): Promise<void> {
  const url = libraryUrl(config, `${libraryKey}/`);
  const response = await request.fetch(url, {
    method: 'DELETE',
    headers: await studioWriteHeaders(request, config),
  });
  if (response.status() === 500) {
    throw new LibraryDeleteRestrictedError(libraryKey, { url, body: await response.text() });
  }
  await parse<void>(response, `Deleting library ${libraryKey}`);
}

export async function fetchLibraryBlockTypes(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
): Promise<readonly { block_type: string; display_name: string }[]> {
  return libraryRead(
    request,
    config,
    `${libraryKey}/block_types/`,
    `Reading the block types of ${libraryKey}`,
  );
}

/** Publishes every draft in the library ("Publish all"). */
export async function commitLibrary(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
): Promise<void> {
  await libraryWrite<void>(
    request,
    config,
    'POST',
    `${libraryKey}/commit/`,
    `Publishing ${libraryKey}`,
  );
}

/** Discards every draft change in the library ("Discard changes"). */
export async function revertLibrary(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
): Promise<void> {
  await libraryWrite<void>(
    request,
    config,
    'DELETE',
    `${libraryKey}/commit/`,
    `Discarding the drafts of ${libraryKey}`,
  );
}

// --- blocks (components) ----------------------------------------------------------

export interface CreateLibraryBlockOptions {
  readonly blockType: string;
  /** The last key segment; unique within the library. Defaults to a run-unique id. */
  readonly definitionId?: string;
  readonly canStandAlone?: boolean;
}

export async function createLibraryBlock(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  options: CreateLibraryBlockOptions,
): Promise<LibraryBlock> {
  return libraryWrite(
    request,
    config,
    'POST',
    `${libraryKey}/blocks/`,
    `Creating a ${options.blockType} block in ${libraryKey}`,
    {
      block_type: options.blockType,
      definition_id: options.definitionId ?? newLibrarySlug(options.blockType),
      ...(options.canStandAlone === undefined ? {} : { can_stand_alone: options.canStandAlone }),
    },
  );
}

export async function listLibraryBlocks(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
): Promise<LibraryPage<LibraryBlock>> {
  return libraryRead(
    request,
    config,
    `${libraryKey}/blocks/?pagination=true&page_size=100`,
    `Listing the blocks of ${libraryKey}`,
  );
}

export async function fetchLibraryBlock(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<LibraryBlock> {
  return libraryRead(request, config, `blocks/${usageKey}/`, `Reading library block ${usageKey}`);
}

export async function deleteLibraryBlock(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<void> {
  await libraryWrite<void>(
    request,
    config,
    'DELETE',
    `blocks/${usageKey}/`,
    `Deleting ${usageKey}`,
  );
}

export async function restoreLibraryBlock(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<void> {
  await libraryWrite<void>(
    request,
    config,
    'POST',
    `blocks/${usageKey}/restore/`,
    `Restoring ${usageKey}`,
  );
}

export async function publishLibraryBlock(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<void> {
  await libraryWrite<void>(
    request,
    config,
    'POST',
    `blocks/${usageKey}/publish/`,
    `Publishing ${usageKey}`,
  );
}

export async function fetchLibraryBlockOlx(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<string> {
  const body = await libraryRead<{ olx: string }>(
    request,
    config,
    `blocks/${usageKey}/olx/`,
    `Reading the OLX of ${usageKey}`,
  );
  return body.olx;
}

/** Sets a block's OLX; returns the new draft `version_num`. */
export async function setLibraryBlockOlx(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
  olx: string,
): Promise<number> {
  const body = await libraryWrite<{ olx: string; version_num: number }>(
    request,
    config,
    'POST',
    `blocks/${usageKey}/olx/`,
    `Writing the OLX of ${usageKey}`,
    { olx },
  );
  return body.version_num;
}

/** A static asset attached to a library block (a transcript, an image). */
export interface LibraryBlockAsset {
  readonly path: string;
  readonly url: string;
  readonly size: number;
}

export async function fetchLibraryBlockAssets(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<readonly LibraryBlockAsset[]> {
  const body = await libraryRead<{ files: readonly LibraryBlockAsset[] }>(
    request,
    config,
    `blocks/${usageKey}/assets/`,
    `Listing the assets of ${usageKey}`,
  );
  return body.files;
}

export async function fetchBlockHierarchy(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<LibraryHierarchy> {
  return libraryRead(
    request,
    config,
    `blocks/${usageKey}/hierarchy/`,
    `Reading the hierarchy of ${usageKey}`,
  );
}

/** OLX for the library block types the specs author, carrying the test's own text. */
export const libraryOlx = {
  html: (displayName: string, text: string) =>
    `<html display_name="${escapeXml(displayName)}"><p>${escapeXml(text)}</p></html>`,
  video: (displayName: string, youtubeId: string, times: { start?: number; end?: number } = {}) =>
    `<video display_name="${escapeXml(displayName)}" youtube_id_1_0="${youtubeId}"` +
    (times.start === undefined ? '' : ` start_time="${secondsToClock(times.start)}"`) +
    (times.end === undefined ? '' : ` end_time="${secondsToClock(times.end)}"`) +
    ' />',
  pdf: (displayName: string, url: string) =>
    `<pdf display_name="${escapeXml(displayName)}" url="${escapeXml(url)}" />`,
} as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function secondsToClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

// --- containers (units, subsections, sections) ------------------------------------

export async function createLibraryContainer(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  containerType: LibraryContainerType,
  displayName: string,
): Promise<LibraryContainer> {
  return libraryWrite(
    request,
    config,
    'POST',
    `${libraryKey}/containers/`,
    `Creating a ${containerType} in ${libraryKey}`,
    { container_type: containerType, display_name: displayName },
  );
}

export async function fetchLibraryContainer(
  request: APIRequestContext,
  config: AppConfig,
  containerKey: string,
): Promise<LibraryContainer> {
  return libraryRead(
    request,
    config,
    `containers/${containerKey}/`,
    `Reading container ${containerKey}`,
  );
}

export async function renameLibraryContainer(
  request: APIRequestContext,
  config: AppConfig,
  containerKey: string,
  displayName: string,
): Promise<LibraryContainer> {
  return libraryWrite(
    request,
    config,
    'PATCH',
    `containers/${containerKey}/`,
    `Renaming ${containerKey}`,
    {
      display_name: displayName,
    },
  );
}

export async function deleteLibraryContainer(
  request: APIRequestContext,
  config: AppConfig,
  containerKey: string,
): Promise<void> {
  await libraryWrite<void>(
    request,
    config,
    'DELETE',
    `containers/${containerKey}/`,
    `Deleting ${containerKey}`,
  );
}

export async function publishLibraryContainer(
  request: APIRequestContext,
  config: AppConfig,
  containerKey: string,
): Promise<void> {
  await libraryWrite<void>(
    request,
    config,
    'POST',
    `containers/${containerKey}/publish/`,
    `Publishing ${containerKey}`,
  );
}

/** A container's direct children (components of a unit, units of a subsection, …). */
export async function fetchLibraryContainerChildren(
  request: APIRequestContext,
  config: AppConfig,
  containerKey: string,
): Promise<readonly (LibraryBlock | LibraryContainer)[]> {
  return libraryRead(
    request,
    config,
    `containers/${containerKey}/children/`,
    `Reading the children of ${containerKey}`,
  );
}

/** Appends existing library items to a container. */
export async function addContainerChildren(
  request: APIRequestContext,
  config: AppConfig,
  containerKey: string,
  usageKeys: readonly string[],
): Promise<LibraryContainer> {
  return libraryWrite(
    request,
    config,
    'POST',
    `containers/${containerKey}/children/`,
    `Adding children to ${containerKey}`,
    { usage_keys: usageKeys },
  );
}

/** Removes items from a container; the items stay in the library. */
export async function removeContainerChildren(
  request: APIRequestContext,
  config: AppConfig,
  containerKey: string,
  usageKeys: readonly string[],
): Promise<LibraryContainer> {
  return libraryWrite(
    request,
    config,
    'DELETE',
    `containers/${containerKey}/children/`,
    `Removing children from ${containerKey}`,
    { usage_keys: usageKeys },
  );
}

export async function fetchContainerHierarchy(
  request: APIRequestContext,
  config: AppConfig,
  containerKey: string,
): Promise<LibraryHierarchy> {
  return libraryRead(
    request,
    config,
    `containers/${containerKey}/hierarchy/`,
    `Reading the hierarchy of ${containerKey}`,
  );
}

// --- collections ---------------------------------------------------------------------

export async function createCollection(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  title: string,
  description = '',
): Promise<LibraryCollection> {
  return libraryWrite(
    request,
    config,
    'POST',
    `${libraryKey}/collections/`,
    `Creating collection "${title}" in ${libraryKey}`,
    { title, description },
  );
}

export async function fetchCollection(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  collectionKey: string,
): Promise<LibraryCollection> {
  return libraryRead(
    request,
    config,
    `${libraryKey}/collections/${collectionKey}/`,
    `Reading collection ${collectionKey}`,
  );
}

export async function listCollections(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
): Promise<LibraryPage<LibraryCollection>> {
  return libraryRead(
    request,
    config,
    `${libraryKey}/collections/?pagination=true&page_size=100`,
    `Listing the collections of ${libraryKey}`,
  );
}

export async function deleteCollection(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  collectionKey: string,
): Promise<void> {
  await libraryWrite<void>(
    request,
    config,
    'DELETE',
    `${libraryKey}/collections/${collectionKey}/`,
    `Deleting collection ${collectionKey}`,
  );
}

/** Adds items to a collection; returns the number of items affected. */
export async function addCollectionItems(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  collectionKey: string,
  usageKeys: readonly string[],
): Promise<number> {
  const body = await libraryWrite<{ count: number }>(
    request,
    config,
    'PATCH',
    `${libraryKey}/collections/${collectionKey}/items/`,
    `Adding items to collection ${collectionKey}`,
    { usage_keys: usageKeys },
  );
  return body.count;
}

export async function removeCollectionItems(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  collectionKey: string,
  usageKeys: readonly string[],
): Promise<number> {
  const body = await libraryWrite<{ count: number }>(
    request,
    config,
    'DELETE',
    `${libraryKey}/collections/${collectionKey}/items/`,
    `Removing items from collection ${collectionKey}`,
    { usage_keys: usageKeys },
  );
  return body.count;
}

// --- team ---------------------------------------------------------------------------------

export async function fetchLibraryTeam(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
): Promise<readonly LibraryTeamMember[]> {
  return libraryRead(request, config, `${libraryKey}/team/`, `Reading the team of ${libraryKey}`);
}

export async function addLibraryTeamMember(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  email: string,
  accessLevel: LibraryAccessLevel,
): Promise<LibraryTeamMember> {
  return libraryWrite(
    request,
    config,
    'POST',
    `${libraryKey}/team/`,
    `Adding ${email} to ${libraryKey} as ${accessLevel}`,
    { email, access_level: accessLevel },
  );
}

export async function setLibraryTeamMemberLevel(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  username: string,
  accessLevel: LibraryAccessLevel,
): Promise<LibraryTeamMember> {
  return libraryWrite(
    request,
    config,
    'PUT',
    `${libraryKey}/team/user/${username}/`,
    `Setting ${username} to ${accessLevel} on ${libraryKey}`,
    { access_level: accessLevel },
  );
}

export async function removeLibraryTeamMember(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  username: string,
): Promise<void> {
  await libraryWrite<void>(
    request,
    config,
    'DELETE',
    `${libraryKey}/team/user/${username}/`,
    `Removing ${username} from ${libraryKey}`,
  );
}

// --- clipboard ------------------------------------------------------------------------

/**
 * Pastes the user's server-side clipboard (see `clipboard.ts`) into the library
 * as a new component — the MFE's "Paste from clipboard" in the Add Content
 * sidebar. Returns the new block.
 */
export async function pasteClipboardIntoLibrary(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
): Promise<LibraryBlock> {
  return libraryWrite(
    request,
    config,
    'POST',
    `${libraryKey}/paste_clipboard/`,
    `Pasting the clipboard into ${libraryKey}`,
    {},
  );
}
