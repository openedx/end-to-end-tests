import { newLearnerIdentity } from '../../../src/api';
import type { AccountBackend } from '../../../src/accounts';

/** Fixture plugin exporting a class — the shape most plugins will use. */
export default class ClassFixtureBackend implements AccountBackend {
  readonly name = 'class-fixture';

  createIdentity() {
    return Promise.resolve(newLearnerIdentity());
  }

  activate(): Promise<void> {
    return Promise.resolve();
  }
}
