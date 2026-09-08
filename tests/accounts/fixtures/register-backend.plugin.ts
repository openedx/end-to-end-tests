import { newLearnerIdentity } from '../../../src/api';
import type { AccountBackend } from '../../../src/accounts';

/**
 * Fixture plugin that owns account creation, standing in for an install whose
 * accounts come from somewhere other than the LMS. It records the identity it was
 * asked to create instead of calling anything.
 */
export const registered: string[] = [];

export const accountBackend: AccountBackend = {
  name: 'register-fixture',
  createIdentity: () => Promise.resolve(newLearnerIdentity()),
  activate: () => Promise.resolve(),
  register: ({ identity }) => {
    registered.push(identity.username);
    return Promise.resolve();
  },
};
