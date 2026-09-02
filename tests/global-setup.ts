import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import { initAccountBackends } from '../src/accounts';
import { AUTH_STATE_DIR } from '../src/auth';

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
 */
export default async function globalSetup(): Promise<void> {
  if (existsSync(AUTH_STATE_DIR)) {
    await rm(AUTH_STATE_DIR, { recursive: true, force: true });
    console.log(`[global-setup] Cleared stale auth state in ${AUTH_STATE_DIR}/`);
  }

  const registry = await initAccountBackends();
  // Fails fast if ACCOUNT_BACKEND names a backend nothing registered.
  registry.get();
  console.log(`[global-setup] Account backends available: ${registry.list().join(', ')}`);
}
