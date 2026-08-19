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
export { registrableDomain } from './domain';

let cached: AppConfig | undefined;
let dotenvLoaded = false;

/**
 * Returns the validated configuration for the current process, loading `.env`
 * and `process.env` on first call and memoizing the result.
 *
 * Load-time warnings are printed once. Fails fast with a {@link ConfigError}
 * if the environment is invalid.
 */
export function getConfig(): AppConfig {
  if (!dotenvLoaded) {
    dotenv.config({ quiet: true });
    dotenvLoaded = true;
  }
  if (!cached) {
    cached = loadConfig(process.env);
    for (const warning of cached.warnings) {
      console.warn(`[config] warning: ${warning}`);
    }
  }
  return cached;
}

/**
 * Clears the memoized configuration. Intended for tests that manipulate the
 * environment, not used by the suite at runtime.
 */
export function resetConfigCache(): void {
  cached = undefined;
  dotenvLoaded = false;
}
