import { defineConfig, devices } from '@playwright/test';

import { authStateFile } from './src/auth';
import { getConfigIfValid, TIMEOUTS } from './src/config';

const isCI = Boolean(process.env.CI);

/**
 * Resolves the LMS base URL from validated configuration.
 *
 * Browser specs need it; the node-only `unit` project does not. If configuration
 * is missing or invalid we don't throw here — that would block the unit tests
 * too — but `getConfigIfValid` prints the clear configuration error so a
 * misconfigured browser run is never mysterious. Browser specs surface the same
 * error fatally via the config fixture / `getConfig()`.
 */
function resolveBaseURL(): string | undefined {
  return getConfigIfValid('playwright.config')?.baseUrls.lms;
}

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  // Clears captured auth state (.auth/) once before anything runs, so a stale
  // session never carries over between runs; the setup project rewrites it.
  globalSetup: './tests/global-setup.ts',

  // Stability rules (ADR-0002): parallel-safe isolation, no `.only` in CI,
  // bounded retries, and centralized timeouts.
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : 1,
  timeout: TIMEOUTS.test,
  expect: { timeout: TIMEOUTS.expect },

  // Reporters generate locally; uploading them as artifacts is CI-only and lives
  // in the workflow layer. The always-on BTR coverage reporter writes a local
  // `test-results/btr-coverage.json` mapping test_id → outcome.
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./src/reporting/coverage-reporter.ts'],
    ['./src/reporting/a11y-reporter.ts'],
  ],

  use: {
    baseURL: resolveBaseURL(),
    actionTimeout: TIMEOUTS.action,
    navigationTimeout: TIMEOUTS.navigation,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Pin the browser to UTC so date/time controls that render in the viewer's
    // zone (Studio's Schedule & Details fields, labelled "(UTC)") read and write
    // the same instants the API does. Without this the suite's result depends on
    // the machine's local zone — a value entered as UTC comes back shifted by the
    // runner's offset.
    timezoneId: 'UTC',

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
      // Signs in once per role and writes .auth/<role>.json. Authenticated
      // projects depend on this and consume the state via `use: { storageState }`.
      // A role the target has no credentials for (instructor) skips rather than
      // fails, so a partially configured install still runs the rest.
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      // Critical-path stability tier. Drives the UI from a clean, anonymous
      // state, so it excludes specs that require captured auth (`@authenticated`,
      // `@author`).
      name: 'smoke',
      grep: /@smoke/,
      grepInvert: /@authenticated|@author/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Broader-depth stability tier, likewise anonymous by default.
      name: 'regression',
      grep: /@regression/,
      grepInvert: /@authenticated|@author/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Authenticated tier: depends on `setup` and loads the captured learner
      // state, so `@authenticated` specs reuse a single sign-in without driving
      // the login UI.
      name: 'lms-learner',
      grep: /@authenticated/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: authStateFile('learner') },
    },
    {
      // Authoring tier: `@author` specs (the tests/studio/ tree) run with the
      // captured author state, which holds both the LMS and the Studio session.
      // The worker-scoped `authoredCourse` fixture reads the same state file.
      name: 'studio-author',
      grep: /@author/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: authStateFile('author') },
    },
    // Additional browsers (Firefox, WebKit) can be added as parallel projects
    // once the suite is stable on Chromium.
  ],
});
