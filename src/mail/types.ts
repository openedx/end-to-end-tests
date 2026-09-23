import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';

/** One e-mail as a mailbox provider reads it. */
export interface MailMessage {
  /** The provider's id for the message, unique within the inbox. */
  readonly id: string;
  readonly subject: string;
  /** The plain-text part, or `''` when the message has none. */
  readonly text: string;
  /** The HTML part, or `''` when the message has none. */
  readonly html: string;
}

/**
 * Decides whether a message is the one a caller is waiting for. Match on data
 * the test supplied (a thread title, a link's path), never on the platform's
 * localized copy (ADR-0002).
 */
export type MessageMatcher = (message: MailMessage) => boolean;

/**
 * What a wait saw. `found` is the first matching message, or `undefined` when
 * the budget ran out; `subjects` lists every other message that arrived, so a
 * timeout can say what did reach the inbox instead of just "nothing".
 */
export interface MailOutcome {
  readonly found: MailMessage | undefined;
  readonly subjects: readonly string[];
}

/** Resources a provider may use: the run's config and a request context. */
export interface MailContext {
  readonly config: AppConfig;
  readonly request: APIRequestContext;
}

/** Arguments of {@link Inbox.waitForMessage}. */
export interface WaitForMessageOptions {
  /** The context to poll with — the caller's, which may not be the creator's. */
  readonly request: APIRequestContext;
  readonly match: MessageMatcher;
  readonly timeoutMs: number;
}

/**
 * An address the suite can read mail for. Created per use and disposed after:
 * what arrived in it is the assertion, so it is never shared between tests.
 */
export interface Inbox {
  /** The address to register an account with or send to. */
  readonly address: string;
  /**
   * Polls until a message satisfies `match` or `timeoutMs` elapses. A timeout
   * is an outcome, not an error — the spec decides; a provider error (bad
   * credentials, an unreachable API) still throws.
   */
  waitForMessage(options: WaitForMessageOptions): Promise<MailOutcome>;
  /** Frees the inbox (and its messages) where the provider holds any. Best-effort. */
  dispose(request: APIRequestContext): Promise<void>;
}

/**
 * A mailbox service the suite reads e-mail through, supplied by a plugin module
 * listed in `CUSTOM_MAIL_PROVIDER_PLUGINS` and selected by `MAIL_PROVIDER`.
 *
 * The suite ships no built-in provider: a mailbox is operator infrastructure,
 * not a platform surface, so which one a target mails to is configuration.
 */
export interface MailProvider {
  /** The name `MAIL_PROVIDER` selects it by. */
  readonly name: string;
  createInbox(context: MailContext): Promise<Inbox>;
}
