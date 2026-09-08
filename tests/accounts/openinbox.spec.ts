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

const config = () =>
  loadConfig({ LMS_BASE_URL: LMS, APPS_BASE_URL: 'http://apps.local.openedx.io' });

interface StubResponse {
  status?: number;
  body?: unknown;
}

/** Records every request and answers from a URL-substring → response table. */
function stubRequest(routes: { match: string; responses: StubResponse[] }[]) {
  const calls: string[] = [];

  const answer = (url: string) => {
    calls.push(url);
    const route = routes.find((candidate) => url.includes(candidate.match));
    if (route === undefined) {
      throw new Error(`Unexpected request: ${url}`);
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
    get: (url: string) => Promise.resolve(answer(url)),
    post: (url: string) => Promise.resolve(answer(url)),
  } as unknown as APIRequestContext;

  return { request, calls };
}

const activationEmail = (key = 'abc123') => ({
  subject: 'Action Required: Activate your account',
  textBody: `Welcome! Please visit ${LMS}/activate/${key} to activate.`,
});

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

  test('registers with the address of a freshly created inbox', async () => {
    const { request, calls } = stubRequest([
      { match: '/inbox', responses: [{ body: { email: 'probe@openinbox.io' } }] },
    ]);

    const identity = await new OpenInboxBackend().createIdentity({ config: config(), request });

    expect(identity.email).toBe('probe@openinbox.io');
    expect(calls[0]).toContain('/api/inbox');
  });

  test('fails before registering when no API key is configured', async () => {
    delete process.env.OPENINBOX_API_KEY;
    const { request } = stubRequest([{ match: '/inbox', responses: [{ body: {} }] }]);

    await expect(
      new OpenInboxBackend().createIdentity({ config: config(), request }),
    ).rejects.toThrow(/OPENINBOX_API_KEY is required/);
  });

  test('reports a failed inbox creation', async () => {
    const { request } = stubRequest([
      { match: '/inbox', responses: [{ status: 402, body: { error: 'plan required' } }] },
    ]);

    await expect(
      new OpenInboxBackend().createIdentity({ config: config(), request }),
    ).rejects.toThrow(/inbox creation failed \(HTTP 402\)/);
  });

  test('polls until the activation email arrives, then visits its link', async () => {
    const identity = newLearnerIdentity({ email: 'probe@openinbox.io' });
    const { request, calls } = stubRequest([
      {
        match: '/inbound/api/emails',
        responses: [
          { body: { emails: [] } },
          { body: { emails: [{ subject: 'Welcome' }] } },
          { body: { emails: [activationEmail('key-42')] } },
        ],
      },
      { match: '/activate/', responses: [{ body: 'ok' }] },
    ]);

    await new OpenInboxBackend().activate({ config: config(), request, identity });

    expect(calls.filter((url) => url.includes('/inbound/api/emails'))).toHaveLength(3);
    expect(calls.at(-1)).toBe(`${LMS}/activate/key-42`);
    expect(calls[0]).toContain(`inboxEmail=${encodeURIComponent(identity.email)}`);
  });

  test('times out with the subjects it did see', async () => {
    process.env.OPENINBOX_POLL_TIMEOUT_MS = '1';
    const identity = newLearnerIdentity({ email: 'probe@openinbox.io' });
    const { request } = stubRequest([
      {
        match: '/inbound/api/emails',
        responses: [{ body: { emails: [{ subject: 'Course digest' }] } }],
      },
    ]);

    await expect(
      new OpenInboxBackend().activate({ config: config(), request, identity }),
    ).rejects.toThrow(/No activation link reached .*messages seen: Course digest/s);
  });

  test('reports a failed email poll', async () => {
    const identity = newLearnerIdentity({ email: 'probe@openinbox.io' });
    const { request } = stubRequest([
      { match: '/inbound/api/emails', responses: [{ status: 401, body: { error: 'bad key' } }] },
    ]);

    await expect(
      new OpenInboxBackend().activate({ config: config(), request, identity }),
    ).rejects.toThrow(/email poll failed \(HTTP 401\)/);
  });
});
