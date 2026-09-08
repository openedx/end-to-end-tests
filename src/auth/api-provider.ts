import {
  AccountNotConfiguredError,
  accountSignIn,
  provisionAuthorSession,
  provisionLearnerSession,
} from '../accounts';
import { establishStudioSession } from '../api';
import type { AppConfig } from '../config';
import { AuthNotConfiguredError } from './errors';
import type { Role } from './roles';
import type { AuthContext, AuthProvider, StorageState } from './types';

/**
 * The default authentication provider. It captures the parent-domain cookie jar
 * into a single storage state that covers every configured origin, without a UI to
 * drive. Providers with custom SSO swap in their own {@link AuthProvider} without
 * touching the tests.
 *
 * Per role:
 * - `learner` — provisions a fresh account via the configured account backend
 *   (`ACCOUNT_BACKEND`) and captures the session that **registration itself**
 *   creates. Registration auto-authenticates the request context ("Automatic
 *   login on"), so we do not perform a separate sign-in — which some installs
 *   block until the account's email is activated. Needs no configured credentials.
 *   A backend that creates accounts somewhere other than the LMS leaves the jar
 *   anonymous instead; only then do we sign in through the backend's `signIn`
 *   flow, after `activate` has run.
 * - `staff` — signs in with the pre-existing, configured `ADMIN_*` account through
 *   the account backend's sign-in flow (the LMS login-session API by default).
 *   Admin accounts are never provisioned: they exist on the target already, and
 *   an install with custom auth overrides `signIn` to reach them its own way.
 * - `instructor` — no default account exists; an installation supplies one by
 *   subclassing or swapping this provider. Reported as not-configured so the
 *   setup project skips it instead of failing the run.
 * - `author` — provisions a fresh account, gives it a Studio session through the
 *   silent OAuth handshake, and has the account backend grant course-creator
 *   status (see `provisionAuthorSession`). Offered only when the `studio`
 *   capability is declared. The default grant needs the admin account; without
 *   one, and on an install that does not grant everyone, it reports
 *   not-configured and the Studio specs skip with it.
 *
 * With `studio` declared, `staff` also completes the Studio handshake, so the
 * one stored state covers Studio too.
 */
export class ApiAuthProvider implements AuthProvider {
  /**
   * `learner` is always available (self-registration). `staff` is available only
   * when an admin account is configured. `instructor` has no default account, so
   * it is not offered here — an installation that needs it swaps in a provider
   * that lists it.
   */
  availableRoles(config: AppConfig): readonly Role[] {
    const roles: Role[] = ['learner'];
    if (config.credentials.admin) {
      roles.push('staff');
    }
    if (config.capabilities.has('studio')) {
      // Listed whenever Studio is declared: a configured-but-failing grant is a
      // real failure, an absent admin on a gated install is a not-configured skip
      // raised from authenticate() — same split as `staff`.
      roles.push('author');
    }
    return roles;
  }

  async authenticate(role: Role, context: AuthContext): Promise<StorageState> {
    const { config, request } = context;

    switch (role) {
      case 'learner': {
        // Leaves the request context authenticated, so capturing its storage
        // state below is all that's needed. Shared with the `courseLearner`
        // fixture so the two cannot drift — see `provisionLearnerSession` for
        // when it does and does not sign in.
        await provisionLearnerSession(request, config);
        break;
      }

      case 'staff': {
        const admin = config.credentials.admin;
        if (!admin) {
          throw new AuthNotConfiguredError(
            'The "staff" role needs an admin account. Set ADMIN_USERNAME and ' +
              'ADMIN_PASSWORD to enable staff-role coverage.',
          );
        }
        await accountSignIn({
          config,
          request,
          credentials: { emailOrUsername: admin.username, password: admin.password },
        });
        if (config.capabilities.has('studio')) {
          await establishStudioSession(request, config);
        }
        break;
      }

      case 'author': {
        if (!config.capabilities.has('studio')) {
          throw new AuthNotConfiguredError(
            'The "author" role needs Studio. Declare the "studio" capability (and set ' +
              'CMS_BASE_URL) to enable Studio coverage.',
          );
        }
        try {
          await provisionAuthorSession(request, config);
        } catch (error) {
          // The account layer's "nothing to grant with" becomes the auth layer's
          // "skip this role"; anything else is a real failure.
          if (error instanceof AccountNotConfiguredError) {
            throw new AuthNotConfiguredError(error.message);
          }
          throw error;
        }
        break;
      }

      case 'instructor': {
        throw new AuthNotConfiguredError(
          'The default provider has no "instructor" account. Supply one by swapping ' +
            'or subclassing the auth provider for your installation.',
        );
      }
    }

    return request.storageState();
  }
}
