import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { TIMEOUTS } from '../config';
import {
  AUTHZ_COURSE_AUTHORING_FLAG,
  clearCourseFlagOverride,
  clearOrgFlagOverride,
  countMigrationRuns,
  fetchWaffleFlagStates,
  isAuthzEnabledForCourse,
  setCourseFlagOverride,
  setOrgFlagOverride,
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

/** The flag's whole picture, for a spec that asserts one scope did not affect another. */
export async function readFlagScopes(
  request: APIRequestContext,
  config: AppConfig,
): Promise<{ readonly on: readonly string[]; readonly off: readonly string[] }> {
  const states = await fetchWaffleFlagStates(request, config);
  return {
    on: [...states.courseOverrides.on, ...states.orgOverrides.on],
    off: [...states.courseOverrides.off, ...states.orgOverrides.off],
  };
}
