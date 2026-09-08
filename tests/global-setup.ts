import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import { initAccountBackends } from '../src/accounts';
import { AUTH_STATE_DIR } from '../src/auth';
import { getConfigIfValid } from '../src/config';

/**
 * Runs once in the main process before any project (including `setup`). Clears
 * captured auth storage state so it never persists between runs: the `setup`
 * project re-provisions and rewrites `.auth/<role>.json` from scratch each run,
 * and downstream projects always consume a fresh session rather than a stale one
 * left over from a previous invocation.
 *
 * It also loads the account backends — the built-ins plus any custom plugins in
 * `CUSTOM_ACCOUNT_BACKEND_PLUGINS` — so a bad plugin path or an unknown
 * `ACCOUNT_BACKEND` fails the run up front rather than inside a worker. Workers
 * load their own registry lazily (see `resolveAccountBackend`).
 *
 * Backend loading needs configuration, so it is skipped (with a warning) when
 * the environment cannot produce any: global setup runs for every project, and
 * the node-only `unit` project must stay runnable on a fresh clone with no
 * `.env`. Anything that actually provisions an account resolves the backend
 * through `resolveAccountBackend()`, which fails fast on the same bad config.
 */
export default async function globalSetup(): Promise<void> {
  if (existsSync(AUTH_STATE_DIR)) {
    await rm(AUTH_STATE_DIR, { recursive: true, force: true });
    console.log(`[global-setup] Cleared stale auth state in ${AUTH_STATE_DIR}/`);
  }

  const config = getConfigIfValid('global-setup');
  if (!config) {
    return;
  }

  const registry = await initAccountBackends(config);
  // Fails fast if ACCOUNT_BACKEND names a backend nothing registered.
  registry.get(config);
  console.log(`[global-setup] Account backends available: ${registry.list().join(', ')}`);
}
