import { request as playwrightRequest } from '@playwright/test';

import {
  ApiError,
  establishStudioSession,
  fetchCourseCreatorStatus,
  grantCourseCreator,
  loginSession,
  requestCourseCreator,
} from '../api';
import { withAdminSession } from './admin-lock';
import { AccountMenu } from '../pages/lms/auth/account-menu.page';
import { LoginPage } from '../pages/lms/auth/login.page';
import { AccountNotConfiguredError } from './errors';
import type {
  GrantCourseCreatorContext,
  SignInContext,
  StudioSignInContext,
  UiSignInContext,
  UiSignOutContext,
} from './types';

/**
 * The stock Open edX auth flows, used whenever the selected backend does not
 * override them (see {@link AccountBackend}). They live here rather than in the
 * built-in backends so a custom plugin can reuse or wrap one — an install that
 * only replaces sign-*in* can still delegate sign-out to the default.
 */

/** True while the browser is still on an authn MFE route (`/authn/...`). */
const onAuthnRoute = (url: URL): boolean => url.pathname.includes('/authn/');

/**
 * Signs in against the LMS login-session API the authn MFE itself posts to,
 * leaving `request` holding the parent-domain session and JWT cookies.
 */
export async function defaultSignIn({
  config,
  request,
  credentials,
}: SignInContext): Promise<void> {
  await loginSession(request, config, credentials);
}

/**
 * Gives a request context holding an LMS session its Studio session through the
 * silent `cms-sso` OAuth handshake (`establishStudioSession`). Ignores the
 * credentials: on a stock install the LMS session is all Studio asks for.
 */
export async function defaultSignInStudio({ config, request }: StudioSignInContext): Promise<void> {
  await establishStudioSession(request, config);
}

/**
 * Signs in through the authn MFE `/login` form and waits for the auth redirect to
 * finish (the URL leaves `/authn/`), so the session cookie is set before
 * subsequent navigation. Does not assert success — the spec owns that.
 */
export async function defaultSignInThroughUi({
  config,
  page,
  credentials,
}: UiSignInContext): Promise<void> {
  const loginPage = new LoginPage(page, config);
  await loginPage.goto();
  await loginPage.signIn(credentials.emailOrUsername, credentials.password);
  await page.waitForURL((url) => !onAuthnRoute(url));
}

/**
 * Signs out via the header account menu and waits for the resulting navigation to
 * settle.
 *
 * Takes no `username`: the menu is anchored structurally now, so the signed-in
 * learner's name is not needed to find it. The context still carries one for
 * backends whose own sign-out needs it.
 */
export async function defaultSignOutThroughUi({ config, page }: UiSignOutContext): Promise<void> {
  const accountMenu = new AccountMenu(page, config);
  await accountMenu.signOut();
  await page.waitForLoadState('networkidle');
}

/**
 * Grants course-creator status the way a default install allows (BTR TC-00310):
 * the account requests access from Studio, then a **separate** request context
 * signs in as the configured admin, completes its own Studio handshake, and
 * submits the Django admin change form. The two sessions never share a cookie
 * jar — the author's context must keep the author's session.
 *
 * The admin session uses the stock LMS and Studio sign-ins deliberately: this is
 * the default install's grant path, and a backend replacing those flows is
 * expected to replace the grant as well (see `AccountBackend.grantCourseCreator`).
 *
 * Ends by confirming Studio now reports the author as `granted`.
 *
 * @throws {AccountNotConfiguredError} when no admin account is configured: without
 *   one there is no default path to a grant, so the `author` role is skipped
 *   rather than failed (the auth layer maps it to `AuthNotConfiguredError`). An install where every account may create courses
 *   never reaches this flow (see `provisionAuthorSession`).
 */
export async function defaultGrantCourseCreator({
  config,
  request,
  identity,
  adminStorageState,
}: GrantCourseCreatorContext): Promise<void> {
  const admin = config.credentials.admin;
  if (!admin) {
    throw new AccountNotConfiguredError(
      'The "author" role needs course-creator status, which a default install grants only ' +
        'through the Studio Django admin. Set ADMIN_USERNAME and ADMIN_PASSWORD (a superuser) ' +
        'to enable it, or supply an account backend whose grantCourseCreator fits your ' +
        'installation.',
    );
  }

  await requestCourseCreator(request, config);

  // One admin session at a time across workers: the platform ends the admin's
  // other sessions on each sign-in, and the admin form runs on the session.
  await withAdminSession(async () => {
    // Prefer a session that already exists over another sign-in (see
    // `adminStorageState`); only when that session turns out dead sign in anew.
    if (adminStorageState !== undefined) {
      const reused = await playwrightRequest.newContext({ storageState: adminStorageState });
      try {
        await grantCourseCreator(reused, config, identity.username);
        return;
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
      } finally {
        await reused.dispose();
      }
    }
    const adminRequest = await playwrightRequest.newContext();
    try {
      await loginSession(adminRequest, config, {
        emailOrUsername: admin.username,
        password: admin.password,
      });
      await establishStudioSession(adminRequest, config);
      await grantCourseCreator(adminRequest, config, identity.username);
    } finally {
      await adminRequest.dispose();
    }
  });

  const status = await fetchCourseCreatorStatus(request, config);
  if (status !== 'granted') {
    throw new AccountNotConfiguredError(
      `Studio still reports "${identity.username}" as "${status}" after the admin grant. ` +
        'Check that the admin account is a superuser.',
    );
  }
}
