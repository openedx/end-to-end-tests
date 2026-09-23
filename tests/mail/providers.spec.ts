import { test, expect } from '@playwright/test';

import { MailpitMailProvider, mailpitOptionsFromEnv } from '../../plugins/mailpit.plugin';
import { OpenInboxMailProvider } from '../../plugins/openinbox.plugin';
import { loadConfig } from '../../src/config';
import type { MailMessage } from '../../src/mail';
import { stubRequest, type StubResponse } from './stub-request';

/**
 * Unit coverage for the two shipped mailbox providers, against a stub request
 * context: no browser, no network, no API key. The openinbox account backend
 * keeps its own spec (`tests/accounts/openinbox.spec.ts`).
 */

const config = () =>
  loadConfig({
    LMS_BASE_URL: 'http://local.openedx.io',
    APPS_BASE_URL: 'http://apps.local.openedx.io',
  });

const MAILPIT = 'http://localhost:8025';
const mailpit = () =>
  new MailpitMailProvider({ baseUrl: MAILPIT, domain: 'e2e.test', pollIntervalMs: 1 });
const isPost = (m: MailMessage) => m.html.includes('/posts/42');

test.describe('mailpit provider', { tag: '@unit' }, () => {
  test('mints a unique address on the configured domain without calling Mailpit', async () => {
    const { request, calls } = stubRequest([]);
    const provider = mailpit();

    const first = await provider.createInbox({ config: config(), request });
    const second = await provider.createInbox({ config: config(), request });

    expect(first.address).toMatch(/^e2e_[0-9a-f]{12}@e2e\.test$/);
    expect(second.address).not.toBe(first.address);
    expect(calls).toEqual([]);
  });

  test('searches by recipient, fetches each new message once, and returns the match', async () => {
    const setup = stubRequest([]);
    const inbox = await mailpit().createInbox({ config: config(), request: setup.request });
    const query = encodeURIComponent(`to:"${inbox.address}"`);
    const { request, calls } = stubRequest([
      {
        match: `/api/v1/search?query=${query}`,
        responses: [
          { body: { messages: [] } },
          { body: { messages: [{ ID: 'a', Subject: 'Welcome' }] } },
          {
            body: {
              messages: [
                { ID: 'a', Subject: 'Welcome' },
                { ID: 'b', Subject: 'New response' },
              ],
            },
          },
        ],
      },
      {
        match: '/api/v1/message/a',
        responses: [{ body: { ID: 'a', Subject: 'Welcome', Text: 'hi', HTML: '<p>hi</p>' } }],
      },
      {
        match: '/api/v1/message/b',
        responses: [
          {
            body: {
              ID: 'b',
              Subject: 'New response',
              Text: 'x',
              HTML: '<a href="http://apps/posts/42">go</a>',
            },
          },
        ],
      },
    ]);

    const outcome = await inbox.waitForMessage({ request, match: isPost, timeoutMs: 10_000 });

    expect(outcome.found?.id).toBe('b');
    expect(outcome.found?.subject).toBe('New response');
    expect(outcome.subjects).toEqual(['Welcome']);
    expect(calls.filter((call) => call.includes('/message/'))).toEqual([
      `GET ${MAILPIT}/api/v1/message/a`,
      `GET ${MAILPIT}/api/v1/message/b`,
    ]);
  });

  test('times out as an outcome, naming what did arrive', async () => {
    const setup = stubRequest([]);
    const inbox = await mailpit().createInbox({ config: config(), request: setup.request });
    const { request } = stubRequest([
      {
        match: /\/api\/v1\/search\?/,
        responses: [{ body: { messages: [{ ID: 'a', Subject: 'Digest' }] } }],
      },
      {
        match: '/api/v1/message/a',
        responses: [{ body: { ID: 'a', Subject: 'Digest', Text: '', HTML: '' } }],
      },
    ]);

    const outcome = await inbox.waitForMessage({ request, match: isPost, timeoutMs: 1 });

    expect(outcome).toEqual({ found: undefined, subjects: ['Digest'] });
  });

  test('reports a failed search', async () => {
    const setup = stubRequest([]);
    const inbox = await mailpit().createInbox({ config: config(), request: setup.request });
    const { request } = stubRequest([
      { match: /\/api\/v1\/search\?/, responses: [{ status: 503 }] },
    ]);

    await expect(inbox.waitForMessage({ request, match: isPost, timeoutMs: 1 })).rejects.toThrow(
      /Mailpit search failed \(HTTP 503\)/,
    );
  });

  test("disposes by deleting the address's messages", async () => {
    const setup = stubRequest([]);
    const inbox = await mailpit().createInbox({ config: config(), request: setup.request });
    const { request, calls } = stubRequest([
      { method: 'DELETE', match: /\/api\/v1\/search\?/, responses: [{}] },
    ]);

    await inbox.dispose(request);

    expect(calls).toEqual([
      `DELETE ${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${inbox.address}"`)}`,
    ]);
  });

  test('validates its settings', () => {
    expect(() => mailpitOptionsFromEnv({})).toThrow(/MAILPIT_BASE_URL is required/);
    expect(() => mailpitOptionsFromEnv({ MAILPIT_BASE_URL: 'ftp://x' })).toThrow(
      /http:\/\/ or https/,
    );
    expect(() =>
      mailpitOptionsFromEnv({ MAILPIT_BASE_URL: MAILPIT, MAILPIT_POLL_INTERVAL_MS: '0' }),
    ).toThrow(/MAILPIT_POLL_INTERVAL_MS/);
    expect(mailpitOptionsFromEnv({ MAILPIT_BASE_URL: `${MAILPIT}/` })).toEqual({
      baseUrl: MAILPIT,
      domain: 'e2e.test',
      pollIntervalMs: 1_000,
    });
  });
});

test.describe('openinbox provider', { tag: '@unit' }, () => {
  const API = 'https://api.openinbox.io/api';
  const ok = (data: unknown): StubResponse => ({ body: { success: true, data } });

  test.beforeEach(() => {
    process.env.OPENINBOX_API_KEY = 'test-key';
    process.env.OPENINBOX_POLL_INTERVAL_MS = '1';
  });

  test('creates an inbox, reads full messages, and deletes it on dispose', async () => {
    const { request, calls } = stubRequest([
      {
        method: 'POST',
        match: '/v1/inboxes',
        responses: [ok({ id: 'i1', email: 'me@openinbox.io' })],
      },
      {
        match: '/v1/inboxes/i1/emails',
        responses: [ok([]), ok([{ id: 'm1', subject: 'New response', preview: 'truncated…' }])],
      },
      {
        match: '/v1/emails/m1',
        responses: [
          ok({
            id: 'm1',
            subject: 'New response',
            textBody: 't',
            htmlBody: '<a href="http://apps/posts/42">go</a>',
          }),
        ],
      },
      { method: 'DELETE', match: '/v1/inboxes/i1', responses: [ok(undefined)] },
    ]);

    const inbox = await new OpenInboxMailProvider().createInbox({ config: config(), request });
    const outcome = await inbox.waitForMessage({ request, match: isPost, timeoutMs: 10_000 });
    await inbox.dispose(request);

    expect(inbox.address).toBe('me@openinbox.io');
    expect(outcome.found?.html).toContain('/posts/42');
    expect(calls).toContain(`GET ${API}/v1/emails/m1`);
    expect(calls.at(-1)).toBe(`DELETE ${API}/v1/inboxes/i1`);
  });
});
