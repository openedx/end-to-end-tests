import { AuthError } from './errors';
import type { Role } from './roles';
import type { AuthContext, AuthProvider, StorageState } from './types';

/**
 * The default auth provider — a stub for Epic 1.
 *
 * The real MFE sign-in (API-driven `POST /api/user/v1/account/login_session/`
 * plus parent-domain cookie capture into one storage state) lands in Epic 2. The
 * contract, wiring, and preflight are in place now so that epic only replaces
 * this implementation.
 */
export class StubAuthProvider implements AuthProvider {
  authenticate(role: Role, _context: AuthContext): Promise<StorageState> {
    return Promise.reject(
      new AuthError(
        `The default auth provider is a stub; the real sign-in flow lands in Epic 2. ` +
          `Cannot authenticate role "${role}" yet.`,
      ),
    );
  }
}

/** The default provider instance the setup project uses; swap for a real one. */
export const defaultAuthProvider: AuthProvider = new StubAuthProvider();

export function isStubAuthProvider(provider: AuthProvider): boolean {
  return provider instanceof StubAuthProvider;
}
