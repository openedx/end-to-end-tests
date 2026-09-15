import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { STUDIO_JSON_ACCEPT, studioJson, studioOrigin, studioWrite } from './studio-origin';
import { createXBlock } from './xblock';

/**
 * Legacy (modulestore, `library-v1:`) content libraries and the tool that
 * migrates them into v2 libraries. Measured on Tutor `main` (2026-09-15, Epic 10
 * plan §1.5). Legacy libraries are created by the legacy Studio view
 * (`POST /library/`, course-creator gated) and cannot be deleted through any
 * API (`DELETE` → `405`), so a spec creates as few as it can.
 */
export const LEGACY_LIBRARY_PATH = '/library/';
export const STUDIO_HOME_LIBRARIES_PATH = '/api/contentstore/v1/home/libraries';
export const MIGRATOR_PATH = '/api/modulestore_migrator/v1/';

export interface LegacyLibraryCreation {
  readonly org: string;
  /** The library "number" — the second segment of `library-v1:<org>+<number>`. */
  readonly number: string;
  readonly displayName: string;
}

/** The key Studio assigns: `library-v1:<org>+<number>`. */
export function legacyLibraryKeyFor(org: string, number: string): string {
  return `library-v1:${org}+${number}`;
}

/** The root block every legacy library's content hangs off. */
export function legacyLibraryRootUsageKey(libraryKey: string): string {
  return `lib-block-v1:${libraryKey.slice('library-v1:'.length)}+type@library+block@library`;
}

export async function createLegacyLibrary(
  request: APIRequestContext,
  config: AppConfig,
  options: LegacyLibraryCreation,
): Promise<string> {
  const body = await studioWrite<{ library_key?: string; url?: string; ErrMsg?: string }>(
    request,
    config,
    'POST',
    LEGACY_LIBRARY_PATH,
    `Creating legacy library ${options.org}+${options.number}`,
    { org: options.org, library: options.number, display_name: options.displayName },
  );
  if (typeof body?.library_key !== 'string') {
    throw new ApiError(
      `Studio did not create legacy library ${options.org}+${options.number}: ${body?.ErrMsg ?? 'no key returned'}`,
      {
        status: 200,
        url: `${studioOrigin(config)}${LEGACY_LIBRARY_PATH}`,
        body: JSON.stringify(body),
      },
    );
  }
  return body.library_key;
}

/** Adds a component to a legacy library; returns its `lib-block-v1:` usage key. */
export async function addLegacyLibraryBlock(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  category: 'html' | 'problem' | 'video',
  displayName: string,
): Promise<string> {
  return createXBlock(request, config, {
    parentLocator: legacyLibraryRootUsageKey(libraryKey),
    category,
    displayName,
  });
}

/** A legacy library as Studio Home's Libraries API lists it. */
export interface LegacyLibrary {
  readonly display_name: string;
  readonly library_key: string;
  readonly org: string;
  readonly number: string;
  readonly can_edit: boolean;
  readonly is_migrated: boolean;
  readonly migrated_to_key?: string;
  readonly migrated_to_title?: string;
  readonly migrated_to_collection_key?: string;
  readonly migrated_to_collection_title?: string;
}

export async function listLegacyLibraries(
  request: APIRequestContext,
  config: AppConfig,
): Promise<readonly LegacyLibrary[]> {
  const response = await request.get(`${studioOrigin(config)}${STUDIO_HOME_LIBRARIES_PATH}`, {
    headers: STUDIO_JSON_ACCEPT,
  });
  const body = await studioJson<{ libraries: readonly LegacyLibrary[] }>(
    response,
    'Listing legacy libraries',
  );
  return body.libraries;
}

// --- migration -------------------------------------------------------------------

/** `Pending`, `In Progress`, `Succeeded` or `Failed` (the platform's `state_text` vocabulary). */
export type MigrationState = string;

