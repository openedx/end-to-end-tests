import { newLearnerIdentity } from '../../../src/api';
import type { AccountBackend } from '../../../src/accounts';

/**
 * Fixture plugin overriding all three auth flows. Each records its call instead
 * of touching a browser or the network, so the dispatch tests can assert that the
 * backend — not the default flow — ran.
 */
export const calls: string[] = [];

export const accountBackend: AccountBackend = {
  name: 'auth-flows-fixture',
  createIdentity: () => Promise.resolve(newLearnerIdentity()),
  activate: () => Promise.resolve(),
  signIn: ({ credentials }) => {
    calls.push(`signIn:${credentials.emailOrUsername}`);
    return Promise.resolve();
  },
  signInThroughUi: ({ credentials }) => {
    calls.push(`signInThroughUi:${credentials.emailOrUsername}`);
    return Promise.resolve();
  },
  signOutThroughUi: ({ username }) => {
    calls.push(`signOutThroughUi:${username}`);
    return Promise.resolve();
  },
};
