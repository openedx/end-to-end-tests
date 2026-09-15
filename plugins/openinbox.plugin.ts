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
 *     OPENINBOX_API_KEY=...        # the OpenInbox API needs a paid plan
 *
 * Paid plans cap the number of **concurrent** inboxes and a suite run
 * provisions many accounts, so an inbox lives only as long as the activation
 * step needs it: it is deleted as soon as the link has been visited (or the
 * wait gives up). Should a run still hit the cap — a crashed worker leaves
 * its inbox behind — inboxes older than the poll timeout are treated as
 * abandoned and swept before retrying.
 *
 * Only `createIdentity` and `activate` are implemented; sign-in and sign-out
 * fall back to the suite defaults, which is the point of their being optional.
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';

import { activateAccount, newLearnerIdentity, type LearnerIdentity } from '../src/api';
import type { AccountBackend, AccountContext, ActivationContext } from '../src/accounts';

/** OpenInbox API root. Override for a mock server in tests. */
const DEFAULT_BASE_URL = 'https://api.openinbox.io/api';
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_INTERVAL_MS = 3_000;

/** Shape of the pieces of the OpenInbox `/v1` payloads this backend relies on. */
interface OpenInboxInbox {
  readonly id?: string;
  readonly email?: string;
  readonly createdAt?: string;
}

/** An entry of `GET /v1/inboxes/:id/emails`: headers plus a short preview. */
interface OpenInboxEmailSummary {
  readonly id?: string;
  readonly subject?: string;
  readonly preview?: string;
}

/** `GET /v1/emails/:id`: the summary plus the bodies. */
interface OpenInboxEmail extends OpenInboxEmailSummary {
  readonly textBody?: string;
  readonly htmlBody?: string;
}

interface OpenInboxEnvelope<T> {
  readonly success?: boolean;
  readonly data?: T;
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
   * Inbox ids by address, for the inboxes this backend created and has not yet
   * deleted. `activate` runs in the same process as `createIdentity`, so this is
   * normally where it finds the inbox to poll; a listing by address is the
   * fallback.
   */
  private readonly inboxIds = new Map<string, string>();

  /**
   * Creates a disposable inbox and registers with its address. If the account
   * is at its concurrent-inbox cap, sweeps inboxes old enough to be leftovers
   * of an earlier, interrupted activation and tries once more.
   */
  async createIdentity({ request }: AccountContext): Promise<LearnerIdentity> {
    const url = `${this.baseUrl}/v1/inboxes`;
    let response = await this.post(request, url);
    if (this.isInboxLimit(response)) {
      await this.sweepAbandonedInboxes(request);
      response = await this.post(request, url);
    }
    if (!response.ok()) {
      throw new Error(
        `OpenInbox inbox creation failed (HTTP ${response.status()}) at ${url}: ` +
          `${await response.text()}`,
      );
    }

    const inbox = ((await response.json()) as OpenInboxEnvelope<OpenInboxInbox>).data;
    if (
      typeof inbox?.id !== 'string' ||
      inbox.id === '' ||
      typeof inbox.email !== 'string' ||
      inbox.email === ''
    ) {
      throw new Error(
        `OpenInbox inbox creation returned no inbox id and email address: ${JSON.stringify(inbox)}`,
      );
    }

    this.inboxIds.set(inbox.email, inbox.id);
    return newLearnerIdentity({ email: inbox.email });
  }

  /**
   * Waits for the activation email to land in the inbox we registered with,
   * visits its link through the suite's own activation helper, then deletes the
   * inbox — whether or not the link arrived — so it stops counting against the
   * plan's concurrent-inbox cap.
   */
  async activate({ config, request, identity }: ActivationContext): Promise<void> {
    const inboxId = await this.inboxIdFor(request, identity.email);
    try {
      const link = await this.waitForActivationLink(request, inboxId, identity.email);
      await activateAccount(request, config, link);
    } finally {
      await this.deleteInbox(request, inboxId);
      this.inboxIds.delete(identity.email);
    }
  }

