import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import path from 'node:path';

import { authStateFile } from './src/auth';
import {
  ciResultLabels,
  getConfigIfValid,
  resolveExternalTestDirs,
  resolveWorkerCount,
  TIMEOUTS,
} from './src/config';
import { SUITE_REPORTERS } from './src/reporting/reporters';

const isCI = Boolean(process.env.CI);

/**
 * External test directories declared via `CUSTOM_TEST_DIRS`. A provider points
 * this at its own spec folder(s); each is mirrored onto the tier projects below
 * so the external specs run through the same tiers, tags and capability gating
 * in one `playwright test` run — no fork, no second Playwright setup.
 *
 * Resolved independently of the installation config so external projects (the
 * node-only `unit` tier included) register even without LMS/APPS URLs; an
 * invalid directory fails fast rather than silently disappearing.
 */
const externalTestDirs = resolveExternalTestDirs();

/**
 * Mirrors the browser/unit tiers onto one external directory. The label is the
 * directory relative to the working directory (not just its basename), so two
 * providers' `tests/` folders don't collapse to the same project name;
 * authenticated tiers reuse the built-in `setup` project's captured state via
 * `dependencies`.
 */
function externalProjects(dir: string) {
  const relative = path.relative(process.cwd(), dir);
  const label = (relative === '' ? path.basename(dir) : relative).split(path.sep).join('/');
  const chrome = { ...devices['Desktop Chrome'] };
  return [
    { name: `unit [${label}]`, grep: /@unit/, testDir: dir },
    {
      name: `smoke [${label}]`,
      grep: /@smoke/,
      grepInvert: /@authenticated|@author/,
      testDir: dir,
      use: chrome,
    },
    {
      name: `regression [${label}]`,
      grep: /@regression/,
      grepInvert: /@authenticated|@author/,
      testDir: dir,
      use: chrome,
    },
    {
      name: `lms-learner [${label}]`,
      grep: /@authenticated/,
      dependencies: ['setup'],
      testDir: dir,
      use: { ...chrome, storageState: authStateFile('learner') },
    },
    {
      name: `studio-author [${label}]`,
      grep: /@author/,
      dependencies: ['setup'],
      testDir: dir,
      use: { ...chrome, storageState: authStateFile('author') },
    },
  ];
}

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
  // Configurable via the `WORKERS` env var (`.env` or the environment); defaults
  // to 2 locally and 4 in CI. Kept low locally on purpose: a busy CMS worker
  // evicts author Studio sessions under higher parallelism (see
  // `references/studio-auth.md`), so more workers trade throughput for flakiness.
  workers: resolveWorkerCount(isCI),
  timeout: TIMEOUTS.test,
  expect: { timeout: TIMEOUTS.expect },

  // Reporters generate locally; uploading them as artifacts is CI-only and lives
  // in the workflow layer. The always-on BTR reporters write local
  // `test-results/btr-coverage.json` (test_id → outcome) and
  // `test-results/btr-run.json` (per-case detail + run metadata, the input to
  // the results-sheet publisher); the a11y and timing reporters likewise write
  // `a11y-violations.json` and `timings-*.csv` there.
  reporter: [
    ...SUITE_REPORTERS,
    // CI also writes a blob report, which `playwright merge-reports`
    // (`merge.config.ts`) combines across shards into the files above.
    ...(isCI ? ([['blob']] satisfies ReporterDescription[]) : []),
  ],

  // Labels every result with the CI shard that ran it (its run-id suffix, e.g.
  // `d2`) and the CI profile (`.ci/profiles.json`). Projects inherit config
  // metadata, and a merged report keeps each blob's projects, with their
  // metadata, apart, so the reporters can attribute results of a merged report
  // (`src/reporting/project.ts`). Both are empty outside CI.
  metadata: ciResultLabels(),

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
    // Provider specs declared via CUSTOM_TEST_DIRS: the tiers mirrored onto each
    // external directory, so external coverage runs in the same invocation.
    ...externalTestDirs.flatMap(externalProjects),
    // Additional browsers (Firefox, WebKit) can be added as parallel projects
    // once the suite is stable on Chromium.
  ],
});
