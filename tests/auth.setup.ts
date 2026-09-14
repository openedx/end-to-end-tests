import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { test as setup } from '@playwright/test';

import {
  assertAuthCookiesPresent,
  assertStudioSessionPresent,
  AuthNotConfiguredError,
  authStateFile,
  defaultAuthProvider,
  persistStorageState,
  ROLES,
} from '../src/auth';
import { getConfig, getConfigIfValid } from '../src/config';

/**
 * Authentication setup project. Signs in once per role and writes the storage
 * state to `.auth/<role>.json`; authenticated projects then consume it via
 * `use: { storageState }`. A single sign-in yields parent-domain cookies that
 * cover the LMS and every MFE; Studio adds its own session through a silent
 * OAuth handshake the provider performs for the authoring roles, so the same
 * one state covers Studio too.
 *
 * Only roles the provider can actually authenticate for the current config get a
 * setup entry (e.g. `staff` appears only when an admin account is configured,
 * `author` only when the `studio` capability is declared; `instructor` needs a
 * custom provider). This keeps the run free of skipped
 * "not configured" noise while never letting learner coverage depend on admin
 * credentials.
 *
 * That narrowing needs configuration, and this runs at collection time — which
 * happens for every project and for `--list`, including on a fresh clone with no
 * `.env`. So an invalid environment is reported rather than thrown here and the
 * full role list is assumed; each setup body then calls `getConfig()`, so
 * actually running this project still fails fast with the same clear error.
 */
const configForRoles = getConfigIfValid('auth.setup');
const rolesToAuthenticate = configForRoles
  ? (defaultAuthProvider.availableRoles?.(configForRoles) ?? ROLES)
  : ROLES;

for (const role of rolesToAuthenticate) {
  setup(`authenticate as ${role}`, async ({ browser, request }) => {
    const config = getConfig();

    // Safety net: a configured-but-unusable role (e.g. wrong admin password) is a
    // real failure via authenticate(); only an explicit not-configured signal skips.
    let state;
    try {
      state = await defaultAuthProvider.authenticate(role, { config, browser, request });
    } catch (error) {
      if (error instanceof AuthNotConfiguredError) {
        setup.skip(true, error.message);
        return;
      }
      throw error;
    }

    assertAuthCookiesPresent(state, config);
    await assertStudioSessionPresent(request, config, role);

    const file = authStateFile(role);
    await mkdir(dirname(file), { recursive: true });
    persistStorageState(state, file);
  });
}
