import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { openAdminForm, postAdminForm } from './django-admin';

/**
 * Course- and organization-level **waffle flag overrides**, written through the
 * LMS Django admin. A `CourseWaffleFlag` is one flag name with a global
 * `waffle.Flag` row plus per-course and per-org overrides of that same name, so
 * a test can turn a feature on for **its own course** and leave every other
 * worker's course alone.
 *
 * Measured on Tutor `main` (2026-09-17, Epic 12 plan §1.8.1 and §1.8.6):
 *
 * - The override models behave like configuration models: the admin **refuses
 *   deletion** (HTTP 403 on the delete view) and a change-form POST adds
 *   another row rather than editing one. The newest row for a key wins, so
 *   turning an override off means **adding a row**, and neutralizing it
 *   entirely means adding one with `enabled` unchecked — after which the flag
 *   state lists the key under neither `on` nor `off`.
 * - A save takes tens of milliseconds, and where the target enables automatic
 *   AuthZ migration the migration runs **inside that request** (§1.8.11).
 *
 * Runs on an **LMS Django session** for the admin (a context signed in with
 * `loginSession`) under the cross-worker admin lock, like every other admin
 * write in the suite. Read the resulting state back with
 * `fetchWaffleFlagStates` (`./authz.ts`) rather than trusting the save alone.
 */

/** The flag that puts a course's authoring permissions under openedx-authz. */
export const AUTHZ_COURSE_AUTHORING_FLAG = 'authz.enable_course_authoring';

/** Admin base paths for the two override models. */
export const WAFFLE_COURSE_OVERRIDE_ADMIN = '/admin/waffle_utils/waffleflagcourseoverridemodel';
export const WAFFLE_ORG_OVERRIDE_ADMIN = '/admin/waffle_utils/waffleflagorgoverridemodel';

/** What an override does while it is enabled: force the flag on, or force it off. */
export type WaffleOverrideChoice = 'on' | 'off';

export interface WaffleOverrideInput {
  /** The flag name, e.g. {@link AUTHZ_COURSE_AUTHORING_FLAG}. */
  readonly flag: string;
  /** `on` or `off`; ignored by the platform when `enabled` is false. */
  readonly choice: WaffleOverrideChoice;
  /**
   * Whether the override applies at all. `false` writes the neutralizing row
   * teardown uses: the key then falls back to the org or global state, and no
   * migration is triggered because nothing effectively changed.
   */
  readonly enabled: boolean;
  /** Free text the admin stores; give it the run id so a leftover row explains itself. */
  readonly note?: string;
}

async function addOverrideRow(
  adminSession: APIRequestContext,
  config: AppConfig,
  adminBase: string,
  fields: Readonly<Record<string, string>>,
  what: string,
): Promise<void> {
  const url = `${config.baseUrls.lms}${adminBase}/add/`;
  const { token } = await openAdminForm(adminSession, url, what);
  // An unchecked checkbox is an absent field, which is how `enabled: false` is
  // expressed; sending `enabled: ''` would be a validation error.
  await postAdminForm(adminSession, url, token, fields, what);
}

const overrideFields = (
  input: WaffleOverrideInput,
  key: Readonly<Record<string, string>>,
): Record<string, string> => ({
  waffle_flag: input.flag,
  ...key,
  override_choice: input.choice,
  note: input.note ?? '',
  ...(input.enabled ? { enabled: 'on' } : {}),
});

/**
 * Adds a course-level override row. Forcing the flag **on** for a course that
 * has not been migrated leaves its team locked out of Studio (plan §1.8.2), so
 * a caller turning AuthZ on must migrate or assign authz roles as well.
 */
export async function setCourseFlagOverride(
  adminSession: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  input: WaffleOverrideInput,
): Promise<void> {
  await addOverrideRow(
    adminSession,
    config,
    WAFFLE_COURSE_OVERRIDE_ADMIN,
    overrideFields(input, { course_id: courseKey }),
    `Setting the ${input.flag} override for ${courseKey} to ${input.enabled ? input.choice : 'disabled'}`,
  );
}

/**
 * Neutralizes a course-level override: the flag falls back to the org or global
 * state for that course. This is the teardown of every spec that turned it on,
 * because override rows cannot be deleted.
 */
export async function clearCourseFlagOverride(
  adminSession: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  flag: string,
  note?: string,
): Promise<void> {
  await setCourseFlagOverride(adminSession, config, courseKey, {
    flag,
    choice: 'off',
    enabled: false,
    note,
  });
}

/** Adds an organization-level override row — it reaches every course in the org. */
export async function setOrgFlagOverride(
  adminSession: APIRequestContext,
  config: AppConfig,
  org: string,
  input: WaffleOverrideInput,
): Promise<void> {
  await addOverrideRow(
    adminSession,
    config,
    WAFFLE_ORG_OVERRIDE_ADMIN,
    overrideFields(input, { org }),
    `Setting the ${input.flag} override for organization ${org} to ${input.enabled ? input.choice : 'disabled'}`,
  );
}

/** Neutralizes an organization-level override (see {@link clearCourseFlagOverride}). */
export async function clearOrgFlagOverride(
  adminSession: APIRequestContext,
  config: AppConfig,
  org: string,
  flag: string,
  note?: string,
): Promise<void> {
  await setOrgFlagOverride(adminSession, config, org, {
    flag,
    choice: 'off',
    enabled: false,
    note,
  });
}
