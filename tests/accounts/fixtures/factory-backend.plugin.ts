import { newLearnerIdentity } from '../../../src/api';
import type { AccountBackend } from '../../../src/accounts';

/** Fixture plugin exporting a factory function. */
export default function makeBackend(): AccountBackend {
  return {
    name: 'factory-fixture',
    createIdentity: () => Promise.resolve(newLearnerIdentity()),
    activate: () => Promise.resolve(),
  };
}
