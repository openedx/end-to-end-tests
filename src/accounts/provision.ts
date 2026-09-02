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

/**
 * Provisions a learner **and leaves `request` holding their session** — the one
 * way the suite obtains a usable learner context, for the auth provider's
 * storage state and for specs that need an accounts of their own.
 *
 * Registration authenticates the request context itself (the platform calls
 * `set_logged_in_cookies` on success), so there is deliberately **no sign-in
 * here**. Signing in afterwards is not merely redundant, it fails: the LMS
 * rejects a `login_session` POST made on a context that already carries a
 * session, and because Django's 400 handler replaces the view's JSON the caller
 * gets a bare HTML "Bad Request" with no error code — which is exactly as
 * confusing as it sounds. A fresh context signing in with the same credentials
 * succeeds, so the credentials are never what is wrong.
 *
 * A backend that overrides `signIn` is a different matter: it is telling us its
 * install does not authenticate through registration (SSO, an external IdP), so
 * its override runs. What never runs from here is the *default* password sign-in.
 */
export async function provisionLearnerSession(
  request: APIRequestContext,
  config: AppConfig,
): Promise<LearnerIdentity> {
  const identity = await provisionLearnerAccount(request, config);

  const backend = await resolveAccountBackend(config);
  if (backend.signIn) {
    await backend.signIn({
      config,
      request,
      credentials: { emailOrUsername: identity.email, password: identity.password },
    });
  }

  return identity;
}
