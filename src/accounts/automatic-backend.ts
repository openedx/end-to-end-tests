import { newLearnerIdentity } from '../api';
import type { AccountBackend, AccountContext } from './types';

/**
 * The default backend for auto-activating targets (`SKIP_EMAIL_VALIDATION = True`,
 * the Tutor/sandbox default). New accounts are active on creation, so a generated
 * throwaway identity works and no activation step is required.
 */
export class AutomaticLoginBackend implements AccountBackend {
  readonly name = 'automatic';

  createIdentity(_context: AccountContext) {
    return Promise.resolve(newLearnerIdentity());
  }

  activate(): Promise<void> {
    // Nothing to do: the target activates accounts on creation.
    return Promise.resolve();
  }
}
