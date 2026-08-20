import type { APIRequestContext } from '@playwright/test';

import type { LearnerIdentity } from '../api';
import type { AppConfig } from '../config';

/** Resources a backend may use to register and activate an account. */
export interface AccountContext {
  readonly config: AppConfig;
  readonly request: APIRequestContext;
}

/** Context for the activation step: adds the identity that was just registered. */
export interface ActivationContext extends AccountContext {
  readonly identity: LearnerIdentity;
}

/**
 * A user-choosable account-creation / activation backend
 * (https://github.com/openedx/end-to-end-tests/issues/10).
 *
 * A backend decides two things that vary by installation:
 * 1. which identity to register with (`createIdentity`) — a throwaway address for
 *    auto-activating targets, or an operator-supplied inbox for manual runs; and
 * 2. how a freshly-registered account becomes able to sign in (`activate`) — a
 *    no-op when the target auto-activates, or fetching the activation link
 *    otherwise.
 *
 * Selecting a backend by config (`ACCOUNT_BACKEND`) keeps the specs identical
 * across targets.
 */
export interface AccountBackend {
  /** Backend name, matching the `ACCOUNT_BACKEND` value that selects it. */
  readonly name: string;

  /** Produce the identity to register with. */
  createIdentity(context: AccountContext): Promise<LearnerIdentity>;

  /** Make the just-registered account able to sign in. */
  activate(context: ActivationContext): Promise<void>;
}
