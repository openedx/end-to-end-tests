import { activateAccount, newLearnerIdentity } from '../api';
import { promptOperator } from './prompt';
import type { AccountBackend, AccountContext, ActivationContext } from './types';

/**
 * Interactive backend for targets that enforce email activation and whose config
 * cannot be changed (e.g. a live instance). The operator supplies a real inbox to
 * register with, then pastes the activation link/token from the email; the suite
 * visits it to activate the account so sign-in works.
 *
 * Use with `--workers=1` so the prompts do not interleave. Username and password
 * are still generated — only the email must be operator-controlled.
 */
export class ManualActivationBackend implements AccountBackend {
  readonly name = 'manual';

  async createIdentity(_context: AccountContext) {
    const email = await promptOperator(
      'Enter an email address to register with (an inbox you can read; ' +
        'plus-addressing like you+e2e1@example.com lets you reuse one inbox): ',
    );
    return newLearnerIdentity({ email });
  }

  async activate({ config, request, identity }: ActivationContext): Promise<void> {
    const pasted = await promptOperator(
      `Registered ${identity.email}. Paste the activation link or token from the ` +
        'activation email, then press Enter: ',
    );
    await activateAccount(request, config, pasted);
  }
}
