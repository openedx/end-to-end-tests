import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { test as setup } from '@playwright/test';

import {
  assertAuthCookiesPresent,
  authStateFile,
  defaultAuthProvider,
  isStubAuthProvider,
  ROLES,
} from '../src/auth';
import { getConfig } from '../src/config';

/**
 * Authentication setup project. Signs in once per role and writes the storage
 * state to `.auth/<role>.json`; authenticated projects then consume it via
 * `use: { storageState }`. A single sign-in yields parent-domain cookies that
 * cover every origin, so one state authenticates LMS, Studio, and all MFEs.
 *
 * Epic 1 ships the stub provider, so this skips cleanly; Epic 2 replaces
 * `defaultAuthProvider` and these become live sign-ins.
 */
if (isStubAuthProvider(defaultAuthProvider)) {
  setup('authenticate (stub)', () => {
    setup.skip(true, 'Auth provider is the Epic 1 stub; the real sign-in flow lands in Epic 2.');
  });
} else {
  for (const role of ROLES) {
    setup(`authenticate as ${role}`, async ({ browser, request }) => {
      const config = getConfig();
      const state = await defaultAuthProvider.authenticate(role, { config, browser, request });
      assertAuthCookiesPresent(state, config);

      const file = authStateFile(role);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(state, null, 2), 'utf8');
    });
  }
}
