export type {
  Inbox,
  MailContext,
  MailMessage,
  MailOutcome,
  MailProvider,
  MessageMatcher,
  WaitForMessageOptions,
} from './types';
export { messageLinks } from './links';
export { loadMailProviderPlugin } from './plugin-loader';
export { MailProviderRegistry, initMailProviders, resolveMailProvider } from './registry';
