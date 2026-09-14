import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { OpenInboxBackend, findActivationLink } from '../../plugins/openinbox.plugin';
import { newLearnerIdentity } from '../../src/api';
import { loadConfig } from '../../src/config';

/**
 * Unit coverage for the example OpenInbox plugin: no browser and no network —
 * the OpenInbox and LMS calls are served by a stub `APIRequestContext`, so this
 * runs in the node-only `unit` project without an API key.
 */

const LMS = 'http://local.openedx.io';
const INBOX_ID = 'inbox-1';
const INBOX_EMAIL = 'probe@openinbox.io';

const config = () =>
  loadConfig({ LMS_BASE_URL: LMS, APPS_BASE_URL: 'http://apps.local.openedx.io' });

interface StubResponse {
  status?: number;
  body?: unknown;
}

interface Route {
  method?: 'GET' | 'POST' | 'DELETE';
  /** A string matches the end of the URL; a RegExp is tested against it. */
  match: string | RegExp;
  responses: StubResponse[];
}

const matches = (url: string, match: Route['match']) =>
  typeof match === 'string' ? url.endsWith(match) : match.test(url);

/** Records every request as `METHOD url` and answers from a route table. */
function stubRequest(routes: Route[]) {
  const calls: string[] = [];

  const answer = (method: Route['method'], url: string) => {
    calls.push(`${method} ${url}`);
    const route = routes.find(
      (candidate) => (candidate.method ?? 'GET') === method && matches(url, candidate.match),
    );
    if (route === undefined) {
      throw new Error(`Unexpected request: ${method} ${url}`);
    }
    const next = route.responses.length > 1 ? route.responses.shift()! : route.responses[0]!;
    const status = next.status ?? 200;
    return {
      ok: () => status < 400,
      status: () => status,
      json: () => Promise.resolve(next.body),
      text: () => Promise.resolve(JSON.stringify(next.body ?? '')),
    };
  };

  const request = {
    get: (url: string) => Promise.resolve(answer('GET', url)),
    post: (url: string) => Promise.resolve(answer('POST', url)),
    delete: (url: string) => Promise.resolve(answer('DELETE', url)),
  } as unknown as APIRequestContext;

  return { request, calls };
}

const ok = (data: unknown): StubResponse => ({ body: { success: true, data } });

const inbox = (id = INBOX_ID, email = INBOX_EMAIL, createdAt = new Date().toISOString()) => ({
  id,
  email,
  createdAt,
});

const summary = (id: string, subject: string, preview?: string) => ({ id, subject, preview });

const activationEmail = (id: string, key = 'abc123') => ({
  id,
  subject: 'Action Required: Activate your account',
  textBody: `Welcome! Please visit ${LMS}/activate/${key} to activate.`,
});

