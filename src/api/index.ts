// Barrel for the typed API client & data-factory layer.
export { ApiError } from './errors';
export { CSRF_HEADER, CSRF_TOKEN_PATH, fetchCsrfToken } from './csrf';
export { REGISTRATION_PATH, registerLearnerAccount } from './registration';
export { ACTIVATE_PATH, activateAccount, extractActivationKey } from './activation';
export { LOGIN_SESSION_PATH, loginSession, type LoginCredentials } from './login';
export { newLearnerIdentity, type LearnerIdentity } from './user-identity';
