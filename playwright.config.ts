import { defineConfig, type ReporterDescription } from '@playwright/test';

import {
  ciResultLabels,
  getConfigIfValid,
  resolveExternalTestDirs,
  resolveWorkerCount,
  TIMEOUTS,
} from './src/config';
import { buildProjects } from './playwright.projects';
import { SUITE_REPORTERS } from './src/reporting/reporters';

const isCI = Boolean(process.env.CI);

/**
 * External test directories declared via `CUSTOM_TEST_DIRS`. A provider points
 * this at its own spec folder(s); each is mirrored onto the tier projects via
 * `buildProjects` so the external specs run through the same tiers, tags and
 * capability gating in one `playwright test` run — no fork, no second Playwright
 * setup.
 *
 * Resolved independently of the installation config so external projects (the
 * node-only `unit` tier included) register even without LMS/APPS URLs; an
 * invalid directory fails fast rather than silently disappearing.
 */
const externalTestDirs = resolveExternalTestDirs();

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

  // Stock tiers + `setup`, then those tiers mirrored onto each CUSTOM_TEST_DIRS
  // directory. Defined once in `playwright.projects.ts` and shared with
  // `merge.config.ts`. Additional browsers (Firefox, WebKit) can be added there
  // once the suite is stable on Chromium.
  projects: buildProjects(externalTestDirs),
});
