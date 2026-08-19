export { ROLES, isRole, type Role } from './roles';
export { AuthError } from './errors';
export type { AuthContext, AuthProvider, StorageState } from './types';
export { ESSENTIAL_SESSION_COOKIE, assertAuthCookiesPresent } from './preflight';
export { AUTH_STATE_DIR, authStateFile } from './storage';
export { StubAuthProvider, defaultAuthProvider, isStubAuthProvider } from './default-provider';
