import { accountSignIn, provisionLearnerAccount } from '../accounts';
import type { AppConfig } from '../config';
import { AuthNotConfiguredError } from './errors';
import { hasAuthenticatedSession } from './preflight';
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
    return roles;
  }

  async authenticate(role: Role, context: AuthContext): Promise<StorageState> {
    const { config, request } = context;

    switch (role) {
      case 'learner': {
        const identity = await provisionLearnerAccount(request, config);
        // On a stock install registration authenticates the request context
        // itself, so capturing its storage state is all that's needed. A backend
        // whose accounts originate elsewhere separates account creation from
        // session establishment, and leaves the jar anonymous — sign in
        // explicitly in that case only, so the stock path still makes no extra
        // call and never depends on the account being able to log in.
        const { cookies } = await request.storageState();
        if (!hasAuthenticatedSession(cookies)) {
          await accountSignIn({
            config,
            request,
            credentials: { emailOrUsername: identity.email, password: identity.password },
          });
        }
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
