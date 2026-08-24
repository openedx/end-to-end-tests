import { ApiAuthProvider } from './api-provider';
import type { AuthProvider } from './types';

/**
 * The default provider instance the setup project uses. It signs in through the
 * LMS APIs the authn MFE calls and captures parent-domain cookies into one
 * storage state (see {@link ApiAuthProvider}).
 *
 * An installation with custom auth swaps this for its own {@link AuthProvider}
 * implementing the same contract — the setup project and specs are unchanged.
 */
export const defaultAuthProvider: AuthProvider = new ApiAuthProvider();
