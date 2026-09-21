import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';

/**
 * Reading the platform's **Course Authoring Migration Run** records, which have
 * no REST API: the model is registered read-only in the LMS Django admin
 * (`openedx_authz`), and that change list is the only way to see them.
 *
 * A run is written **only** by the automatic path — the `post_save` handler on a
 * waffle override, where the target sets
 * `ENABLE_AUTOMATIC_AUTHZ_COURSE_AUTHORING_MIGRATION`. The management commands
 * migrate without recording anything (measured, Epic 12 plan §1.8.4), so "no run
 * appeared" is also the signal that a target migrates manually, or not at all.
 *
 * **Nothing here reads displayed text.** The admin renders every value through
 * its localized label ("Organization", "AuthZ to Legacy", "Completed"), so the
 * filters do the work instead: Django's change list takes the model's *raw*
 * values as `?<field>__exact=`, and the rows are counted structurally. An empty
 * result renders no result table at all.
 */
export const MIGRATION_RUN_ADMIN = '/admin/openedx_authz/authzcourseauthoringmigrationrun';

/** Which direction a run moved roles in. */
export type MigrationType = 'forward' | 'rollback';

/** A run's lifecycle state, as the model defines it. */
export type MigrationStatus = 'running' | 'completed' | 'partial_success' | 'failed' | 'skipped';

export interface MigrationRunQuery {
  /** The course key or organization short name the run was for. */
  readonly scopeKey: string;
  readonly migrationType?: MigrationType;
  readonly status?: MigrationStatus;
}

function migrationRunUrl(config: AppConfig, query: MigrationRunQuery): string {
  const params = new URLSearchParams({ q: query.scopeKey });
  if (query.migrationType !== undefined) params.set('migration_type__exact', query.migrationType);
  if (query.status !== undefined) params.set('status__exact', query.status);
  return `${config.baseUrls.lms}${MIGRATION_RUN_ADMIN}/?${params.toString()}`;
}

/** The rows of a Django admin change list, counted without reading their cells. */
function countResultRows(html: string): number {
  const table = /<table id="result_list"[\s\S]*?<\/table>/.exec(html)?.[0];
  if (table === undefined) return 0; // No matches: the admin renders no result table.
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table)?.[1] ?? '';
  return [...body.matchAll(/<tr[^>]*>/g)].length;
}

/**
 * How many migration runs the target recorded for a scope, optionally narrowed
 * to a direction and a status.
 *
 * Needs an **LMS Django session** for a superuser (the admin refuses the
 * captured staff API state), so callers run it under the admin lock.
 */
export async function countMigrationRuns(
  adminSession: APIRequestContext,
  config: AppConfig,
  query: MigrationRunQuery,
): Promise<number> {
  const url = migrationRunUrl(config, query);
  const response = await adminSession.get(url);
  const html = await response.text();
  if (!response.ok()) {
    throw new ApiError(
      `Reading the migration runs of ${query.scopeKey} failed (HTTP ${response.status()}). The ` +
        'context must hold an LMS Django session for a superuser.',
      { status: response.status(), url, body: html.slice(0, 300) },
    );
  }
  return countResultRows(html);
}

/**
 * Whether the target recorded a **completed** run of `migrationType` for a
 * scope — the oracle behind "enabling the flag migrated this course" and its
 * rollback, and the signal that a target migrates automatically at all.
 */
export async function hasCompletedMigrationRun(
  adminSession: APIRequestContext,
  config: AppConfig,
  scopeKey: string,
  migrationType: MigrationType,
): Promise<boolean> {
  const count = await countMigrationRuns(adminSession, config, {
    scopeKey,
    migrationType,
    status: 'completed',
  });
  return count > 0;
}
