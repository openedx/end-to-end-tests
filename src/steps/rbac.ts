import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { TIMEOUTS } from '../config';
import {
  ApiError,
  AUTHZ_BASE,
  AUTHZ_COURSE_AUTHORING_FLAG,
  assignRole,
  clearCourseFlagOverride,
  clearOrgFlagOverride,
  countMigrationRuns,
  isAuthzEnabledForCourse,
  setCourseFlagOverride,
  fetchCourseIndex,
  fetchCourseOutline,
  fetchInstructorCourse,
  listEnrollments,
  listReports,
  setOrgFlagOverride,
  updateXBlock,
  type MigrationType,
} from '../api';
import { pollUntil, type PollOutcome } from './poll';

/**
 * Turning AuthZ course authoring on and off for **one scope at a time**, and
 * telling which of the two migration models a target follows.
 *
 * `authz.enable_course_authoring` is a `CourseWaffleFlag`, so an override names
 * a single course or organization and leaves every other course alone — that is
 * what lets this coverage run in parallel with the rest of the suite. Two facts
 * from the Epic 12 probe shape everything here:
 *
 * - **Turning the flag on is only half a step.** A course whose flag is on but
 *   whose roles were never migrated has *no* authz assignments, so its team is
 *   locked out of Studio. Callers migrate (automatic targets do it inside the
 *   same request) or assign authz roles themselves.
 * - **Override rows cannot be deleted.** Turning an override off means adding a
 *   disabled row; where the target migrates automatically, that same save rolls
 *   the scope back, restoring the legacy roles.
 *
 * Every write here needs an **LMS Django session** for a superuser and runs
 * under the cross-worker admin lock; the reads ride any authenticated context.
 */

/** Whether a target migrates roles by itself when a waffle override is saved. */
export type MigrationMode = 'automatic' | 'manual';

/** What {@link probeMigrationMode} concluded, and the evidence for it. */
export interface MigrationModeProbe {
  readonly mode: MigrationMode;
  /** Human-readable evidence, for a skip reason or a failure message. */
  readonly evidence: string;
}

/**
 * Decides whether the target migrates automatically, **without touching a single
 * course**: it saves an organization override for an organization that has no
 * courses, looks for the migration run that a migrating target records even for
 * an empty scope (measured: `total: 0`, status `completed`), and neutralizes the
 * override again.
 *
 * `org` must be a name no course uses — the caller makes it run-unique.
 */
export async function probeMigrationMode(
  adminSession: APIRequestContext,
  config: AppConfig,
  org: string,
): Promise<MigrationModeProbe> {
  const note = `e2e authz migration-mode probe (${org})`;
  await setOrgFlagOverride(adminSession, config, org, {
    flag: AUTHZ_COURSE_AUTHORING_FLAG,
    choice: 'on',
    enabled: true,
    note,
  });
  try {
    const runs = await countMigrationRuns(adminSession, config, { scopeKey: org });
    return runs > 0
      ? {
          mode: 'automatic',
          evidence: `saving a waffle override for the empty organization ${org} recorded ${runs} migration run(s)`,
        }
      : {
          mode: 'manual',
          evidence:
            `saving a waffle override for the empty organization ${org} recorded no migration ` +
            'run, so this target does not set ENABLE_AUTOMATIC_AUTHZ_COURSE_AUTHORING_MIGRATION',
        };
  } finally {
    await clearOrgFlagOverride(adminSession, config, org, AUTHZ_COURSE_AUTHORING_FLAG, note);
  }
}

/**
 * Waits for a completed migration run of `migrationType` to be recorded for a
 * scope. On a healthy target the run is already there when the override save
 * returns (it happens inside that request), so this is headroom for a loaded
 * CMS rather than the normal path. Never throws: the outcome carries the last
 * count so a spec's failure message says what the admin actually listed.
 */
export async function waitForMigrationRun(
  adminSession: APIRequestContext,
  config: AppConfig,
  scopeKey: string,
  migrationType: MigrationType,
  timeoutMs: number = TIMEOUTS.rbacMigration,
): Promise<PollOutcome<number>> {
  return pollUntil(
    () =>
      countMigrationRuns(adminSession, config, {
        scopeKey,
        migrationType,
        status: 'completed',
      }),
    (count) => count > 0,
    timeoutMs,
  );
}

