import type { APIRequestContext } from '@playwright/test';

import { TIMEOUTS } from '../config';
import { messageLinks, type Inbox, type MailOutcome, type MessageMatcher } from '../mail';

/**
 * A message carrying a link whose URL satisfies `test` — how a notification
 * mail is recognised without reading its localized copy: by the post, page or
 * token it links to.
 */
export function linkingTo(test: (url: URL) => boolean): MessageMatcher {
  return (message) => linkIn(message, test) !== undefined;
}

/**
 * Waits for a mail in `inbox` that satisfies `match`, under
 * `TIMEOUTS.emailDelivery` by default. Never throws on timeout: the spec
 * asserts on `found`, and `subjects` names what did arrive.
 */
export async function waitForMail(
  inbox: Inbox,
  request: APIRequestContext,
  match: MessageMatcher,
  timeoutMs: number = TIMEOUTS.emailDelivery,
): Promise<MailOutcome> {
  return inbox.waitForMessage({ request, match, timeoutMs });
}

/** The first link in a message whose URL satisfies `test`, if any. */
export function linkIn(
  message: Parameters<MessageMatcher>[0],
  test: (url: URL) => boolean,
): string | undefined {
  return messageLinks(message).find((link) => {
    try {
      return test(new URL(link));
    } catch {
      return false;
    }
  });
}
