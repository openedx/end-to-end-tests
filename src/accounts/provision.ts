import type { APIRequestContext } from '@playwright/test';

import { registerLearnerAccount, type LearnerIdentity } from '../api';
import type { AppConfig } from '../config';
import { resolveAccountBackend } from './registry';

/**
 * Provisions a learner account that can sign in, using the configured backend:
 * create an identity, register it, then activate it. Returns the identity so the
 * caller can sign in (via the UI or the login API).
 *
 * This is the single seam every consumer uses to obtain a usable account, so
 * swapping `ACCOUNT_BACKEND` changes the whole suite's account-creation behaviour
 * without touching the auth provider or the specs.
 */
export async function provisionLearnerAccount(
  request: APIRequestContext,
  config: AppConfig,
): Promise<LearnerIdentity> {
  const backend = await resolveAccountBackend(config);
  const identity = await backend.createIdentity({ config, request });
  await registerLearnerAccount(request, config, identity);
  await backend.activate({ config, request, identity });
  return identity;
}
