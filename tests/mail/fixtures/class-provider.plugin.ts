import type { Inbox, MailProvider } from '../../../src/mail';

/** Fixture plugin whose default export is a MailProvider class. */
export default class ClassFixtureProvider implements MailProvider {
  readonly name = 'class-fixture';

  createInbox(): Promise<Inbox> {
    return Promise.reject(new Error('unused'));
  }
}
