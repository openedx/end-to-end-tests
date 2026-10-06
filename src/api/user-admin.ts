import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { findAdminRowPk, openAdminForm, postAdminForm, readAdminForm } from './django-admin';

/** The LMS user admin — the only route to an account's `is_active` flag. */
export const USER_ADMIN = '/admin/auth/user';

/** The user admin's change form for `username`. */
async function userChangeUrl(
  adminSession: APIRequestContext,
  config: AppConfig,
  username: string,
): Promise<string> {
  const pk = await findAdminRowPk(adminSession, USER_ADMIN, config.baseUrls.lms, username);
  if (pk === undefined) {
    throw new ApiError(`No user row for ${username} in the LMS admin.`, {
      status: 404,
      url: `${config.baseUrls.lms}${USER_ADMIN}/`,
      body: '',
    });
  }
  return `${config.baseUrls.lms}${USER_ADMIN}/${pk}/change/`;
}

/**
 * Turns an account's `is_active` off, so a spec can exercise what the platform
 * does with a **registered but not activated** user.
 *
 * There is no API for this, and the suite's account backends only ever produce
 * usable accounts: registration authenticates its own session, and a target with
 * `SKIP_EMAIL_VALIDATION = True` activates immediately. So the state is made
 * here, through the admin, rather than hoped for from configuration.
 *
 * The whole change form is read and posted back with the one checkbox dropped —
 * Django rejects a change form that arrives without its inline formsets.
 */
export async function deactivateAccount(
  adminSession: APIRequestContext,
  config: AppConfig,
  username: string,
): Promise<void> {
  const url = await userChangeUrl(adminSession, config, username);
  const { html, token } = await openAdminForm(adminSession, url, `Deactivating ${username}`);
  const form = readAdminForm(html);
  // An unchecked checkbox is simply absent from a form body.
  delete form.is_active;
  await postAdminForm(adminSession, url, token, form, `Deactivating ${username}`);
}

/**
 * Turns an account's **global staff** flag (`is_staff`) on or off, as the
 * sheet's "make your test account a staff account" asks: through the LMS user
 * admin, like {@link deactivateAccount}, since no API grants it. Whatever turns
 * it on turns it off again when done (`globalStaffColleague`), so a run leaves
 * no staff accounts behind.
 */
export async function setGlobalStaff(
  adminSession: APIRequestContext,
  config: AppConfig,
  username: string,
  staff: boolean,
): Promise<void> {
  const url = await userChangeUrl(adminSession, config, username);
  const what = `${staff ? 'Making' : 'Unmaking'} ${username} global staff`;
  const { html, token } = await openAdminForm(adminSession, url, what);
  const form = readAdminForm(html);
  // An unchecked checkbox is simply absent from a form body.
  if (staff) form.is_staff = 'on';
  else delete form.is_staff;
  await postAdminForm(adminSession, url, token, form, what);
}
