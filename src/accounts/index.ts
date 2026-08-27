export type { AccountBackend, AccountContext, ActivationContext } from './types';
export { AutomaticLoginBackend } from './automatic-backend';
export { ManualActivationBackend } from './manual-backend';
export {
  AccountPluginRegistry,
  initAccountBackends,
  resetAccountBackends,
  resolveAccountBackend,
  getAccountBackend,
} from './registry';
export { loadAccountBackendPlugin } from './plugin-loader';
export { provisionLearnerAccount } from './provision';
export { promptOperator } from './prompt';
