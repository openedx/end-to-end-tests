import type { LtiToolProvider } from '../../../src/lti-tools';

/** A provider under the named `ltiToolProvider` export, beside an unrelated default. */
export const ltiToolProvider: LtiToolProvider = {
  name: 'named-fixture',
  features: new Set(['services']),
  openSession: () => Promise.reject(new Error('not used in unit tests')),
};

export default { name: 'something-else' };
