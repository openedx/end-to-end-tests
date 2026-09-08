import type { Page } from '@playwright/test';

import { accountSignInThroughUi, accountSignOutThroughUi } from '../accounts';
import type { AccountCredentials } from '../accounts';
import type { LearnerIdentity } from '../api';
import type { AppConfig } from '../config';
import type { RegistrationPage } from '../pages/lms/auth/registration.page';

/** True while the browser is still on an authn MFE route (`/authn/...`). */
const onAuthnRoute = (url: URL): boolean => url.pathname.includes('/authn/');

/**
 * Registers a new learner through the authn MFE UI and waits for the post-
 * registration redirect to complete. A successful registration auto-signs-in the
 * learner, so we wait for the URL to leave `/authn/` before returning — the
 * web-first alternative to a fixed sleep, ensuring the session cookie is set
 * before any caller navigates on.
 *
 * Unlike {@link signIn}, this drives the authn MFE form directly: the registration
 * spec asserts on that form itself. Specs that only need an account should use
 * `provisionLearnerAccount`, which goes through the configured backend.
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
 * Signs in through the UI of the configured account backend — the authn MFE
 * `/login` form by default, or the install's own flow when the backend overrides
 * `signInThroughUi`. Does not assert success; the spec owns that.
 */
export async function signIn(
  page: Page,
  config: AppConfig,
  credentials: AccountCredentials,
): Promise<void> {
  await accountSignInThroughUi({ config, page, credentials });
}

/**
 * Signs out through the UI of the configured account backend — the header account
 * menu by default. `username` identifies the account-menu trigger.
 */
export async function signOut(page: Page, config: AppConfig, username: string): Promise<void> {
  await accountSignOutThroughUi({ config, page, username });
}
