import { test as base, expect } from '@playwright/test';

import { getConfig, type AppConfig } from '../config';

/**
 * Fixtures the suite adds on top of Playwright's built-ins. Each
 * is composed through this one entry point.
 */
export interface TestFixtures {
  /** Validated suite configuration for the current run. */
  config: AppConfig;
}

/**
 * The composition root. Specs import `test`/`expect` from here (not directly
 * from `@playwright/test`) so they receive fully-composed, typed objects.
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
});

export { expect };
