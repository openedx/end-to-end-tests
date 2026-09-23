import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { assertAdminPage, countAdminResultRows, decodeAdminEntities } from './django-admin';

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
  assertAdminPage(html, response.status(), url, `Reading the migration runs of ${query.scopeKey}`);
  return countAdminResultRows(html);
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

/** What one migration run recorded, as its read-only admin page renders it. */
export interface MigrationRunLedger {
  readonly pk: string;
  readonly total: number;
  readonly successCount: number;
  readonly errorCount: number;
  /**
   * One entry per assignment the run moved, naming the **legacy** role, the
   * scope and the account — the platform's own account of what it mapped, and
   * the oracle behind the five role-mapping cases.
   */
  readonly successes: readonly {
    readonly role: string;
    readonly scope: string;
    readonly subject: string;
  }[];
}

/**
 * The ledger of the most recent run for a scope, read from the run's admin
 * change page.
 *
 * The model is registered read-only and has no API, so its `metadata` JSON is
 * taken from the rendered page and decoded. Only the machine-readable values are
 * used — role keys, scope keys and usernames — never a label.
 */
export async function fetchMigrationRunLedger(
  adminSession: APIRequestContext,
  config: AppConfig,
  query: MigrationRunQuery,
): Promise<MigrationRunLedger | undefined> {
  const listUrl = migrationRunUrl(config, query);
  const listResponse = await adminSession.get(listUrl);
  const listHtml = await listResponse.text();
  assertAdminPage(
    listHtml,
    listResponse.status(),
    listUrl,
    `Reading the migration runs of ${query.scopeKey}`,
  );
  const pk = new RegExp(`${MIGRATION_RUN_ADMIN}/(\\d+)/change/`).exec(listHtml)?.[1];
  if (pk === undefined) return undefined;

  const runUrl = `${config.baseUrls.lms}${MIGRATION_RUN_ADMIN}/${pk}/change/`;
  const runResponse = await adminSession.get(runUrl);
  const runHtml = await runResponse.text();
  assertAdminPage(runHtml, runResponse.status(), runUrl, `Reading migration run ${pk}`);

  const decoded = decodeAdminEntities(runHtml.replace(/<[^>]+>/g, ' '));
  const start = decoded.indexOf('{');
  const metadata = start === -1 ? undefined : readJsonObject(decoded.slice(start));
  if (metadata === undefined) {
    throw new ApiError(`Migration run ${pk} rendered no readable metadata.`, {
      status: runResponse.status(),
      url: runUrl,
      body: decoded.slice(0, 300),
    });
  }
  return {
    pk,
    total: Number(metadata.total ?? 0),
    successCount: Number(metadata.success_count ?? 0),
    errorCount: Number(metadata.error_count ?? 0),
    successes: Array.isArray(metadata.successes)
      ? (metadata.successes as MigrationRunLedger['successes'])
      : [],
  };
}

/** The first balanced JSON object in `text`, or undefined when there is none. */
function readJsonObject(text: string): Record<string, unknown> | undefined {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(0, index + 1)) as Record<string, unknown>;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}