/** Waits until the flag state document reports `expected` for a course. */
export async function waitForCourseFlagState(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  expected: boolean,
  timeoutMs: number = TIMEOUTS.rbacMigration,
): Promise<PollOutcome<boolean>> {
  return pollUntil(
    () => isAuthzEnabledForCourse(request, config, courseKey),
    (enabled) => enabled === expected,
    timeoutMs,
  );
}

/** What enabling AuthZ for a course did, for the spec to assert on. */
export interface AuthzEnableOutcome {
  readonly courseKey: string;
  /** Whether the flag state document lists the course as enabled. */
  readonly enabled: boolean;
  /** Whether a completed forward migration run was recorded (automatic targets). */
  readonly migrated: boolean;
}

/**
 * Forces AuthZ course authoring **on** for one course and, where the target
 * migrates automatically, waits for the forward run that the same save
 * triggered. A caller on a manual target must assign the authz roles it needs
 * itself — otherwise the course's team loses Studio access.
 */
export async function enableAuthzForCourse(
  adminSession: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  options: { readonly mode: MigrationMode; readonly note?: string },
): Promise<AuthzEnableOutcome> {
  await setCourseFlagOverride(adminSession, config, courseKey, {
    flag: AUTHZ_COURSE_AUTHORING_FLAG,
    choice: 'on',
    enabled: true,
    note: options.note ?? 'e2e authz coverage',
  });
  const flagState = await waitForCourseFlagState(adminSession, config, courseKey, true);
  const migrated =
    options.mode === 'automatic'
      ? (await waitForMigrationRun(adminSession, config, courseKey, 'forward')).satisfied
      : false;
  return { courseKey, enabled: flagState.last, migrated };
}

/**
 * Neutralizes a course's override, so the flag falls back to the org or global
 * state. On an automatic target this is also the rollback: the same save
 * restores the legacy roles and clears the authz assignments.
 */
export async function disableAuthzForCourse(
  adminSession: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  options: { readonly mode: MigrationMode; readonly note?: string } = { mode: 'manual' },
): Promise<{ readonly enabled: boolean; readonly rolledBack: boolean }> {
  await clearCourseFlagOverride(
    adminSession,
    config,
    courseKey,
    AUTHZ_COURSE_AUTHORING_FLAG,
    options.note ?? 'e2e authz coverage teardown',
  );
  const flagState = await waitForCourseFlagState(adminSession, config, courseKey, false);
  const rolledBack =
    options.mode === 'automatic'
      ? (await waitForMigrationRun(adminSession, config, courseKey, 'rollback')).satisfied
      : false;
  return { enabled: flagState.last, rolledBack };
}

/**
 * Gives every actor each of `roles` in one scope, so a spec can reach a row
 * count the console pages at without provisioning a person per row.
 *
 * Assignments are per role, not per user: three accounts holding four library
 * roles each are twelve rows (measured), which is what the sheet's
 * "12+ members" pagination case needs.
 */
export async function seedScopeAssignments(
  request: APIRequestContext,
  config: AppConfig,
  scope: string,
  usernames: readonly string[],
  roles: readonly string[],
): Promise<number> {
  for (const role of roles) {
    // Seeding is idempotent: the cast of accounts the RBAC specs share plays the
    // same part in course after course, so an account often already holds the
    // role a later case wants. The API reports that as an `errors[]` row
    // (`user_already_has_role`) rather than a failure, and for a seed it is the
    // wanted state — anything else still raises.
    const result = await assignRole(
      request,
      config,
      { role, scopes: [scope], users: [...usernames] },
      { allowErrors: true },
    );
    const unexpected = result.errors.filter((row) => row.error !== 'user_already_has_role');
    if (unexpected.length > 0) {
      throw new ApiError(
        `Seeding ${role} in ${scope} failed for ${unexpected
          .map((row) => `${row.userIdentifier}: ${row.error ?? 'unknown error'}`)
          .join('; ')}.`,
        { status: 207, url: `${AUTHZ_BASE}/roles/users/`, body: JSON.stringify(result) },
      );
    }
  }
  return usernames.length * roles.length;
}

