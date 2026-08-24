import { test, expect } from '@playwright/test';

import { newLearnerIdentity } from '../../src/api';

/**
 * Pure unit tests for the learner data factory. Verifies the unique-per-run,
 * parallel-safe guarantees the stability rules require. No browser or target.
 */
test.describe('newLearnerIdentity', { tag: '@unit' }, () => {
  test('produces unique usernames and emails across calls', () => {
    const identities = Array.from({ length: 100 }, () => newLearnerIdentity());
    const usernames = new Set(identities.map((i) => i.username));
    const emails = new Set(identities.map((i) => i.email));

    expect(usernames.size).toBe(identities.length);
    expect(emails.size).toBe(identities.length);
  });

  test('derives the email from the username', () => {
    const identity = newLearnerIdentity();
    expect(identity.email.startsWith(`${identity.username}@`)).toBe(true);
    expect(identity.email.endsWith('@example.com')).toBe(true);
  });

  test('keeps the password unrelated to the username', () => {
    const identity = newLearnerIdentity();
    expect(identity.password.toLowerCase()).not.toContain(identity.username.toLowerCase());
    // Reasonable strength: length, upper, lower, digit, symbol.
    expect(identity.password).toMatch(/[A-Z]/);
    expect(identity.password).toMatch(/[a-z]/);
    expect(identity.password).toMatch(/\d/);
    expect(identity.password).toMatch(/[^A-Za-z0-9]/);
  });

  test('applies overrides', () => {
    const identity = newLearnerIdentity({ email: 'fixed@example.com', name: 'Given Name' });
    expect(identity.email).toBe('fixed@example.com');
    expect(identity.name).toBe('Given Name');
    // Non-overridden fields are still generated.
    expect(identity.username).toMatch(/^e2e_/);
  });
});
