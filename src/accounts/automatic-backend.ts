import { newLearnerIdentity } from '../api';
import type { AccountBackend, AccountContext } from './types';

/**
 * "Automatic login on" — the default backend
 * (https://github.com/openedx/end-to-end-tests/issues/10).
 *
 * Registration auto-authenticates the request context (the platform calls
 * `set_logged_in_cookies` on every successful registration), so a newly-created
 * account already has a usable session. A generated throwaway `@example.com`
 * identity is enough and there is nothing to activate — no email is ever needed.
 *
 * This works both on the typical `SKIP_EMAIL_VALIDATION = True` sandbox/Tutor
 * default (where the account is also active) and on installs that leave accounts
 * inactive until activation, because the auth contract captures the registration
 * session rather than performing a separate sign-in. Note that specs which drive a
 * *separate* UI sign-in (login/logout) still require an install where the account
 * can log in — i.e. `SKIP_EMAIL_VALIDATION = True` or an activating backend.
 */
export class AutomaticLoginBackend implements AccountBackend {
  readonly name = 'automatic';

  createIdentity(_context: AccountContext) {
    return Promise.resolve(newLearnerIdentity());
  }

  activate(): Promise<void> {
    // Nothing to do: registration already yields an authenticated session.
    return Promise.resolve();
  }
}
