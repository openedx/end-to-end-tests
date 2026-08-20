import { provisionLearnerAccount } from '../accounts';
import { loginSession } from '../api';
import { AuthNotConfiguredError } from './errors';
import type { Role } from './roles';
import type { AuthContext, AuthProvider, StorageState } from './types';

/**
 * The default authentication provider, using the **API path** the authn MFE
 * itself calls (`GET /csrf/api/v1/token` → `POST .../login_session/`). It is fast
 * and flake-free — no UI to drive — and captures the parent-domain cookie jar
 * into a single storage state that covers every configured origin. Providers with
 * custom SSO swap in their own {@link AuthProvider} without touching the tests.
 *
 * Per role:
 * - `learner` — provisions a fresh account via the configured account backend
 *   (`ACCOUNT_BACKEND`: auto-activating by default, or interactive/manual for
 *   targets that enforce email validation), then signs in. Needs no configured
 *   credentials.
 * - `staff` — signs in with the configured `ADMIN_*` account.
 * - `instructor` — no default account exists; an installation supplies one by
 *   subclassing or swapping this provider. Reported as not-configured so the
 *   setup project skips it instead of failing the run.
 */
export class ApiAuthProvider implements AuthProvider {
  async authenticate(role: Role, context: AuthContext): Promise<StorageState> {
    const { config, request } = context;

    switch (role) {
      case 'learner': {
        const identity = await provisionLearnerAccount(request, config);
        await loginSession(request, config, {
          emailOrUsername: identity.email,
          password: identity.password,
        });
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
        await loginSession(request, config, {
          emailOrUsername: admin.username,
          password: admin.password,
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
