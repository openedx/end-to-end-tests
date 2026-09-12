/**
 * Raised when an account flow cannot run because the environment lacks what it
 * needs — no admin account to grant course-creator status, for instance. The
 * auth layer above translates it into its own not-configured signal so the setup
 * project skips the role instead of failing the run.
 */
export class AccountNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountNotConfiguredError';
  }
}
