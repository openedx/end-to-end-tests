import type { Page } from '@playwright/test';

import type { LearnerIdentity } from '../api';
import type { AccountMenu } from '../pages/lms/auth/account-menu.page';
import type { LoginPage } from '../pages/lms/auth/login.page';
import type { RegistrationPage } from '../pages/lms/auth/registration.page';

/** True while the browser is still on an authn MFE route (`/authn/...`). */
const onAuthnRoute = (url: URL): boolean => url.pathname.includes('/authn/');

/**
 * Registers a new learner through the authn MFE UI and waits for the post-
 * registration redirect to complete. A successful registration auto-signs-in the
 * learner, so we wait for the URL to leave `/authn/` before returning — the
 * web-first alternative to a fixed sleep, ensuring the session cookie is set
 * before any caller navigates on.
 */
export async function registerLearner(
  page: Page,
  registrationPage: RegistrationPage,
  identity: LearnerIdentity,
): Promise<void> {
  await registrationPage.goto();
  await registrationPage.register(identity);
  await page.waitForURL((url) => !onAuthnRoute(url));
}

/**
 * Signs in through the authn MFE UI and waits for the auth redirect to finish
 * (URL leaves `/authn/`), so the session cookie is set before subsequent
 * navigation. Does not assert success — the spec owns that.
 */
export async function signIn(
  page: Page,
  loginPage: LoginPage,
  credentials: { emailOrUsername: string; password: string },
): Promise<void> {
  await loginPage.goto();
  await loginPage.signIn(credentials.emailOrUsername, credentials.password);
  await page.waitForURL((url) => !onAuthnRoute(url));
}

/**
 * Signs out via the header account menu and waits for the resulting navigation to
 * settle. `displayName` identifies the account-menu trigger.
 */
export async function signOut(
  page: Page,
  accountMenu: AccountMenu,
  displayName: string,
): Promise<void> {
  await accountMenu.signOut(displayName);
  await page.waitForLoadState('networkidle');
}
