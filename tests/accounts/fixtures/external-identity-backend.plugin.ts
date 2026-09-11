import { newLearnerIdentity } from '../../../src/api';
import type { AccountBackend } from '../../../src/accounts';

/**
 * Fixture plugin standing in for an install whose identity lives outside the
 * LMS: it owns account creation, both sign-ins (LMS and Studio) and the
 * course-creator grant, and records each call instead of touching the network.
 * The author path must reach Studio through these — never the stock handshake or
 * the stock Django-admin grant, which such an install cannot serve.
 */
export const calls: string[] = [];

export const accountBackend: AccountBackend = {
  name: 'external-identity-fixture',
  createIdentity: () => Promise.resolve(newLearnerIdentity()),
  activate: () => Promise.resolve(),
  register: ({ identity }) => {
    calls.push(`register:${identity.username}`);
    return Promise.resolve();
  },
  signIn: ({ credentials }) => {
    calls.push(`signIn:${credentials.emailOrUsername}`);
    return Promise.resolve();
  },
  signInStudio: ({ credentials }) => {
    calls.push(`signInStudio:${credentials.emailOrUsername}`);
    return Promise.resolve();
  },
  grantCourseCreator: ({ identity }) => {
    calls.push(`grantCourseCreator:${identity.username}`);
    return Promise.resolve();
  },
};
