import { loginSession } from '../api';
import { AccountMenu } from '../pages/lms/auth/account-menu.page';
import { LoginPage } from '../pages/lms/auth/login.page';
import type { SignInContext, UiSignInContext, UiSignOutContext } from './types';

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
 */
export async function defaultSignOutThroughUi({
  config,
  page,
  username,
}: UiSignOutContext): Promise<void> {
  const accountMenu = new AccountMenu(page, config);
  await accountMenu.signOut(username);
  await page.waitForLoadState('networkidle');
}
