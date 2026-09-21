import { randomUUID } from 'node:crypto';

/**
 * A complete set of credentials for a learner account the suite creates itself.
 * Everything a registration or login call needs, generated to be unique per run
 * so parallel tests never collide (ADR-0002, stability rules).
 */
export interface LearnerIdentity {
  /** Full name for the profile. */
  readonly name: string;
  /** Login username. Unique per identity. */
  readonly username: string;
  /** Email address. Unique per identity. */
  readonly email: string;
  /** Password. Deliberately unrelated to the username (Django rejects similar ones). */
  readonly password: string;
}

/**
 * Domain used for generated addresses. `example.com` is reserved by RFC 2606, so
 * these accounts can never reach a real inbox — email confirmation is handled in
 * the test context rather than by polling webmail.
 */
const EMAIL_DOMAIN = 'example.com';

/**
 * A fixed, sufficiently-strong password. Kept unrelated to the (varying) username
 * because Open edX rejects passwords too similar to it. A constant is fine: these
 * are throwaway accounts and the value is not what the tests exercise.
 */
export const DEFAULT_PASSWORD = 'Pl4ywright!Test';

/**
 * Builds a unique, deterministic-per-call learner identity.
 *
 * Uniqueness comes from a short slice of a UUID, so two identities created in the
 * same millisecond across parallel workers still differ. Callers may override any
 * field (e.g. to force a duplicate email for a negative test).
 */
/**
 * Rebuilds the identity of an account the suite created, from its username.
 *
 * A resumed session knows only who it is signed in as; every other field
 * follows the convention {@link newLearnerIdentity} writes, so deriving them
 * here keeps that convention in one place — and keeps a resumed identity's
 * e-mail from being a freshly generated address that belongs to no account.
 */
export function learnerIdentityFor(username: string): LearnerIdentity {
  return {
    name: `E2E Test ${username.replace(/^e2e_/, '')}`,
    username,
    email: `${username}@${EMAIL_DOMAIN}`,
    password: DEFAULT_PASSWORD,
  };
}

export function newLearnerIdentity(overrides: Partial<LearnerIdentity> = {}): LearnerIdentity {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const username = `e2e_${suffix}`;

  return {
    name: `E2E Test ${suffix}`,
    username,
    email: `${username}@${EMAIL_DOMAIN}`,
    password: DEFAULT_PASSWORD,
    ...overrides,
  };
}