const createRoute = (...responses: StubResponse[]): Route => ({
  method: 'POST',
  match: '/v1/inboxes',
  responses,
});
const listRoute = (...responses: StubResponse[]): Route => ({ match: '/v1/inboxes', responses });
const emailsRoute = (...responses: StubResponse[]): Route => ({
  match: `/v1/inboxes/${INBOX_ID}/emails`,
  responses,
});
const emailRoute = (id: string, ...responses: StubResponse[]): Route => ({
  match: `/v1/emails/${id}`,
  responses,
});
const deleteRoute = (): Route => ({
  method: 'DELETE',
  match: /\/v1\/inboxes\/[^/]+$/,
  responses: [ok(undefined)],
});
const activateRoute = (): Route => ({ match: /\/activate\//, responses: [{ body: 'ok' }] });

/** A backend that already created `INBOX_EMAIL`, as `activate` expects. */
async function backendWithInbox(extraRoutes: Route[]) {
  const backend = new OpenInboxBackend();
  const { request } = stubRequest([createRoute(ok(inbox()))]);
  const identity = await backend.createIdentity({ config: config(), request });
  return { backend, identity, ...stubRequest(extraRoutes) };
}

test.describe('findActivationLink', { tag: '@unit' }, () => {
  test('finds the link in a plain-text body', () => {
    expect(findActivationLink(`go to ${LMS}/activate/key1 now`)).toBe(`${LMS}/activate/key1`);
  });

  test('finds the link in an HTML body and un-escapes entities', () => {
    const html = `<a href="${LMS}/activate/key2?next=/dashboard&amp;x=1">Activate</a>`;
    expect(findActivationLink(html)).toBe(`${LMS}/activate/key2?next=/dashboard&x=1`);
  });

  test('returns undefined when there is no activation link', () => {
    expect(findActivationLink('Your weekly course digest')).toBeUndefined();
  });
});

test.describe('OpenInboxBackend', { tag: '@unit' }, () => {
  test.beforeEach(() => {
    process.env.OPENINBOX_API_KEY = 'test-key';
    process.env.OPENINBOX_POLL_INTERVAL_MS = '1';
    delete process.env.OPENINBOX_POLL_TIMEOUT_MS;
  });

  test('registers with the address of a freshly created v1 inbox', async () => {
    const { request, calls } = stubRequest([createRoute(ok(inbox()))]);

    const identity = await new OpenInboxBackend().createIdentity({ config: config(), request });

    expect(identity.email).toBe(INBOX_EMAIL);
    expect(calls).toEqual(['POST https://api.openinbox.io/api/v1/inboxes']);
  });

  test('fails before registering when no API key is configured', async () => {
    delete process.env.OPENINBOX_API_KEY;
    const { request, calls } = stubRequest([createRoute(ok(inbox()))]);

    await expect(
      new OpenInboxBackend().createIdentity({ config: config(), request }),
    ).rejects.toThrow(/OPENINBOX_API_KEY is required/);
    expect(calls).toEqual([]);
  });

  test('reports a failed inbox creation', async () => {
    const { request } = stubRequest([createRoute({ status: 401, body: { error: 'bad key' } })]);

    await expect(
      new OpenInboxBackend().createIdentity({ config: config(), request }),
    ).rejects.toThrow(/inbox creation failed \(HTTP 401\)/);
  });

  test('at the inbox cap, sweeps only stale inboxes and retries once', async () => {
    const stale = inbox('old-1', 'old@openinbox.io', new Date(Date.now() - 600_000).toISOString());
    const fresh = inbox('new-1', 'sibling@openinbox.io');
    const { request, calls } = stubRequest([
      createRoute({ status: 403, body: { message: 'Inbox limit reached' } }, ok(inbox())),
      listRoute(ok([stale, fresh])),
      deleteRoute(),
    ]);

    const identity = await new OpenInboxBackend().createIdentity({ config: config(), request });

    expect(identity.email).toBe(INBOX_EMAIL);
    expect(calls.filter((call) => call.startsWith('DELETE'))).toEqual([
      'DELETE https://api.openinbox.io/api/v1/inboxes/old-1',
    ]);
    expect(calls.filter((call) => call.startsWith('POST'))).toHaveLength(2);
  });

  test('polls until the activation email arrives, visits its link, then deletes the inbox', async () => {
    const { backend, identity, request, calls } = await backendWithInbox([
      emailsRoute(
        ok([]),
        ok([summary('m1', 'Welcome', 'Thanks for joining')]),
        ok([summary('m1', 'Welcome', 'Thanks for joining'), summary('m2', 'Activate')]),
      ),
      emailRoute('m1', ok({ id: 'm1', textBody: 'Thanks for joining us.' })),
      emailRoute('m2', ok(activationEmail('m2', 'key-42'))),
      activateRoute(),
      deleteRoute(),
    ]);

    await backend.activate({ config: config(), request, identity });

    expect(calls.filter((call) => call.endsWith('/emails'))).toHaveLength(3);
    // Each message is fetched in full at most once: m1 is listed twice but
    // inspected once.
    expect(calls.filter((call) => call.includes('/v1/emails/'))).toEqual([
      'GET https://api.openinbox.io/api/v1/emails/m1',
      'GET https://api.openinbox.io/api/v1/emails/m2',
    ]);
    expect(calls.at(-2)).toBe(`GET ${LMS}/activate/key-42`);
    expect(calls.at(-1)).toBe(`DELETE https://api.openinbox.io/api/v1/inboxes/${INBOX_ID}`);
  });

  test('takes the link from the listing preview without fetching the email', async () => {
    const { backend, identity, request, calls } = await backendWithInbox([
      emailsRoute(ok([summary('m1', 'Activate', `Visit ${LMS}/activate/key-7 now`)])),
      activateRoute(),
      deleteRoute(),
    ]);

    await backend.activate({ config: config(), request, identity });

    expect(calls.some((call) => call.includes('/v1/emails/'))).toBe(false);
    expect(calls).toContain(`GET ${LMS}/activate/key-7`);
  });

  test('finds the inbox by address when this instance did not create it', async () => {
    const identity = newLearnerIdentity({ email: INBOX_EMAIL });
    const { request, calls } = stubRequest([
      listRoute(ok([inbox('other', 'other@openinbox.io'), inbox()])),
      emailsRoute(ok([summary('m1', 'Activate', `${LMS}/activate/key-9`)])),
      activateRoute(),
      deleteRoute(),
    ]);

    await new OpenInboxBackend().activate({ config: config(), request, identity });

    expect(calls[0]).toBe('GET https://api.openinbox.io/api/v1/inboxes');
    expect(calls.at(-1)).toBe(`DELETE https://api.openinbox.io/api/v1/inboxes/${INBOX_ID}`);
  });

  test('times out with the subjects it did see, and still deletes the inbox', async () => {
    process.env.OPENINBOX_POLL_TIMEOUT_MS = '1';
    const { backend, identity, request, calls } = await backendWithInbox([
      emailsRoute(ok([summary('m1', 'Course digest', 'Your week')])),
      emailRoute('m1', ok({ id: 'm1', textBody: 'Your week in review' })),
      deleteRoute(),
    ]);

    await expect(backend.activate({ config: config(), request, identity })).rejects.toThrow(
      /No activation link reached .*messages seen: Course digest/s,
    );
    expect(calls.at(-1)).toBe(`DELETE https://api.openinbox.io/api/v1/inboxes/${INBOX_ID}`);
  });

  test('reports a failed email poll', async () => {
    const { backend, identity, request } = await backendWithInbox([
      emailsRoute({ status: 401, body: { error: 'bad key' } }),
      deleteRoute(),
    ]);

    await expect(backend.activate({ config: config(), request, identity })).rejects.toThrow(
      /email poll failed \(HTTP 401\)/,
    );
  });
});
