import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import {
  assertAdminPage,
  findAdminRowPk,
  openAdminForm,
  postAdminForm,
  readAdminForm,
} from './django-admin';

/**
 * Platform-wide waffle **switches** (django-waffle's `Switch`), which only the
 * LMS Django admin writes — e.g. `certificates.auto_certificate_generation`.
 * A switch is global to the installation, so a caller changing one holds the
 * named lock that serialises it against the cases relying on its value.
 * `adminSession` is an LMS Django session for a superuser (`adminLms`).
 */
const SWITCH_ADMIN = '/admin/waffle/switch';

/** Whether a switch is on (a switch with no row is off). */
export async function fetchWaffleSwitch(
  adminSession: APIRequestContext,
  config: AppConfig,
  name: string,
): Promise<boolean> {
  const lms = config.baseUrls.lms;
  const pk = await findAdminRowPk(adminSession, SWITCH_ADMIN, lms, name);
  if (pk === undefined) return false;
  const url = `${lms}${SWITCH_ADMIN}/${pk}/change/`;
  const response = await adminSession.get(url);
  const html = await response.text();
  assertAdminPage(html, response.status(), url, `Reading the waffle switch ${name}`);
  return readAdminForm(html).active === 'on';
}

/** Turns a switch on or off, creating its row if it has none. */
export async function setWaffleSwitch(
  adminSession: APIRequestContext,
  config: AppConfig,
  name: string,
  active: boolean,
): Promise<void> {
  const lms = config.baseUrls.lms;
  const pk = await findAdminRowPk(adminSession, SWITCH_ADMIN, lms, name);
  const url =
    pk === undefined ? `${lms}${SWITCH_ADMIN}/add/` : `${lms}${SWITCH_ADMIN}/${pk}/change/`;
  const form = await openAdminForm(adminSession, url, `Setting the waffle switch ${name}`);
  const fields: Record<string, string> = { ...readAdminForm(form.html), name };
  delete fields.active;
  if (active) fields.active = 'on';
  await postAdminForm(adminSession, url, form.token, fields, `Setting the waffle switch ${name}`);
  if ((await fetchWaffleSwitch(adminSession, config, name)) !== active) {
    throw new ApiError(`The waffle switch ${name} did not change to ${String(active)}.`, {
      status: 0,
      url,
      body: '',
    });
  }
}

/** The switch that makes a passing learner's certificate generate by itself. */
export const AUTO_CERTIFICATE_GENERATION_SWITCH = 'certificates.auto_certificate_generation';

/**
 * The switch that offers team submissions in ORA's Studio editor (edx-ora2 also
 * honours a course flag, a flag and `FEATURES['ENABLE_ORA_TEAM_SUBMISSIONS']`).
 */
export const ORA_TEAM_SUBMISSIONS_SWITCH = 'openresponseassessment.team_submissions';
