/**
 * A minimal LTI 1.3 tool for the suite's LTI coverage: the tool side of the OIDC
 * launch, a deep-linking picker, and a JSON control API the specs drive the tool
 * and read what it received through. In-memory and stdlib-only; one instance per
 * run (`scripts/lti-tool.mts`).
 *
 * Two properties matter to the platform side:
 *
 * - **Stateless OIDC.** The launch's `state` and `nonce` travel in an
 *   HMAC-signed `state` parameter, not a tool cookie, so a launch inside the
 *   LMS's iframe works without third-party cookies. The tool only remembers
 *   which nonces it has seen, so a replayed launch is refused.
 * - **The platform never calls the tool.** Blocks hold the tool's public key
 *   (`lti_1p3_tool_key_mode: public_key`), so the LMS verifies the tool's client
 *   assertions and deep-linking responses with it; every server-to-server call
 *   goes tool → LMS. The tool therefore only has to be reachable from the
 *   browser, at a host same-site with the LMS (the deep-linking response is a
 *   top-level POST that must carry the LMS's `SameSite=Lax` session cookie).
 */

import {
  createHmac,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  type KeyObject,
} from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { decodeJwt, signJwt, verifyJwt, type Jwks } from './jwt.mts';

/** Claim names (LTI 1.3 Core, Deep Linking 2.0), shortened for reading. */
export const CLAIM = {
  messageType: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  version: 'https://purl.imsglobal.org/spec/lti/claim/version',
  deploymentId: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  targetLinkUri: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  resourceLink: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  roles: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  context: 'https://purl.imsglobal.org/spec/lti/claim/context',
  custom: 'https://purl.imsglobal.org/spec/lti/claim/custom',
  deepLinkingSettings: 'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
  deepLinkingData: 'https://purl.imsglobal.org/spec/lti-dl/claim/data',
  contentItems: 'https://purl.imsglobal.org/spec/lti-dl/claim/content_items',
} as const;

/** A platform the tool trusts, as the spec registers it from Studio's values. */
export interface Registration {
  readonly issuer: string;
  readonly clientId: string;
  readonly deploymentId: string;
  readonly keysetUrl: string;
  readonly tokenUrl: string;
  readonly authUrl: string;
}

/** One launch the tool received. */
export interface LaunchRecord {
  readonly id: number;
  readonly receivedAt: string;
  /** Signature, issuer, audience, deployment and nonce all checked out. */
  readonly verified: boolean;
  /** Why verification failed, when it did. */
  readonly error?: string;
  readonly clientId: string;
  readonly messageType?: string;
  readonly targetLinkUri?: string;
  readonly resourceLinkId?: string;
  readonly claims: Readonly<Record<string, unknown>>;
}

/** A service call the control API makes on the tool's behalf. */
interface ServiceCall {
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly url: string;
  readonly method?: string;
  readonly body?: unknown;
  readonly contentType?: string;
  readonly accept?: string;
}

/** The two resources the deep-linking picker offers. */
const DEEP_LINK_CHOICES = ['a', 'b'] as const;

const KID = 'e2e-lti-tool';
const STATE_TTL_MS = 10 * 60 * 1000;

