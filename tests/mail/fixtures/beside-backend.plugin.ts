import type { Inbox, MailProvider } from '../../../src/mail';

/**
 * Fixture plugin shaped like `plugins/openinbox.plugin.ts`: an account backend
 * as the default export and the provider as the named `mailProvider` export.
 */
export const mailProvider: MailProvider = {
  name: 'beside-fixture',
  createInbox: (): Promise<Inbox> => Promise.reject(new Error('unused')),
};

export default { name: 'not-a-mail-provider' };
