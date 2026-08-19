import { defineConfig, devices } from '@playwright/test';

import { ConfigError, getConfig, TIMEOUTS } from './src/config';

const isCI = Boolean(process.env.CI);

/**
 * Resolves the LMS base URL from validated configuration.
 *
 * Browser specs need it; the node-only `unit` project does not. If configuration
 * is missing or invalid we don't throw here — that would block the unit tests
 * too — but we print the clear {@link ConfigError} so a misconfigured browser run
 * is never mysterious. Browser specs surface the same error fatally via the
 * config fixture / getConfig().
 */
function resolveBaseURL(): string | undefined {
  try {
    return getConfig().baseUrls.lms;
  } catch (error) {
    if (error instanceof ConfigError) {
      console.warn(
        `[playwright.config] Configuration is incomplete; browser specs will fail ` +
          `until it is fixed.\n${error.message}`,
      );
      return undefined;
    }
    throw error;
  }
}

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  // Stability rules (ADR-0002): parallel-safe isolation, no `.only` in CI,
  // bounded retries, and centralized timeouts.
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  timeout: TIMEOUTS.test,
  expect: { timeout: TIMEOUTS.expect },

  // Reporters generate locally; uploading them as artifacts is CI-only and lives
  // in the workflow layer.
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: resolveBaseURL(),
    actionTimeout: TIMEOUTS.action,
    navigationTimeout: TIMEOUTS.navigation,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // We deliberately do not launch with `--disable-web-security`. Disabling web
    // security masks real misconfiguration and makes tests stop reflecting real
    // users.
  },

  projects: [
    {
      // Pure logic tests (config validation, etc.): no browser, no baseURL.
      name: 'unit',
      grep: /@unit/,
    },
    {
      // Critical-path stability tier.
      name: 'smoke',
      grep: /@smoke/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Broader-depth stability tier.
      name: 'regression',
      grep: /@regression/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Additional browsers (Firefox, WebKit) can be added as parallel projects
    // once the suite is stable on Chromium.
  ],
});
