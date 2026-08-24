import type { AccountBackendName, AppConfig } from '../config';
import { AutomaticLoginBackend } from './automatic-backend';
import { ManualActivationBackend } from './manual-backend';
import type { AccountBackend } from './types';

/**
 * Returns the account backend selected by configuration (`ACCOUNT_BACKEND`).
 *
 * The mapping is exhaustive over {@link AccountBackendName}, so adding a backend
 * to the config vocabulary without wiring it here is a compile error.
 */
export function getAccountBackend(config: AppConfig): AccountBackend {
  const backend: AccountBackendName = config.accountBackend;
  switch (backend) {
    case 'automatic':
      return new AutomaticLoginBackend();
    case 'manual':
      return new ManualActivationBackend();
  }
}