const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(
    `<!doctype html><html lang="en"><head><title>E2E LTI tool</title></head><body>${body}</body></html>`,
  );
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** An HTML form that posts `fields` to `action` as soon as it loads. */
function autoPost(action: string, fields: Readonly<Record<string, string>>): string {
  const inputs = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`)
    .join('');
  return (
    `<form id="post" method="post" action="${esc(action)}">${inputs}</form>` +
    '<script>document.getElementById("post").submit()</script>'
  );
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString();
  if (raw === '') return {};
  if ((req.headers['content-type'] ?? '').includes('application/json')) {
    return JSON.parse(raw) as Record<string, unknown>;
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** The control API's service-call body, checked. Throws naming what is missing. */
function serviceCall(params: Readonly<Record<string, unknown>>): ServiceCall {
  const clientId = str(params.clientId);
  const url = str(params.url);
  const scopes = params.scopes;
  if (
    clientId === undefined ||
    url === undefined ||
    !Array.isArray(scopes) ||
    !scopes.every((scope) => typeof scope === 'string')
  ) {
    throw new Error('A service call needs clientId, url and scopes (strings).');
  }
  const method = str(params.method);
  const contentType = str(params.contentType);
  const accept = str(params.accept);
  return {
    clientId,
    url,
    scopes,
    ...(method === undefined ? {} : { method }),
    ...(params.body === undefined ? {} : { body: params.body }),
    ...(contentType === undefined ? {} : { contentType }),
    ...(accept === undefined ? {} : { accept }),
  };
}

export class LtiTool {
  readonly baseUrl: string;
  readonly publicKeyPem: string;
  private readonly privateKey: KeyObject;
  private readonly stateKey = randomBytes(32);
  private readonly registrations = new Map<string, Registration>();
  private readonly launches: LaunchRecord[] = [];
  private readonly keysets = new Map<string, Jwks>();
  /** Nonces already launched with, and when: a replay within the state's life is refused. */
  private readonly usedNonces = new Map<string, number>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    this.privateKey = privateKey;
    this.publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  /** The HTTP handler: the LTI endpoints and the control API. */
  readonly handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', this.baseUrl);
    try {
      const params =
        req.method === 'POST' ? await readBody(req) : Object.fromEntries(url.searchParams);
      switch (url.pathname) {
        case '/_control/health':
          return json(res, 200, { ok: true });
        case '/_control/key':
          return json(res, 200, { pem: this.publicKeyPem, kid: KID });
        case '/_control/registrations':
          return json(res, 200, this.register(params));
        case '/_control/launches':
          return json(
            res,
            200,
            this.findLaunches(str(params.clientId), str(params.resourceLinkId)),
          );
        case '/_control/call':
          return json(res, 200, await this.call(serviceCall(params)));
        case '/login':
          return this.login(params, res);
        case '/launch':
          return await this.launch(params, res);
        case '/deep-link/choose':
          return this.chooseDeepLink(params, res);
        default:
          return json(res, 404, { error: `No route ${url.pathname}` });
      }
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  private register(params: Record<string, unknown>): { ok: true } {
    const fields = ['issuer', 'clientId', 'deploymentId', 'keysetUrl', 'tokenUrl', 'authUrl'];
    const missing = fields.filter((field) => str(params[field]) === undefined);
    if (missing.length > 0) throw new Error(`Registration is missing ${missing.join(', ')}.`);
    const registration = Object.fromEntries(
      fields.map((f) => [f, params[f]]),
    ) as unknown as Registration;
    this.registrations.set(registration.clientId, registration);
    return { ok: true };
  }

  private findLaunches(clientId?: string, resourceLinkId?: string): readonly LaunchRecord[] {
    return this.launches
      .filter((l) => clientId === undefined || l.clientId === clientId)
      .filter((l) => resourceLinkId === undefined || l.resourceLinkId === resourceLinkId)
      .slice()
      .reverse();
  }

  private signState(payload: Readonly<Record<string, unknown>>): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mac = createHmac('sha256', this.stateKey).update(body).digest('base64url');
    return `${body}.${mac}`;
  }

  private readState(state: string | undefined): Record<string, unknown> | undefined {
    const [body, mac] = (state ?? '').split('.');
    if (body === undefined || mac === undefined) return undefined;
    const expected = createHmac('sha256', this.stateKey).update(body).digest();
    const given = Buffer.from(mac, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    return typeof payload.at === 'number' && Date.now() - payload.at < STATE_TTL_MS
      ? payload
      : undefined;
  }

  /** Marks `nonce` used; false when it already was (or is missing). Forgets expired ones. */
  private consumeNonce(nonce: string | undefined): boolean {
    const now = Date.now();
    for (const [seen, at] of this.usedNonces) {
      if (now - at >= STATE_TTL_MS) this.usedNonces.delete(seen);
    }
    if (nonce === undefined || this.usedNonces.has(nonce)) return false;
    this.usedNonces.set(nonce, now);
    return true;
  }

  /** OIDC third-party-initiated login: answer with the platform's authentication request. */
  private login(params: Record<string, unknown>, res: ServerResponse): void {
    const clientId = str(params.client_id);
    const registration = clientId === undefined ? undefined : this.registrations.get(clientId);
    if (registration === undefined || str(params.iss) !== registration.issuer) {
      return html(res, 400, '<main data-lti-tool="error">Unknown platform registration.</main>');
    }
    const nonce = randomUUID();
    const query = new URLSearchParams({
      scope: 'openid',
      response_type: 'id_token',
      response_mode: 'form_post',
      prompt: 'none',
      client_id: registration.clientId,
      // Always the launch URL: the platform accepts only its registered redirect
      // URIs (the launch and deep-linking URLs), while `target_link_uri` may be a
      // deep-linked resource's own URL; that one arrives as a claim instead.
      redirect_uri: `${this.baseUrl}/launch`,
      login_hint: str(params.login_hint) ?? '',
      state: this.signState({ nonce, clientId: registration.clientId, at: Date.now() }),
      nonce,
    });
    const hint = str(params.lti_message_hint);
    if (hint !== undefined) query.set('lti_message_hint', hint);
    res.writeHead(302, { location: `${registration.authUrl}?${query}` });
    res.end();
  }

  /**
   * The platform's keyset, cached per URL — fetched again when it lacks the
   * token's `kid` (the platform rotated its key, or was re-provisioned).
   */
  private async keyset(url: string, kid: unknown): Promise<Jwks> {
    const cached = this.keysets.get(url);
    const hasKid = (jwks: Jwks) =>
      typeof kid !== 'string' || jwks.keys.some((key) => (key as { kid?: unknown }).kid === kid);
    if (cached !== undefined && hasKid(cached)) return cached;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The platform keyset ${url} answered ${response.status}.`);
    const jwks = (await response.json()) as Jwks;
    this.keysets.set(url, jwks);
    return jwks;
  }

  /** The launch: verify the platform's `id_token`, record it, and show the resource or the picker. */
  private async launch(params: Record<string, unknown>, res: ServerResponse): Promise<void> {
    const token = str(params.id_token);
    if (token === undefined) {
      return html(res, 400, '<main data-lti-tool="error">No id_token.</main>');
    }
    let clientId = '';
    let claims: Readonly<Record<string, unknown>> = {};
    let error: string | undefined;
    try {
      const unverified = decodeJwt(token);
      claims = unverified.payload;
      clientId = String(Array.isArray(claims.aud) ? claims.aud[0] : (claims.aud ?? ''));
      const registration = this.registrations.get(clientId);
      if (registration === undefined) throw new Error(`No registration for client ${clientId}.`);
      claims = verifyJwt(
        token,
        await this.keyset(registration.keysetUrl, unverified.header.kid),
        Date.now() / 1000,
      ).payload;
      const state = this.readState(str(params.state));
      if (state === undefined) throw new Error('The state parameter is missing, forged or stale.');
      if (state.clientId !== clientId) throw new Error('The token is for another client.');
      if (state.nonce !== claims.nonce) throw new Error('The nonce does not match the login.');
      if (!this.consumeNonce(str(claims.nonce))) throw new Error('The nonce was already used.');
      if (claims.iss !== registration.issuer)
        throw new Error(`Unexpected issuer ${String(claims.iss)}.`);
      if (claims[CLAIM.deploymentId] !== registration.deploymentId) {
        throw new Error(`Unexpected deployment ${String(claims[CLAIM.deploymentId])}.`);
      }
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    }
    const resourceLink = claims[CLAIM.resourceLink] as { id?: unknown } | undefined;
    const record: LaunchRecord = {
      id: this.launches.length + 1,
      receivedAt: new Date().toISOString(),
      verified: error === undefined,
      ...(error === undefined ? {} : { error }),
      clientId,
      messageType: str(claims[CLAIM.messageType]),
      targetLinkUri: str(claims[CLAIM.targetLinkUri]),
      resourceLinkId: str(resourceLink?.id),
      claims,
    };
    this.launches.push(record);
    if (error !== undefined) {
      return html(
        res,
        401,
        `<main data-lti-tool="error" data-launch="${record.id}">${esc(error)}</main>`,
      );
    }
    if (record.messageType === 'LtiDeepLinkingRequest') {
      const choices = DEEP_LINK_CHOICES.map(
        (choice) =>
          `<form method="post" action="/deep-link/choose">` +
          `<input type="hidden" name="launch" value="${record.id}">` +
          `<button type="submit" name="choice" value="${choice}">Resource ${choice}</button></form>`,
      ).join('');
      return html(
        res,
        200,
        `<main data-lti-tool="picker" data-launch="${record.id}">${choices}</main>`,
      );
    }
    return html(
      res,
      200,
      `<main data-lti-tool="launch" data-launch="${record.id}"><h1>Launched</h1></main>`,
    );
  }

  /** Answers a deep-linking request with one resource link, posted back to the platform. */
  private chooseDeepLink(params: Record<string, unknown>, res: ServerResponse): void {
    const request = this.launches.find((l) => String(l.id) === str(params.launch));
    const choice = str(params.choice) ?? '';
    if (
      request === undefined ||
      !request.verified ||
      request.messageType !== 'LtiDeepLinkingRequest' ||
      !(DEEP_LINK_CHOICES as readonly string[]).includes(choice)
    ) {
      return html(res, 400, '<main data-lti-tool="error">Unknown deep-linking request.</main>');
    }
    const settings = request.claims[CLAIM.deepLinkingSettings] as
      { deep_link_return_url?: string; data?: unknown } | undefined;
    const returnUrl = settings?.deep_link_return_url;
    if (returnUrl === undefined) {
      return html(res, 400, '<main data-lti-tool="error">No deep_link_return_url.</main>');
    }
    const now = Math.floor(Date.now() / 1000);
    const jwt = signJwt(this.privateKey, KID, {
      iss: request.clientId,
      aud: request.claims.iss,
      iat: now,
      exp: now + 300,
      nonce: randomUUID(),
      [CLAIM.deploymentId]: request.claims[CLAIM.deploymentId],
      [CLAIM.messageType]: 'LtiDeepLinkingResponse',
      [CLAIM.version]: '1.3.0',
      ...(settings?.data === undefined ? {} : { [CLAIM.deepLinkingData]: settings.data }),
      [CLAIM.contentItems]: [
        {
          type: 'ltiResourceLink',
          title: `Resource ${choice}`,
          url: `${this.baseUrl}/launch?r=${choice}`,
          custom: { resource: choice },
        },
      ],
    });
    return html(res, 200, autoPost(returnUrl, { JWT: jwt }));
  }

  /** A client-credentials access token for `scopes`, with the tool's signed assertion. */
  private async token(clientId: string, scopes: readonly string[]): Promise<string> {
    const registration = this.registrations.get(clientId);
    if (registration === undefined) throw new Error(`No registration for client ${clientId}.`);
    const now = Math.floor(Date.now() / 1000);
    const assertion = signJwt(this.privateKey, KID, {
      iss: clientId,
      sub: clientId,
      aud: registration.tokenUrl,
      iat: now,
      exp: now + 300,
      jti: randomUUID(),
    });
    const response = await fetch(registration.tokenUrl, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
        scope: scopes.join(' '),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { access_token?: string };
    if (!response.ok || body.access_token === undefined) {
      throw new Error(`The token endpoint answered ${response.status}: ${JSON.stringify(body)}`);
    }
    return body.access_token;
  }

  /** Calls a platform service (AGS, NRPS) with a fresh token; returns its status and body. */
  private async call(call: ServiceCall): Promise<{ status: number; body: unknown }> {
    const token = await this.token(call.clientId, call.scopes);
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (call.accept !== undefined) headers.accept = call.accept;
    if (call.contentType !== undefined) headers['content-type'] = call.contentType;
    const response = await fetch(call.url, {
      method: call.method ?? 'GET',
      headers,
      ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON (an empty 204, an HTML error page): hand back the text.
    }
    return { status: response.status, body };
  }
}
