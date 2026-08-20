import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { test as setup } from '@playwright/test';

import {
  assertAuthCookiesPresent,
  AuthNotConfiguredError,
  authStateFile,
  defaultAuthProvider,
  ROLES,
} from '../src/auth';
import { getConfig } from '../src/config';

/**
 * Authentication setup project. Signs in once per role and writes the storage
 * state to `.auth/<role>.json`; authenticated projects then consume it via
 * `use: { storageState }`. A single sign-in yields parent-domain cookies that
 * cover every origin, so one state authenticates LMS, Studio, and all MFEs.
 *
 * Only roles the provider can actually authenticate for the current config get a
 * setup entry (e.g. `staff` appears only when an admin account is configured;
 * `instructor` needs a custom provider). This keeps the run free of skipped
 * "not configured" noise while never letting learner coverage depend on admin
 * credentials.
 */
const rolesToAuthenticate = defaultAuthProvider.availableRoles?.(getConfig()) ?? ROLES;

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

    const file = authStateFile(role);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(state, null, 2), 'utf8');
  });
}
