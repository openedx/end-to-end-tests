/**
 * Mailbox provider: a [Mailpit](https://mailpit.axllent.org) catcher the target
 * sends its mail to.
 *
 * Mailpit accepts every message its SMTP port receives, whatever the recipient,
 * and serves them over an HTTP API. So an "inbox" here is just a fresh, unique
 * address: nothing is created up front, and a wait searches Mailpit for mail to
 * that address. That makes it the provider for a target the run stands up
 * itself — the Tutor CI workflow adds a Mailpit service and points the
 * platform's SMTP settings at it, which needs no secret, no request cap and no
 * outbound mail from the runner.
 *
 *     CUSTOM_MAIL_PROVIDER_PLUGINS=./plugins/mailpit.plugin.ts
 *     MAIL_PROVIDER=mailpit
 *     MAILPIT_BASE_URL=http://localhost:8025   # Mailpit's web/API origin
 *
 * Optional:
 *
 *     MAILPIT_DOMAIN=e2e.test                  # domain of the minted addresses
 *     MAILPIT_POLL_INTERVAL_MS=1000
 *
 * Like every plugin it reads and validates its own variables (CONVENTIONS
 * "Configuration and secrets"): a missing or malformed `MAILPIT_BASE_URL` fails
 * when the plugin is loaded, in global setup, before any account is registered.
 */

import { randomUUID } from 'node:crypto';

import type { APIRequestContext } from '@playwright/test';

import type {
  Inbox,
  MailContext,
  MailMessage,
  MailOutcome,
  MailProvider,
  WaitForMessageOptions,
} from '../src/mail';

const DEFAULT_DOMAIN = 'e2e.test';
const DEFAULT_INTERVAL_MS = 1_000;

/** `GET /api/v1/search`: the matching messages' summaries. */
interface MailpitSearch {
  readonly messages?: readonly { readonly ID?: string; readonly Subject?: string }[];
}

/** `GET /api/v1/message/:id`: one message with both bodies. */
interface MailpitMessage {
  readonly ID?: string;
  readonly Subject?: string;
  readonly Text?: string;
  readonly HTML?: string;
}

export interface MailpitOptions {
  /** Mailpit's web/API origin, e.g. `http://localhost:8025`. */
  readonly baseUrl: string;
  readonly domain: string;
  readonly pollIntervalMs: number;
}

/** Reads and validates the plugin's variables. */
export function mailpitOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): MailpitOptions {
  const rawBaseUrl = env.MAILPIT_BASE_URL?.trim();
  if (rawBaseUrl === undefined || rawBaseUrl === '') {
    throw new Error(
      'MAILPIT_BASE_URL is required by the mailpit plugin: set it to the Mailpit web/API ' +
        'origin the run can reach (e.g. http://localhost:8025).',
    );
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error(`MAILPIT_BASE_URL must be an absolute http(s) URL (got "${rawBaseUrl}").`);
  }
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new Error(`MAILPIT_BASE_URL must use http:// or https:// (got "${rawBaseUrl}").`);
  }

  const domain = env.MAILPIT_DOMAIN?.trim() || DEFAULT_DOMAIN;
  if (!/^[a-z0-9.-]+\.[a-z0-9-]+$/i.test(domain)) {
    throw new Error(`MAILPIT_DOMAIN must be a domain name like e2e.test (got "${domain}").`);
  }

  const rawInterval = env.MAILPIT_POLL_INTERVAL_MS?.trim();
  const pollIntervalMs =
    rawInterval === undefined || rawInterval === '' ? DEFAULT_INTERVAL_MS : Number(rawInterval);
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new Error(
      `MAILPIT_POLL_INTERVAL_MS must be a positive number of milliseconds (got "${rawInterval}").`,
    );
  }

  return { baseUrl: baseUrl.href.replace(/\/+$/, ''), domain, pollIntervalMs };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mail addressed to one minted address, read from Mailpit. */
class MailpitInbox implements Inbox {
  constructor(
    private readonly options: MailpitOptions,
    readonly address: string,
  ) {}

  /** Mailpit's search query for this inbox's mail. */
  private get searchUrl(): string {
    const query = encodeURIComponent(`to:"${this.address}"`);
    return `${this.options.baseUrl}/api/v1/search?query=${query}`;
  }

  async waitForMessage({ request, match, timeoutMs }: WaitForMessageOptions): Promise<MailOutcome> {
    const deadline = Date.now() + timeoutMs;
    const subjects: string[] = [];
    const inspected = new Set<string>();

    for (;;) {
      const search = await this.getJson<MailpitSearch>(request, this.searchUrl, 'search');
      for (const summary of search.messages ?? []) {
        if (summary.ID === undefined || inspected.has(summary.ID)) {
          continue;
        }
        inspected.add(summary.ID);

        const full = await this.getJson<MailpitMessage>(
          request,
          `${this.options.baseUrl}/api/v1/message/${encodeURIComponent(summary.ID)}`,
          'message fetch',
        );
        const message: MailMessage = {
          id: summary.ID,
          subject: full.Subject ?? summary.Subject ?? '',
          text: full.Text ?? '',
          html: full.HTML ?? '',
        };
        if (match(message)) {
          return { found: message, subjects };
        }
        subjects.push(message.subject);
      }

      if (Date.now() >= deadline) {
        return { found: undefined, subjects };
      }
      await sleep(this.options.pollIntervalMs);
    }
  }

  /** Deletes this address's messages, so a long-lived catcher does not fill up. */
  async dispose(request: APIRequestContext): Promise<void> {
    try {
      await request.delete(this.searchUrl);
    } catch {
      // Best-effort: a leftover message only costs Mailpit storage.
    }
  }

  private async getJson<T>(request: APIRequestContext, url: string, what: string): Promise<T> {
    const response = await request.get(url);
    if (!response.ok()) {
      throw new Error(
        `Mailpit ${what} failed (HTTP ${response.status()}) at ${url}: ${await response.text()}`,
      );
    }
    return (await response.json()) as T;
  }
}

export class MailpitMailProvider implements MailProvider {
  readonly name = 'mailpit';

  constructor(private readonly options: MailpitOptions = mailpitOptionsFromEnv()) {}

  /** Mints a unique address; Mailpit needs no inbox created up front. */
  createInbox(_context: MailContext): Promise<Inbox> {
    const local = `e2e_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    return Promise.resolve(new MailpitInbox(this.options, `${local}@${this.options.domain}`));
  }
}

export const mailProvider = MailpitMailProvider;
