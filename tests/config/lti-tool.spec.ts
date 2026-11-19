import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';

import { test, expect } from '@playwright/test';

import { parseLtiLaunchInfo } from '../../src/api/lti';
import { decodeJwt, signJwt, verifyJwt, type Jwks } from '../../scripts/lti-tool/jwt.mts';
import { CLAIM, LtiTool, type LaunchRecord } from '../../scripts/lti-tool/tool.mts';

/**
 * The suite's LTI 1.3 test tool, without a platform: its JWT handling, the
 * parsing of Studio's registration values, and an OIDC launch and a
 * deep-linking answer driven in-process against a stand-in platform keyset.
 */

const now = (): number => Math.floor(Date.now() / 1000);

function rsaKeys(kid: string): { privateKey: KeyObject; jwks: Jwks } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { privateKey, jwks: { keys: [{ ...publicKey.export({ format: 'jwk' }), kid } as never] } };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test.describe('LTI test tool — JWT', { tag: '@unit' }, () => {
  test('verifies its own signature and rejects another key or an expired token', () => {
    const platform = rsaKeys('p1');
    const other = rsaKeys('p1');
    const token = signJwt(platform.privateKey, 'p1', { iss: 'x', exp: now() + 60 });

    expect(verifyJwt(token, platform.jwks, now()).payload.iss).toBe('x');
    expect(() => verifyJwt(token, other.jwks, now())).toThrow('does not verify');
    const expired = signJwt(platform.privateKey, 'p1', { exp: now() - 10 });
    expect(() => verifyJwt(expired, platform.jwks, now())).toThrow('expired');
  });
});

test.describe('LTI registration values from Studio', { tag: '@unit' }, () => {
  // The shape of xblock-lti-consumer's `lti_1p3_studio.html` (11.5).
  const html = `<div class="xblock xblock-author_view">
    <p><b>LTI 1.3 Launches can only be performed from the LMS.</b></p>
    <p>To set up the LTI integration, you need to register the LMS in the tool with the information provided below.</p>
    <p><b>Client ID: </b>
      3d3203f1-dca4-4371-956e-c33369368efe
    </p>
    <p><b>Deployment ID: </b>
      1
    </p>
    <p><b>Keyset URL: </b>
      http://local.openedx.io/api/lti_consumer/v1/public_keysets/4a1bf8e6-5d2f-4f6f-b35d-c26830ab32ef
    </p>
    <p><b>Access Token URL: </b>
      http://local.openedx.io/api/lti_consumer/v1/token/4a1bf8e6-5d2f-4f6f-b35d-c26830ab32ef
    </p>
    <p><b>Login URL: </b>
      http://local.openedx.io/api/lti_consumer/v1/launch/
    </p></div>`;

  test('takes each value by its shape', () => {
    expect(parseLtiLaunchInfo(html)).toEqual({
      clientId: '3d3203f1-dca4-4371-956e-c33369368efe',
      deploymentId: '1',
      keysetUrl:
        'http://local.openedx.io/api/lti_consumer/v1/public_keysets/4a1bf8e6-5d2f-4f6f-b35d-c26830ab32ef',
      tokenUrl:
        'http://local.openedx.io/api/lti_consumer/v1/token/4a1bf8e6-5d2f-4f6f-b35d-c26830ab32ef',
      loginUrl: 'http://local.openedx.io/api/lti_consumer/v1/launch/',
    });
  });

  test('reads a reusable configuration, keyed by its app and slug', () => {
    const stored = html.replace(
      /(public_keysets|token)\/4a1bf8e6-5d2f-4f6f-b35d-c26830ab32ef/g,
      '$1/lti_store/e2e-tool',
    );
    expect(parseLtiLaunchInfo(stored)).toMatchObject({
      clientId: '3d3203f1-dca4-4371-956e-c33369368efe',
      keysetUrl: 'http://local.openedx.io/api/lti_consumer/v1/public_keysets/lti_store/e2e-tool',
      tokenUrl: 'http://local.openedx.io/api/lti_consumer/v1/token/lti_store/e2e-tool',
    });
  });

  test('finds nothing in a view with no LTI 1.3 configuration', () => {
    expect(parseLtiLaunchInfo('<div class="xblock"><p>LTI 1.1</p></div>')).toBeUndefined();
  });
});

