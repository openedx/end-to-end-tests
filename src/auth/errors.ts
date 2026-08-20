/** Raised when authentication or its post-login preflight fails. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Raised when a role cannot be authenticated because the environment does not
 * supply the credentials it needs (e.g. no admin account for `staff`). Distinct
 * from {@link AuthError} so the setup project can *skip* that role rather than
 * fail the whole run — learner coverage should not require admin credentials.
 */
export class AuthNotConfiguredError extends AuthError {
  constructor(message: string) {
    super(message);
    this.name = 'AuthNotConfiguredError';
  }
}
