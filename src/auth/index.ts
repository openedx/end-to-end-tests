export { ROLES, type Role } from './roles';
export { AuthError, AuthNotConfiguredError } from './errors';
export type { AuthContext, AuthProvider, StorageState } from './types';
export {
  AUTH_JWT_COOKIE,
  hasAuthenticatedSession,
  assertAuthCookiesPresent,
  assertStudioSessionPresent,
} from './preflight';
export { AUTH_STATE_DIR, authStateFile, isUsableStateFile, persistStorageState } from './storage';
export { ApiAuthProvider } from './api-provider';
export { defaultAuthProvider } from './default-provider';
