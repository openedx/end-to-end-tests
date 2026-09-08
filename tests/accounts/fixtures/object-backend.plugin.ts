import { newLearnerIdentity } from '../../../src/api';
import type { AccountBackend } from '../../../src/accounts';

/** Fixture plugin exporting a plain object under the named export. */
export const accountBackend: AccountBackend = {
  name: 'object-fixture',
  createIdentity: () => Promise.resolve(newLearnerIdentity()),
  activate: () => Promise.resolve(),
};