export interface MigrationTask {
  readonly uuid: string;
  readonly state: MigrationState;
  readonly state_text: string;
  readonly completed_steps: number;
  readonly total_steps: number;
  readonly attempts: number;
  readonly created: string;
  readonly modified: string;
  readonly parameters: readonly {
    readonly source: string;
    readonly composition_level: string;
    readonly repeat_handling_strategy: string;
    readonly preserve_url_slugs: boolean;
    readonly create_collection: boolean;
    readonly target_collection: { readonly key: string; readonly title: string } | null;
    readonly forward_source_to_target: boolean | null;
    readonly is_failed: boolean;
  }[];
}

export interface MigrationOptions {
  /** `component` (default) keeps only components; `unit` and above keep structure. */
  readonly compositionLevel?: 'component' | 'unit' | 'subsection' | 'section';
  readonly repeatHandlingStrategy?: 'skip' | 'fork' | 'update';
  readonly preserveUrlSlugs?: boolean;
  /** Put the migrated content in a collection named after the legacy library. */
  readonly createCollection?: boolean;
  /** Re-point courses using the legacy library at the v2 content. */
  readonly forwardSourceToTarget?: boolean;
}

function migrationBody(options: MigrationOptions): Record<string, unknown> {
  return {
    composition_level: options.compositionLevel ?? 'component',
    repeat_handling_strategy: options.repeatHandlingStrategy ?? 'skip',
    preserve_url_slugs: options.preserveUrlSlugs ?? true,
    create_collection: options.createCollection ?? true,
    forward_source_to_target: options.forwardSourceToTarget ?? true,
  };
}

/** Queues the migration of one legacy library into a v2 library; returns the task. */
export async function startMigration(
  request: APIRequestContext,
  config: AppConfig,
  sourceLibraryKey: string,
  targetLibraryKey: string,
  options: MigrationOptions = {},
): Promise<MigrationTask> {
  return studioWrite<MigrationTask>(
    request,
    config,
    'POST',
    `${MIGRATOR_PATH}migrations/`,
    `Migrating ${sourceLibraryKey} into ${targetLibraryKey}`,
    { source: sourceLibraryKey, target: targetLibraryKey, ...migrationBody(options) },
  );
}

/** Queues the migration of several legacy libraries into one v2 library. */
export async function startBulkMigration(
  request: APIRequestContext,
  config: AppConfig,
  sourceLibraryKeys: readonly string[],
  targetLibraryKey: string,
  options: MigrationOptions = {},
): Promise<readonly MigrationTask[]> {
  const body = await studioWrite<unknown>(
    request,
    config,
    'POST',
    `${MIGRATOR_PATH}bulk_migration/`,
    `Migrating ${sourceLibraryKeys.length} legacy libraries into ${targetLibraryKey}`,
    { sources: sourceLibraryKeys, target: targetLibraryKey, ...migrationBody(options) },
  );
  if (Array.isArray(body)) {
    return body as readonly MigrationTask[];
  }
  return [body as MigrationTask];
}

/**
 * Reads a migration task. Returns `undefined` while the task is not yet visible:
 * right after `POST migrations/` the retrieve view (filtered by migration event
 * and user) can answer `404` for a moment before the row it joins on exists, so
 * a caller polls until a task comes back and then until it settles.
 */
export async function fetchMigration(
  request: APIRequestContext,
  config: AppConfig,
  uuid: string,
): Promise<MigrationTask | undefined> {
  const response = await request.get(`${studioOrigin(config)}${MIGRATOR_PATH}migrations/${uuid}/`, {
    headers: STUDIO_JSON_ACCEPT,
  });
  if (response.status() === 404) {
    return undefined;
  }
  return studioJson<MigrationTask>(response, `Reading migration ${uuid}`);
}

/** True once a migration task will not change any more. */
export function isMigrationSettled(task: MigrationTask): boolean {
  const state = task.state.toLowerCase();
  return state === 'succeeded' || state === 'failed';
}
