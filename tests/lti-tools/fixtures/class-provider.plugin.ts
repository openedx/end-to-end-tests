import type { LtiToolFeature, LtiToolProvider, LtiToolSession } from '../../../src/lti-tools';

/** A provider exported as a class, as a plugin may write one. */
export default class ClassFixtureProvider implements LtiToolProvider {
  readonly name = 'class-fixture';
  readonly features: ReadonlySet<LtiToolFeature> = new Set(['claims', 'inline']);
  openSession(): Promise<LtiToolSession> {
    return Promise.reject(new Error('not used in unit tests'));
  }
}
