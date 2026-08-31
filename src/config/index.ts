import * as dotenv from 'dotenv';

import { ConfigError } from './errors';
import { loadConfig, type AppConfig } from './load';

export type { AppConfig, AdminCredentials, BaseUrls, Env, Scheme } from './load';
export { loadConfig } from './load';
export { ConfigError };
export {
  CAPABILITIES,
  CAPABILITY_OPT_OUT_PREFIX,
  DEFAULT_ON_CAPABILITIES,
  MUTUALLY_EXCLUSIVE_CAPABILITIES,
  isCapability,
  isDefaultOnCapability,
  missingCapabilities,
  type Capability,
} from './capabilities';
export {
  ACCOUNT_BACKENDS,
  DEFAULT_ACCOUNT_BACKEND,
  isAccountBackendName,
} from './account-backends';
export { registrableDomain } from './domain';
export { TIMEOUTS, type Timeouts } from './timeouts';
export {
  CATALOG_SEARCH_PATH,
  CATALOG_SELECTORS,
  COURSE_ABOUT_SELECTORS,
  catalogCourseCard,
  courseAboutCoursewareLink,
  CAPA_SELECTORS,
  COURSEWARE_SELECTORS,
  coursewareBlock,
  sidebarUnitLink,
} from './selectors';

let cached: AppConfig | undefined;
let dotenvLoaded = false;

/**
 * Env var used to print runtime advisories only once per run. Playwright loads
 * the config in the main process and again in every worker, so a per-process
 * guard alone would repeat the warnings once per worker. The main process sets
 * this before spawning workers, which inherit it and stay quiet.
 */
const WARNINGS_SHOWN_ENV = 'OPENEDX_E2E_WARNINGS_SHOWN';

/**
 * Env var used to report an invalid configuration only once per run. Both
 * `playwright.config.ts` and global setup tolerate a {@link ConfigError} so the
 * node-only `unit` project stays runnable on a fresh clone, and each of them —
 * plus every worker — would otherwise re-print the same block.
 */
const CONFIG_ERROR_SHOWN_ENV = 'OPENEDX_E2E_CONFIG_ERROR_SHOWN';

/** Prints config/setup advisories a single time across the whole run. */
function printRuntimeWarningsOnce(config: AppConfig): void {
  if (process.env[WARNINGS_SHOWN_ENV]) {
    return;
  }
  process.env[WARNINGS_SHOWN_ENV] = '1';

  for (const warning of config.warnings) {
    console.warn(`[config] warning: ${warning}`);
  }

  if (!config.credentials.admin) {
    console.warn(
      '[config] warning: ADMIN_USERNAME / ADMIN_PASSWORD are not set — the staff ' +
        'role will not be authenticated, so staff setup and staff-only tests are ' +
        'skipped. Set both to enable staff coverage.',
    );
  }
}

/**
 * Returns the validated configuration for the current process, loading `.env`
 * and `process.env` on first call and memoizing the result.
 *
 * Runtime advisories are printed once per run (see {@link WARNINGS_SHOWN_ENV}).
 * Fails fast with a {@link ConfigError} if the environment is invalid.
 */
export function getConfig(): AppConfig {
  if (!dotenvLoaded) {
    dotenv.config({ quiet: true });
    dotenvLoaded = true;
  }
  if (!cached) {
    cached = loadConfig(process.env);
    printRuntimeWarningsOnce(cached);
  }
  return cached;
}

/**
 * Returns the validated configuration, or `undefined` when the environment
 * cannot produce one — reporting the {@link ConfigError} once per run instead of
 * throwing.
 *
 * This is for the two places that run before (and regardless of) any spec:
 * `playwright.config.ts` and global setup. Configuration is only needed by
 * projects that talk to an installation, so a fresh clone with no `.env` must
 * still be able to run `--project=unit`; throwing there would block the unit
 * tests over settings they never read. Everything that does need configuration
 * still fails fast through {@link getConfig} — the config fixture, the API layer
 * and account provisioning — so a misconfigured browser run cannot slip past.
 *
 * @param source Label for the warning, e.g. `playwright.config`.
 * @throws Anything that is not a {@link ConfigError}; those are real faults.
 */
export function getConfigIfValid(source: string): AppConfig | undefined {
  try {
    return getConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) {
      throw error;
    }
    if (!process.env[CONFIG_ERROR_SHOWN_ENV]) {
      process.env[CONFIG_ERROR_SHOWN_ENV] = '1';
      console.warn(
        `[${source}] Configuration is incomplete or invalid. Projects that drive ` +
          'an installation (smoke, regression, setup, …) will fail until it is ' +
          'fixed; the node-only `unit` project needs no configuration and runs ' +
          `anyway.\n${error.message}`,
      );
    }
    return undefined;
  }
}

/**
 * Clears the memoized configuration. Intended for tests that manipulate the
 * environment, not used by the suite at runtime.
 */
export function resetConfigCache(): void {
  cached = undefined;
  dotenvLoaded = false;
  delete process.env[WARNINGS_SHOWN_ENV];
  delete process.env[CONFIG_ERROR_SHOWN_ENV];
}
