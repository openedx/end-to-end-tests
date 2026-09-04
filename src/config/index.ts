import * as dotenv from 'dotenv';

import { loadConfig, type AppConfig } from './load';

export type { AppConfig, AdminCredentials, BaseUrls, Env, Scheme } from './load';
export { loadConfig } from './load';
export { ConfigError } from './errors';
export {
  CAPABILITIES,
  MUTUALLY_EXCLUSIVE_CAPABILITIES,
  isCapability,
  type Capability,
} from './capabilities';
export {
  ACCOUNT_BACKENDS,
  DEFAULT_ACCOUNT_BACKEND,
  isAccountBackendName,
} from './account-backends';
export { registrableDomain } from './domain';
export { TIMEOUTS } from './timeouts';
export {
  ACCOUNT_MENU_SELECTORS,
  CATALOG_SEARCH_PATH,
  CATALOG_SELECTORS,
  COURSE_ABOUT_SELECTORS,
  catalogCourseCard,
  courseAboutCoursewareLink,
  CAPA_SELECTORS,
  COURSEWARE_SELECTORS,
  coursewareBlock,
  sidebarSubsectionRowFor,
  sidebarUnitLink,
  PROGRESS_SELECTORS,
  progressTabLink,
  DASHBOARD_SELECTORS,
  COURSE_HOME_SELECTORS,
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
