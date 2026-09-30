import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { findAdminRowPk, openAdminForm, postAdminForm, readAdminForm } from './django-admin';

/** The LMS user admin — the only route to an account's `is_active` flag. */
export const USER_ADMIN = '/admin/auth/user';

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
  const pk = await findAdminRowPk(adminSession, USER_ADMIN, config.baseUrls.lms, username);
  if (pk === undefined) {
    throw new ApiError(`No user row for ${username} in the LMS admin.`, {
      status: 404,
      url: `${config.baseUrls.lms}${USER_ADMIN}/`,
      body: '',
    });
  }
  const url = `${config.baseUrls.lms}${USER_ADMIN}/${pk}/change/`;
  const { html, token } = await openAdminForm(adminSession, url, `Deactivating ${username}`);
  const form = readAdminForm(html);
  // An unchecked checkbox is simply absent from a form body.
  delete form.is_active;
  await postAdminForm(adminSession, url, token, form, `Deactivating ${username}`);
}