test.describe('LTI test tool — launches', { tag: '@unit' }, () => {
  const platform = rsaKeys('platform-key');
  const issuer = 'http://lms.test';
  const clientId = 'client-1';
  let keysetServer: Server;
  let toolServer: Server;
  let tool: LtiTool;
  let toolUrl: string;

  test.beforeAll(async () => {
    keysetServer = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(platform.jwks));
    });
    const keysetUrl = `${await listen(keysetServer)}/keyset`;
    // The tool's own origin is only known once it listens: start it, then build
    // the tool on that origin.
    toolServer = createServer((req, res) => void tool.handle(req, res));
    toolUrl = await listen(toolServer);
    tool = new LtiTool(toolUrl);
    const registered = await fetch(`${toolUrl}/_control/registrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        issuer,
        clientId,
        deploymentId: '1',
        keysetUrl,
        tokenUrl: `${issuer}/token`,
        authUrl: `${issuer}/auth`,
      }),
    });
    expect(registered.ok).toBe(true);
  });

  test.afterAll(() => {
    keysetServer.close();
    toolServer.close();
  });

  /** The OIDC login: the tool's redirect to the platform, and its `state` and `nonce`. */
  async function login(): Promise<{ location: URL; state: string; nonce: string }> {
    const response = await fetch(
      `${toolUrl}/login?iss=${encodeURIComponent(issuer)}&client_id=${clientId}&login_hint=u1&lti_message_hint=m1&target_link_uri=x`,
      { redirect: 'manual' },
    );
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    return {
      location,
      state: location.searchParams.get('state') ?? '',
      nonce: location.searchParams.get('nonce') ?? '',
    };
  }

  async function launch(
    claims: Record<string, unknown>,
    state: string,
  ): Promise<{ status: number; body: string; record: LaunchRecord }> {
    const idToken = signJwt(platform.privateKey, 'platform-key', {
      iss: issuer,
      aud: clientId,
      exp: now() + 60,
      [CLAIM.deploymentId]: '1',
      ...claims,
    });
    const response = await fetch(`${toolUrl}/launch`, {
      method: 'POST',
      body: new URLSearchParams({ id_token: idToken, state }),
    });
    const records = (await (await fetch(`${toolUrl}/_control/launches`)).json()) as LaunchRecord[];
    return { status: response.status, body: await response.text(), record: records[0]! };
  }

  test('sends the browser to the platform with a signed state, and verifies the launch', async () => {
    const { location, state, nonce } = await login();
    expect(location.origin + location.pathname).toBe(`${issuer}/auth`);
    expect(location.searchParams.get('redirect_uri')).toBe(`${toolUrl}/launch`);
    expect(location.searchParams.get('lti_message_hint')).toBe('m1');

    const { status, record } = await launch(
      {
        nonce,
        [CLAIM.messageType]: 'LtiResourceLinkRequest',
        [CLAIM.resourceLink]: { id: 'block-1' },
      },
      state,
    );
    expect(status).toBe(200);
    expect(record).toMatchObject({
      verified: true,
      clientId,
      messageType: 'LtiResourceLinkRequest',
      resourceLinkId: 'block-1',
    });
  });

  test('records a forged state or a replayed nonce as unverified', async () => {
    const { state, nonce } = await login();
    const forged = await launch({ nonce }, `${state.split('.')[0]}.AAAA`);
    expect(forged.status).toBe(401);
    expect(forged.record).toMatchObject({ verified: false });

    const mismatched = await launch({ nonce: 'another' }, state);
    expect(mismatched.record.error).toContain('nonce');
  });

  test('answers a deep-linking request with a resource the platform can verify', async () => {
    const { state, nonce } = await login();
    const { body, record } = await launch(
      {
        nonce,
        [CLAIM.messageType]: 'LtiDeepLinkingRequest',
        [CLAIM.deepLinkingSettings]: { deep_link_return_url: `${issuer}/dl`, data: 'opaque' },
      },
      state,
    );
    expect(record.verified).toBe(true);
    expect(body).toContain('data-lti-tool="picker"');

    const chosen = await fetch(`${toolUrl}/deep-link/choose`, {
      method: 'POST',
      body: new URLSearchParams({ launch: String(record.id), choice: 'b' }),
    });
    const page = await chosen.text();
    expect(page).toContain(`action="${issuer}/dl"`);
    const jwt = /name="JWT" value="([^"]+)"/.exec(page)?.[1] ?? '';

    const keyset: Jwks = {
      keys: [
        {
          ...createPublicKey(
            ((await (await fetch(`${toolUrl}/_control/key`)).json()) as { pem: string }).pem,
          ).export({ format: 'jwk' }),
          kid: decodeJwt(jwt).header.kid as string,
        } as never,
      ],
    };
    const response = verifyJwt(jwt, keyset, now()).payload;
    expect(response).toMatchObject({
      iss: clientId,
      aud: issuer,
      [CLAIM.messageType]: 'LtiDeepLinkingResponse',
      [CLAIM.deepLinkingData]: 'opaque',
      [CLAIM.contentItems]: [{ type: 'ltiResourceLink', url: `${toolUrl}/launch?r=b` }],
    });
  });
});
