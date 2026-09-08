/**
 * Example custom account backend: activation through a real inbox, automated.
 *
 * Demonstrates the plugin API from
 * [issue #15](https://github.com/openedx/end-to-end-tests/issues/15) — it lives
 * outside `src/`, is loaded only via `CUSTOM_ACCOUNT_BACKEND_PLUGINS`, and uses
 * nothing the suite does not expose to any operator's own plugin.
 *
 * It does non-interactively what the built-in `manual` backend asks an operator
 * to do by hand: register with an inbox the run can read, wait for the Open edX
 * activation email, and visit the link in it. Use it against a target that
 * really sends activation email (`SKIP_EMAIL_VALIDATION = False` plus working
 * SMTP) when you want that flow covered unattended.
 *
 *     CUSTOM_ACCOUNT_BACKEND_PLUGINS=./plugins/openinbox.plugin.ts
 *     ACCOUNT_BACKEND=openinbox
 *     OPENINBOX_API_KEY=...        # reading an inbox needs a paid OpenInbox plan
 *
 * Only `createIdentity` and `activate` are implemented; sign-in and sign-out
 * fall back to the suite defaults, which is the point of their being optional.
 */

import type { APIRequestContext } from '@playwright/test';

import { activateAccount, newLearnerIdentity, type LearnerIdentity } from '../src/api';
import type { AccountBackend, AccountContext, ActivationContext } from '../src/accounts';

/** OpenInbox API root. Override for a mock server in tests. */
const DEFAULT_BASE_URL = 'https://api.openinbox.io/api';
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_INTERVAL_MS = 3_000;

/** Shape of the pieces of the OpenInbox payloads this backend relies on. */
interface OpenInboxInbox {
  readonly email?: string;
}

interface OpenInboxEmail {
  readonly subject?: string;
  readonly textBody?: string;
  readonly htmlBody?: string;
}

interface OpenInboxEmailList {
  readonly emails?: readonly OpenInboxEmail[];
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number of milliseconds (got "${raw}").`);
  }
  return parsed;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pulls the LMS activation link out of an email body. Matches the `/activate/`
 * route the platform emails, in either the plain-text or the HTML part, and
 * un-escapes the entities an HTML body may carry.
 */
export function findActivationLink(body: string): string | undefined {
  const match = /https?:\/\/[^\s"'<>]*\/activate\/[^\s"'<>]+/.exec(body);
  return match?.[0].replaceAll('&amp;', '&');
}

export class OpenInboxBackend implements AccountBackend {
  readonly name = 'openinbox';

  private readonly baseUrl = (process.env.OPENINBOX_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  );

  /**
   * Creates a disposable inbox and registers with its address. Inbox creation
   * needs no API key; reading it later does, so the key is checked here to fail
   * before an account exists rather than after.
   */
  async createIdentity({ request }: AccountContext): Promise<LearnerIdentity> {
    this.apiKey();

    const url = `${this.baseUrl}/inbox`;
    const response = await request.post(url, { headers: { 'Content-Type': 'application/json' } });
    if (!response.ok()) {
      throw new Error(
        `OpenInbox inbox creation failed (HTTP ${response.status()}) at ${url}: ` +
          `${await response.text()}`,
      );
    }

    const inbox = (await response.json()) as OpenInboxInbox;
    if (typeof inbox.email !== 'string' || inbox.email === '') {
      throw new Error(
        `OpenInbox inbox creation returned no email address: ${JSON.stringify(inbox)}`,
      );
    }

    return newLearnerIdentity({ email: inbox.email });
  }

  /**
   * Waits for the activation email to land in the inbox we registered with, then
   * visits its link through the suite's own activation helper.
   */
  async activate({ config, request, identity }: ActivationContext): Promise<void> {
    const timeoutMs = envNumber('OPENINBOX_POLL_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    const intervalMs = envNumber('OPENINBOX_POLL_INTERVAL_MS', DEFAULT_INTERVAL_MS);
    const deadline = Date.now() + timeoutMs;
    const subjects: string[] = [];

    for (;;) {
      for (const email of await this.fetchEmails(request, identity.email)) {
        const link =
          findActivationLink(email.textBody ?? '') ?? findActivationLink(email.htmlBody ?? '');
        if (link !== undefined) {
          await activateAccount(request, config, link);
          return;
        }
        if (email.subject !== undefined) {
          subjects.push(email.subject);
        }
      }

      if (Date.now() >= deadline) {
        const seen =
          subjects.length === 0
            ? 'no email arrived'
            : `messages seen: ${[...new Set(subjects)].join(', ')}`;
        throw new Error(
          `No activation link reached ${identity.email} within ${timeoutMs}ms (${seen}). ` +
            'Check that the target sends activation email (SKIP_EMAIL_VALIDATION = False ' +
            'and a working SMTP backend).',
        );
      }
      await sleep(intervalMs);
    }
  }

  private apiKey(): string {
    const key = process.env.OPENINBOX_API_KEY;
    if (key === undefined || key.trim() === '') {
      throw new Error(
        'OPENINBOX_API_KEY is required by the openinbox account backend ' +
          '(reading an inbox needs a paid OpenInbox plan).',
      );
    }
    return key;
  }

  private async fetchEmails(
    request: APIRequestContext,
    inboxEmail: string,
  ): Promise<readonly OpenInboxEmail[]> {
    const url = `${this.baseUrl}/inbound/api/emails?inboxEmail=${encodeURIComponent(inboxEmail)}`;
    const response = await request.get(url, { headers: { 'X-API-KEY': this.apiKey() } });
    if (!response.ok()) {
      throw new Error(
        `OpenInbox email poll failed (HTTP ${response.status()}) at ${url}: ${await response.text()}`,
      );
    }
    const payload = (await response.json()) as OpenInboxEmailList;
    return payload.emails ?? [];
  }
}

export default OpenInboxBackend;