// --- the permission matrix --------------------------------------------------------------------

/**
 * The capabilities one course-role reading covers, by a **non-localized** name.
 *
 * Each is one request the role either may or may not make, chosen so the six of
 * them tell every legacy role apart (measured 2026-09-21 on `main`): the Studio
 * outline separates `staff` from `limited_staff`, the enrollment list separates
 * `limited_staff` from `data_researcher`, the instructor dashboard separates
 * both from a `beta_testers` holder, and the Blocks API separates an enrolled
 * learner from an account with no relationship to the course at all.
 *
 * The same table is read again after a migration and after a rollback
 * (TC-00593–00599, TC-00606–00612), which is the point of naming the rows: a
 * regression is one row's diff, and the failure message says which capability
 * moved.
 */
export const COURSE_CAPABILITIES = [
  'studioOutline',
  'studioWrite',
  'instructorDashboard',
  'dataDownloads',
  'enrollmentList',
  'courseware',
] as const;

export type CourseCapability = (typeof COURSE_CAPABILITIES)[number];

/** One actor's reading of the matrix: an HTTP status per capability. */
export type PermissionReadings = Record<CourseCapability, number>;

/** What {@link readCoursePermissions} needs in order to attempt a write. */
export interface PermissionProbeTargets {
  /**
   * A block the actor may try to rename — the Studio write probe. It is renamed
   * to a value derived from the actor's own username, so a successful write is
   * visible to the caller and harmless to everything else.
   */
  readonly writableBlock: string;
}

/** The status an API call answered with, or `200` when it succeeded. */
async function statusOf(work: Promise<unknown>): Promise<number> {
  try {
    await work;
    return 200;
  } catch (error) {
    const status = (error as { status?: number }).status;
    return status ?? -1;
  }
}

/**
 * Reads what one actor may do in one course, as a status per capability.
 *
 * This is deliberately a **reading**, not an assertion: the spec owns the
 * expected table (ADR-0002), and the same reading is compared against a
 * different expectation in each phase of the migration coverage. Every call is
 * made with the actor's own request context, so what is measured is that
 * account's rights and nothing else.
 */
export async function readCoursePermissions(
  actor: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  username: string,
  targets: PermissionProbeTargets,
): Promise<PermissionReadings> {
  return {
    studioOutline: await statusOf(fetchCourseIndex(actor, config, courseKey)),
    studioWrite: await statusOf(
      updateXBlock(actor, config, targets.writableBlock, {
        metadata: { display_name: `E2E permission probe ${username}` },
      }),
    ),
    instructorDashboard: await statusOf(fetchInstructorCourse(actor, config, courseKey)),
    dataDownloads: await statusOf(listReports(actor, config, courseKey)),
    enrollmentList: await statusOf(listEnrollments(actor, config, courseKey)),
    courseware: await statusOf(fetchCourseOutline(actor, config, courseKey, username)),
  };
}

/** A full-access reading — what an instructor, or an org-wide instructor, gets. */
export const FULL_COURSE_ACCESS: PermissionReadings = {
  studioOutline: 200,
  studioWrite: 200,
  instructorDashboard: 200,
  dataDownloads: 200,
  enrollmentList: 200,
  courseware: 200,
};

/** No relationship to the course at all: everything refused, including the content. */
export const NO_COURSE_ACCESS: PermissionReadings = {
  studioOutline: 403,
  studioWrite: 403,
  instructorDashboard: 403,
  dataDownloads: 403,
  enrollmentList: 403,
  courseware: 403,
};

/**
 * The instructor dashboard tabs an actor is offered, by their non-localized
 * `tab_id`, sorted — the UI half of the matrix, and the reading that shows a
 * multi-role account holding the **union** of its roles' tabs (TC-00586).
 *
 * An actor the dashboard refuses has no tabs at all, which is reported as an
 * empty list rather than an error so a spec can put every role in one table.
 */
export async function instructorTabsFor(
  actor: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<string[]> {
  try {
    const course = await fetchInstructorCourse(actor, config, courseKey);
    return course.tabs.map((tab) => tab.tab_id).sort();
  } catch {
    return [];
  }
}