  private async waitForActivationLink(
    request: APIRequestContext,
    inboxId: string,
    inboxEmail: string,
  ): Promise<string> {
    const timeoutMs = envNumber('OPENINBOX_POLL_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    const intervalMs = envNumber('OPENINBOX_POLL_INTERVAL_MS', DEFAULT_INTERVAL_MS);
    const deadline = Date.now() + timeoutMs;
    const subjects: string[] = [];
    const inspected = new Set<string>();

    for (;;) {
      for (const summary of await this.fetchEmails(request, inboxId)) {
        if (summary.id === undefined || inspected.has(summary.id)) {
          continue;
        }
        inspected.add(summary.id);

        // The listing carries a plain-text preview, which for the stock
        // activation email already contains the link — one round trip fewer.
        const link =
          findActivationLink(summary.preview ?? '') ??
          (await this.findLinkInEmail(request, summary.id));
        if (link !== undefined) {
          return link;
        }
        if (summary.subject !== undefined) {
          subjects.push(summary.subject);
        }
      }

      if (Date.now() >= deadline) {
        const seen =
          subjects.length === 0
            ? 'no email arrived'
            : `messages seen: ${[...new Set(subjects)].join(', ')}`;
        throw new Error(
          `No activation link reached ${inboxEmail} within ${timeoutMs}ms (${seen}). ` +
            'Check that the target sends activation email (SKIP_EMAIL_VALIDATION = False ' +
            'and a working SMTP backend).',
        );
      }
      await sleep(intervalMs);
    }
  }

  private headers(): Record<string, string> {
    return { 'X-API-Key': this.apiKey(), 'Content-Type': 'application/json' };
  }

  private apiKey(): string {
    const key = process.env.OPENINBOX_API_KEY;
    if (key === undefined || key.trim() === '') {
      throw new Error(
        'OPENINBOX_API_KEY is required by the openinbox account backend ' +
          '(the OpenInbox API needs a paid plan).',
      );
    }
    return key;
  }

  private post(request: APIRequestContext, url: string): Promise<APIResponse> {
    return request.post(url, { headers: this.headers(), data: {} });
  }

  private async getData<T>(request: APIRequestContext, url: string, what: string): Promise<T> {
    const response = await request.get(url, { headers: this.headers() });
    if (!response.ok()) {
      throw new Error(
        `OpenInbox ${what} failed (HTTP ${response.status()}) at ${url}: ${await response.text()}`,
      );
    }
    const payload = (await response.json()) as OpenInboxEnvelope<T>;
    return payload.data as T;
  }

  /** `403 Forbidden` with an "Inbox limit reached" message is the cap. */
  private isInboxLimit(response: APIResponse): boolean {
    return response.status() === 403;
  }

  private async inboxIdFor(request: APIRequestContext, inboxEmail: string): Promise<string> {
    const known = this.inboxIds.get(inboxEmail);
    if (known !== undefined) {
      return known;
    }
    const inboxes = await this.listInboxes(request);
    const match = inboxes.find((inbox) => inbox.email === inboxEmail);
    if (typeof match?.id !== 'string') {
      throw new Error(`OpenInbox has no inbox for ${inboxEmail}; was it deleted or expired?`);
    }
    return match.id;
  }

  private async listInboxes(request: APIRequestContext): Promise<readonly OpenInboxInbox[]> {
    const inboxes = await this.getData<readonly OpenInboxInbox[] | undefined>(
      request,
      `${this.baseUrl}/v1/inboxes`,
      'inbox listing',
    );
    return inboxes ?? [];
  }

  private async fetchEmails(
    request: APIRequestContext,
    inboxId: string,
  ): Promise<readonly OpenInboxEmailSummary[]> {
    const emails = await this.getData<readonly OpenInboxEmailSummary[] | undefined>(
      request,
      `${this.baseUrl}/v1/inboxes/${encodeURIComponent(inboxId)}/emails`,
      'email poll',
    );
    return emails ?? [];
  }

  private async findLinkInEmail(
    request: APIRequestContext,
    emailId: string,
  ): Promise<string | undefined> {
    const email = await this.getData<OpenInboxEmail | undefined>(
      request,
      `${this.baseUrl}/v1/emails/${encodeURIComponent(emailId)}`,
      'email fetch',
    );
    return findActivationLink(email?.textBody ?? '') ?? findActivationLink(email?.htmlBody ?? '');
  }

  /**
   * Best-effort: a failed delete must not fail a test whose account is already
   * activated, and an inbox that outlives us expires on its own eventually.
   */
  private async deleteInbox(request: APIRequestContext, inboxId: string): Promise<void> {
    try {
      await request.delete(`${this.baseUrl}/v1/inboxes/${encodeURIComponent(inboxId)}`, {
        headers: this.headers(),
      });
    } catch {
      // Ignored: see above.
    }
  }

  /**
   * Deletes every inbox older than the poll timeout. Anything that old cannot
   * still be waiting on an activation email in a live worker, so it is a
   * leftover from a crashed or aborted run. Recent inboxes — possibly a sibling
   * worker's, mid-activation — are left alone.
   */
  private async sweepAbandonedInboxes(request: APIRequestContext): Promise<void> {
    const staleBefore = Date.now() - envNumber('OPENINBOX_POLL_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    for (const inbox of await this.listInboxes(request)) {
      const createdAt = Date.parse(inbox.createdAt ?? '');
      if (typeof inbox.id === 'string' && Number.isFinite(createdAt) && createdAt < staleBefore) {
        await this.deleteInbox(request, inbox.id);
      }
    }
  }
}

export default OpenInboxBackend;
