import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { STUDIO_JSON_ACCEPT, studioJson, studioOrigin, studioWrite } from './studio-origin';
import { XBLOCK_PATH } from './xblock';

/**
 * The course side of content libraries: importing a library item into a
 * course (which creates a course block *linked upstream* to it) and the
 * `/api/contentstore/v2/downstreams/` API that tracks the link and applies or
 * declines updates. Measured on Tutor `main` (2026-09-15, Epic 10 plan §1.4);
 * `release/verawood` has the same routes.
 */
export const DOWNSTREAMS_PATH = '/api/contentstore/v2/downstreams/';

/** `GET downstreams/<usage key>` — one course block's link to its library item. */
export interface DownstreamLink {
  readonly upstream_ref: string | null;
  readonly upstream_name: string | null;
  readonly downstream_key: string;
  readonly version_synced: number | null;
  readonly version_available: number | null;
  readonly version_declined: number | null;
  readonly error_message: string | null;
  /** Fields the course author overrode locally (`display_name`, `data`, …); they survive a sync. */
  readonly downstream_customized: readonly string[];
  readonly top_level_parent_key: string | null;
  readonly ready_to_sync: boolean;
  /** A link into the library MFE for the upstream item. */
  readonly upstream_link: string | null;
  readonly is_ready_to_sync_individually: boolean;
  /** Present for containers: children that have updates of their own. */
  readonly ready_to_sync_children?: readonly unknown[];
}

/** One row of `GET downstreams/?course_id=…`. */
export interface DownstreamListRow {
  readonly id: number;
  readonly upstream_context_key: string;
  readonly upstream_context_title: string;
  readonly upstream_key: string;
  readonly upstream_type: string;
  readonly upstream_version: number | null;
  readonly downstream_usage_key: string;
  readonly downstream_context_key: string;
  readonly version_synced: number | null;
  readonly version_declined: number | null;
  readonly ready_to_sync: boolean;
  readonly ready_to_sync_from_children: boolean;
  readonly top_level_parent_usage_key: string | null;
  readonly downstream_customized: readonly string[];
}

export interface ImportLibraryContentOptions {
  /** The course block the new block goes under: a vertical for a component, a sequential for a unit, a chapter for a subsection, the course for a section. */
  readonly parentLocator: string;
  /**
   * The course category of the new block — the library block's `block_type`
   * for a component, `vertical` / `sequential` / `chapter` for a unit /
   * subsection / section. **Required by the platform**: the `/xblock/` view
   * creates the block from it before syncing, and `500`s without it.
   */
  readonly category: string;
  /** The library item to link to: an `lb:` usage key or an `lct:` container key. */
  readonly libraryContentKey: string;
}

export interface ImportedLibraryContent {
  /** The new course block's usage key. */
  readonly locator: string;
  readonly upstreamRef: string;
  readonly staticFileNotices: {
    readonly new_files: readonly string[];
    readonly conflicting_files: readonly string[];
    readonly error_files: readonly string[];
  };
}

/**
 * Imports a library item into a course — what the unit page's "Library Content"
 * picker and the outline's Add sidebar do — and returns the new, upstream-linked
 * course block. The block is created with the library's current **published**
 * content; a component lands as a draft in its unit, a container is published
 * structure like any created chapter/sequential.
 */
export async function importLibraryContent(
  request: APIRequestContext,
  config: AppConfig,
  options: ImportLibraryContentOptions,
): Promise<ImportedLibraryContent> {
  const body = await studioWrite<{
    locator?: string;
    upstreamRef?: string;
    static_file_notices?: ImportedLibraryContent['staticFileNotices'];
    error?: string;
  }>(
    request,
    config,
    'POST',
    XBLOCK_PATH,
    `Importing ${options.libraryContentKey} under ${options.parentLocator}`,
    {
      parent_locator: options.parentLocator,
      category: options.category,
      library_content_key: options.libraryContentKey,
    },
  );
  if (typeof body?.locator !== 'string' || typeof body.upstreamRef !== 'string') {
    throw new ApiError(
      `Studio imported ${options.libraryContentKey} but returned no locator/upstreamRef.`,
      { status: 200, url: `${studioOrigin(config)}${XBLOCK_PATH}`, body: JSON.stringify(body) },
    );
  }
  return {
    locator: body.locator,
    upstreamRef: body.upstreamRef,
    staticFileNotices: body.static_file_notices ?? {
      new_files: [],
      conflicting_files: [],
      error_files: [],
    },
  };
}

export async function fetchDownstream(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<DownstreamLink> {
  const response = await request.get(`${studioOrigin(config)}${DOWNSTREAMS_PATH}${usageKey}`, {
    headers: STUDIO_JSON_ACCEPT,
  });
  return studioJson<DownstreamLink>(response, `Reading the library link of ${usageKey}`);
}

/** Every library link in a course; the course key is URL-encoded (its `+` would otherwise read as a space). */
export async function listDownstreams(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  options: { readonly readyToSync?: boolean } = {},
): Promise<readonly DownstreamListRow[]> {
  const params = new URLSearchParams({ course_id: courseKey, page_size: '100' });
  if (options.readyToSync !== undefined) params.set('ready_to_sync', String(options.readyToSync));
  const response = await request.get(`${studioOrigin(config)}${DOWNSTREAMS_PATH}?${params}`, {
    headers: STUDIO_JSON_ACCEPT,
  });
  const page = await studioJson<{ results: readonly DownstreamListRow[] }>(
    response,
    `Listing the library links of ${courseKey}`,
  );
  return page.results;
}

/** Applies the library's latest published version to the course block ("Accept changes"). */
export async function acceptSync(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<DownstreamLink> {
  return studioWrite<DownstreamLink>(
    request,
    config,
    'POST',
    `${DOWNSTREAMS_PATH}${usageKey}/sync`,
    `Accepting the library update for ${usageKey}`,
  );
}

/** Marks the available version declined ("Ignore changes"); `ready_to_sync` goes false. */
export async function declineSync(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<void> {
  await studioWrite<void>(
    request,
    config,
    'DELETE',
    `${DOWNSTREAMS_PATH}${usageKey}/sync`,
    `Declining the library update for ${usageKey}`,
  );
}

/** Severs the link; the course block keeps its content. */
