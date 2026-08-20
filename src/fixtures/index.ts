import { test as base, expect } from '@playwright/test';

import { newLearnerIdentity, type LearnerIdentity } from '../api';
import { getConfig, type AppConfig } from '../config';
import { AccountMenu } from '../pages/lms/auth/account-menu.page';
import { LoginPage } from '../pages/lms/auth/login.page';
import { RegistrationPage } from '../pages/lms/auth/registration.page';

/**
 * Fixtures the suite adds on top of Playwright's built-ins. Each is composed
 * through this one entry point so specs receive fully-composed, typed objects.
 */
export interface TestFixtures {
  /** Validated suite configuration for the current run. */
  config: AppConfig;
  /** authn MFE `/login` page object. */
  loginPage: LoginPage;
  /** authn MFE `/register` page object. */
  registrationPage: RegistrationPage;
  /** Header account menu carrying the sign-out affordance. */
  accountMenu: AccountMenu;
  /**
   * A fresh, unique-per-run learner identity. Requesting the fixture yields a new
   * identity, so parallel tests never collide (ADR-0002 test-data rules).
   */
  learnerIdentity: LearnerIdentity;
}

/**
 * The composition root. Specs import `test`/`expect` from here (not directly from
 * `@playwright/test`) so they receive fully-composed, typed objects.
 *
 * Requesting `config` also fails fast with a clear {@link ConfigError} when the
 * environment is invalid, rather than surfacing later as a confusing navigation
 * failure.
 */
export const test = base.extend<TestFixtures>({
  // eslint-disable-next-line no-empty-pattern
  config: async ({}, use) => {
    await use(getConfig());
  },

  loginPage: async ({ page, config }, use) => {
    await use(new LoginPage(page, config));
  },

  registrationPage: async ({ page, config }, use) => {
    await use(new RegistrationPage(page, config));
  },

  accountMenu: async ({ page, config }, use) => {
    await use(new AccountMenu(page, config));
  },

  // eslint-disable-next-line no-empty-pattern
  learnerIdentity: async ({}, use) => {
    await use(newLearnerIdentity());
  },
});

export { expect };
