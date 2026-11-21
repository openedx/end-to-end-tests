/**
 * LTI tool provider: [saLTIre](https://saltire.lti.app/), the ceLTIc Project's
 * public LTI tool emulator, for running the LTI 1.3 specs against a **public**
 * Open edX instance (saLTIre calls the platform's token, AGS and NRPS endpoints
 * over the internet, so it cannot reach a private one).
 *
 *     CUSTOM_LTI_TOOL_PROVIDER_PLUGINS=./plugins/saltire.plugin.ts
 *     LTI_TOOL_PROVIDER=saltire
 *
 * Optional:
 *
 *     SALTIRE_BASE_URL=https://saltire.lti.app   # its origin; https only
 *
 * How it maps onto saLTIre (measured 2026-11-20, saLTIre 3.3.2):
 *
 * - **A session per test.** saLTIre keeps every setting in a server-side session
 *   named by its `SALTIRE_SESSION` cookie (`Secure; SameSite=None;
 *   Partitioned`). A session holds one platform registration, so each test opens
 *   its own in a browser context of its own, and `admit` copies the cookie into
 *   every actor's context: once for top-level saLTIre windows, and once into the
 *   partition of the LMS's site, for launches in the block's iframe.
 * - **Registration** is saLTIre's Security Model form in RS256 mode, saved.
 * - **A launch** is read from the page it landed on: saLTIre shows the raw
 *   `id_token` it received, which is decoded here and verified against the
 *   platform's keyset. saLTIre keeps no launch history, so a launch can only be
 *   read from its window or frame.
 * - **Services** are saLTIre's own service cards, driven on the session's page;
 *   each call is an XHR (`/tp-*.php`) whose JSON answer carries the platform's
 *   whole HTTP exchange, which is what is reported back.
 * - **Deep linking** is its Sample Content tab: `a` and `b` are two of its sample
 *   resource links, told apart by their custom parameters.
 *
 * saLTIre's pages are its own markup, not the platform's, so they are anchored
 * by saLTIre's ids. It publishes no rate limits: keep it out of scheduled CI.
 *
 * Setup, limits and what it was validated against: docs/lti.md.
 */

import { createPublicKey, verify, type webcrypto } from 'node:crypto';

import type { APIRequestContext, BrowserContext, Cookie, Page } from '@playwright/test';

import { TIMEOUTS, registrableDomain, type AppConfig } from '../src/config';
import {
  LTI_CLAIM,
  agsLineItemUrl,
  agsLineItemsUrl,
  nrpsMembershipsUrl,
  type AgsLineItem,
  type LtiLaunch,
  type LtiLaunchInfo,
  type LtiServiceResponse,
  type Memberships,
} from '../src/api';
import type {
  LtiDeepLinkChoice,
  LtiLaunchSource,
  LtiToolContext,
  LtiToolFeature,
  LtiToolProvider,
  LtiToolSession,
} from '../src/lti-tools';

const DEFAULT_BASE_URL = 'https://saltire.lti.app';
const SESSION_COOKIE = 'SALTIRE_SESSION';

/** saLTIre's own anchors (its ids), by page area. */
const S = {
  signatureMethod: '#id_sel_t_signaturemethod',
  publicKey: '#id_publickey',
  save: '#id_navbar_save',
  platform: {
    issuer: '#id_t_platformid',
    clientId: '#id_t_clientid',
    deploymentId: '#id_t_deploymentid',
    authUrl: '#id_t_authrequest',
    tokenUrl: '#id_t_accesstokenurl2',
    keysetUrl: '#id_t_jwks',
  },
  /** The launch page's "Raw POST Parameters" (`id_token=…`). */
  rawParameters: '#id_card_home_rawparameters pre',
  /** The nav link back to the registration form, once a launch shows the message view. */
  securityModel: '#id_securitymodel',
  servicesMenu: '#id_navbar_services',
  card: (id: string) => `#id_${id}`,
  scope: (scope: string) => `#id_c_scope_${scope}`,
  requestToken: '#id_card_accesstoken input[type=button][value="Request new token"]',
  ags: {
    card: '#id_card_outcomes2',
    containerChoice: '#id_c_lineitemurl',
    containerUrl: '#id_lineitemurl',
    itemChoice: '#id_c_lineitemurllineitem',
    itemUrl: '#id_lineitemurllineitem',
    listFilters: ['#id_c_lineitemstype', '#id_c_lineitemsrid', '#id_c_lineitemsrlid'],
    label: '#id_t_lineitemlabel',
    points: '#id_t_lineitempoints',
    tag: '#id_t_lineitemtype',
    resourceId: '#id_t_lineitemrid',
    resourceLinkId: '#id_t_lineitemrlid',
    create: '#id_lineitem_create',
    read: '#id_lineitem_read',
    delete: '#id_lineitem_delete',
    scoreUrl: '#id_scoreurl',
    scoreUser: '#id_scoreuserid',
    scoreGiven: '#id_t_scorescore',
    scoreMaximum: '#id_t_scorepoints',
    activityProgress: '#id_t_scoreprogress',
    gradingProgress: '#id_t_scoregprogress',
    scoreSend: '#id_score_create',
  },
  nrps: { url: '#id_nrpurl', resourceLinkFilter: '#id_c_nrprlid', read: '#id_nrp_read' },
  deepLinking: {
    tab: '#id_contentitem',
    itemTypes: '#id_card_contentitem input[type=checkbox][id^=id_type_]',
    itemType: (type: string) => `#id_type_${type}`,
    returnSelection: 'input[type=button][value="Return selection"]',
  },
} as const;

/** saLTIre's two sample resource links the deep-linking choices map to. */
const DEEP_LINK_TYPES = { a: 'launchurl', b: 'launch2url' } as const;

/** The section of the AGS card a call needs ("Line item service", "Score publish service"). */
const AGS_SECTIONS = { lineItems: 'Line item service', score: 'Score publish service' } as const;

const SCOPES = ['lineitem', 'result', 'score', 'membership'] as const;

/**
 * The most follow-up modals one service call raises: saLTIre offers to show the
 * request, then the response (two each, measured), with room for an alert.
 */
const MAX_FOLLOW_UP_MODALS = 6;

/**
 * How long to wait for the next follow-up modal before taking there to be none:
 * saLTIre opens each one just after the previous closes (well under a second).
 */
const NEXT_MODAL_WAIT_MS = 1_500;

/**
 * How long an access token is reused. The platform issues them for an hour;
 * renewing ten minutes early keeps a long test from using an expired one.
 */
const TOKEN_REUSE_MS = 50 * 60 * 1000;

/** Reads the provider's settings; throws a clear message for a bad one. */
export function saltireBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.SALTIRE_BASE_URL ?? '').trim() || DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SALTIRE_BASE_URL must be an absolute URL (got "${raw}").`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`SALTIRE_BASE_URL must be https:// (got "${url.origin}").`);
  }
  return url.origin;
}

/** The `id_token` in saLTIre's "Raw POST Parameters" text, or `undefined`. */
export function idTokenFromRawParameters(text: string): string | undefined {
  return /id_token=([\w-]+\.[\w-]+\.[\w-]+)/.exec(text)?.[1];
}

/** A compact JWT's payload, unverified. */
export function jwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (payload === undefined) throw new Error('Not a JWT.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
}

/** The first content item in a deep-linking response form body (`JWT=…`). */
export function contentItemFromResponseBody(
  body: string,
): { url?: string; custom: Record<string, string> } | undefined {
  const jwt = new URLSearchParams(body).get('JWT');
  if (jwt === null) return undefined;
  const items = jwtPayload(jwt)['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'];
  const first = Array.isArray(items)
    ? (items[0] as { url?: unknown; custom?: unknown } | undefined)
    : undefined;
  if (first === undefined) return undefined;
  return {
    ...(typeof first.url === 'string' ? { url: first.url } : {}),
    custom: (first.custom ?? {}) as Record<string, string>,
  };
}

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** True when an RS256 JWT verifies against one of `keys`. */
function verifiesAgainst(token: string, keys: readonly webcrypto.JsonWebKey[]): boolean {
  const [header, payload, signature] = token.split('.') as [string, string, string];
  const kid = (JSON.parse(Buffer.from(header, 'base64url').toString()) as { kid?: string }).kid;
  const jwk = keys.find((k) => (k as { kid?: string }).kid === kid) ?? keys[0];
  if (jwk === undefined) return false;
  return verify(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(signature, 'base64url'),
  );
}

/** What saLTIre's service XHRs answer: the platform's HTTP exchange. */
interface SaltireServiceAnswer {
  readonly http?: {
    readonly status?: number;
    readonly response?: string;
    readonly responseJson?: unknown;
  };
}

class SaltireSession implements LtiToolSession {
  readonly features: ReadonlySet<LtiToolFeature>;
  readonly launchUrl: string;
  readonly oidcUrl: string;
  readonly deepLinkingUrl: string;
  private registration: LtiLaunchInfo | undefined;
  private launchesRead = 0;
  private tokenExpires = 0;

  constructor(
    features: ReadonlySet<LtiToolFeature>,
    private readonly baseUrl: string,
    private readonly config: AppConfig,
    private readonly request: APIRequestContext,
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly cookies: readonly Cookie[],
    private readonly toolPublicKey: string,
  ) {
    this.features = features;
    // One URL serves the login, the launch and deep linking, in every session.
    this.launchUrl = `${baseUrl}/tool`;
    this.oidcUrl = `${baseUrl}/tool`;
    this.deepLinkingUrl = `${baseUrl}/tool`;
  }

  static async open(
    features: ReadonlySet<LtiToolFeature>,
    baseUrl: string,
    { config, request, newBrowserContext }: LtiToolContext,
  ): Promise<SaltireSession> {
    const context = await newBrowserContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/tool`, { waitUntil: 'networkidle', timeout: TIMEOUTS.navigation });
    await page.locator(S.signatureMethod).selectOption('RS256');
    const toolPublicKey = await page.locator(S.publicKey).inputValue();
    const cookies = (await context.cookies(baseUrl)).filter((c) => c.name === SESSION_COOKIE);
    if (cookies.length === 0 || !toolPublicKey.includes('PUBLIC KEY')) {
      await context.close();
      throw new Error(`saLTIre at ${baseUrl} opened no session (no ${SESSION_COOKIE} or key).`);
    }
    return new SaltireSession(
      features,
      baseUrl,
      config,
      request,
      context,
      page,
      cookies,
      toolPublicKey,
    );
  }

  publicKey(): Promise<string> {
    return Promise.resolve(this.toolPublicKey);
  }

  async register(info: LtiLaunchInfo): Promise<void> {
    const p = this.page;
    // After a launch or a service call the page shows another view; the form
    // is on the Security Model one (its script must be ready to switch views).
    await this.declineModals();
    await p.reload({ waitUntil: 'networkidle', timeout: TIMEOUTS.navigation });
    await p.locator(S.securityModel).click();
    await p.locator(S.signatureMethod).selectOption('RS256');
    await p.locator(S.platform.issuer).fill(info.issuer);
    await p.locator(S.platform.clientId).fill(info.clientId);
    await p.locator(S.platform.deploymentId).fill(info.deploymentId);
    await p.locator(S.platform.authUrl).fill(info.loginUrl);
    await p.locator(S.platform.tokenUrl).fill(info.tokenUrl);
    await p.locator(S.platform.keysetUrl).fill(info.keysetUrl);
    const saved = p.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().startsWith(`${this.baseUrl}/tool`),
      { timeout: TIMEOUTS.navigation },
    );
    await p.locator(S.save).click();
    await saved;
    // Bounded: an unbounded `networkidle` wait here once held a run until its timeout.
    await p.waitForLoadState('load', { timeout: TIMEOUTS.navigation });
    this.registration = info;
    this.tokenExpires = 0;
  }

  /**
   * The session cookie twice: as saLTIre set it (top-level saLTIre windows), and
   * in the partition of the LMS's site, which is where the block's iframe reads
   * it (Chromium keys a third-party iframe's partitioned cookies by the
   * top-level site and a cross-site-ancestor bit).
   *
   * `_crHasCrossSiteAncestor` is a Chromium-only cookie field Playwright passes
   * through but does not type (measured on Playwright 1.64); without it the
   * cookie lands in the same-site partition and the iframe never sees it.
   */
  async admit(context: BrowserContext): Promise<void> {
    const lms = new URL(this.config.baseUrls.lms);
    const partitionKey = `${lms.protocol}//${registrableDomain(lms.hostname) ?? lms.hostname}`;
    await context.addCookies([
      ...this.cookies,
      ...this.cookies.map((c) => ({ ...c, partitionKey, _crHasCrossSiteAncestor: true })),
    ]);
  }

  async readLaunch(source: LtiLaunchSource): Promise<LtiLaunch> {
    if (source.surface === undefined) {
      throw new Error(
        'saLTIre shows a launch only on the page it landed on: pass the launch window or ' +
          'frame as `surface`.',
      );
    }
    const raw = await source.surface
      .locator(S.rawParameters)
      .textContent({ timeout: TIMEOUTS.ltiLaunchReceived });
    const token = idTokenFromRawParameters(raw ?? '');
    if (token === undefined) throw new Error('saLTIre shows no id_token for this launch.');
    const claims = jwtPayload(token);
    const resourceLink = claims[LTI_CLAIM.resourceLink] as { id?: unknown } | undefined;
    let error: string | undefined;
    try {
      const registration = this.registration;
      if (registration === undefined) throw new Error('The session registered no platform.');
      const keyset = (await (await this.request.get(registration.keysetUrl)).json()) as {
        keys?: webcrypto.JsonWebKey[];
      };
      if (!verifiesAgainst(token, keyset.keys ?? []))
        throw new Error('The signature does not verify.');
      if (claims.iss !== registration.issuer)
        throw new Error(`Unexpected issuer ${String(claims.iss)}.`);
      if (claims[LTI_CLAIM.deploymentId] !== registration.deploymentId) {
        throw new Error(`Unexpected deployment ${String(claims[LTI_CLAIM.deploymentId])}.`);
      }
      if (resourceLink?.id !== source.resourceLinkId) {
        throw new Error(`This page shows a launch of ${String(resourceLink?.id)}.`);
      }
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    }
    this.launchesRead += 1;
    const aud: unknown = Array.isArray(claims.aud) ? (claims.aud as unknown[])[0] : claims.aud;
    return {
      // Newer than any `after` from this session: reads are in order.
      id: (source.after?.id ?? 0) + this.launchesRead,
      receivedAt: new Date().toISOString(),
      verified: error === undefined,
      ...(error === undefined ? {} : { error }),
      clientId: typeof aud === 'string' ? aud : '',
      messageType: stringOrUndefined(claims[LTI_CLAIM.messageType]),
      targetLinkUri: stringOrUndefined(claims[LTI_CLAIM.targetLinkUri]),
      resourceLinkId: stringOrUndefined(resourceLink?.id),
      claims,
    };
  }

  // --- Services: saLTIre's cards on the session's own page ------------------

  private async openCard(id: string): Promise<void> {
    await this.declineModals();
    await this.page.locator(S.servicesMenu).click();
    await this.page.locator(S.card(id)).click();
  }

  /**
   * Runs `action` (a service button) and returns saLTIre's XHR answer: the
   * platform's status and body. Once the answer is in, saLTIre offers in-page
   * modals to show the request and the response; each is declined.
   */
  private async serviceCall<T>(action: () => Promise<void>): Promise<LtiServiceResponse<T>> {
    const answer = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/tp-[\w-]+\.php$/.test(new URL(r.url()).pathname),
      { timeout: TIMEOUTS.navigation },
    );
    await action();
    const response = await answer;
    await this.declineModals();
    const json = (await response.json()) as SaltireServiceAnswer;
    const http = json.http ?? {};
    let body: unknown = http.responseJson ?? http.response ?? '';
    if (typeof body === 'string' && body !== '') {
      try {
        body = JSON.parse(body);
      } catch {
        // Not JSON: hand back the text.
      }
    }
    return { status: http.status ?? 0, body: body as T };
  }

  /**
   * Declines saLTIre's follow-up modals ("View service request?", "View request
   * message?") until none is left, and closes any other modal still open (a
   * request viewer, an alert), so the next control can be clicked.
   */
  private async declineModals(): Promise<void> {
    const modal = this.page.locator('.modal.show');
    for (let i = 0; i < MAX_FOLLOW_UP_MODALS; i++) {
      const shown = await modal
        .first()
        .waitFor({ state: 'visible', timeout: NEXT_MODAL_WAIT_MS })
        .then(() => true)
        .catch(() => false);
      if (!shown) return;
      const current = modal.first();
      // saLTIre's own button labels (its markup, not the platform's).
      const no = current.locator('button').filter({ hasText: /^No$/ });
      const close = current.locator('button.btn-close, button').filter({ hasText: /^(Close|)$/ });
      await ((await no.count()) > 0 ? no.first() : close.first()).click();
      await current.waitFor({ state: 'hidden', timeout: TIMEOUTS.expect }).catch(() => undefined);
    }
  }

  /** An access token with every scope the specs use, from the platform (once per hour). */
  private async ensureToken(): Promise<void> {
    if (Date.now() < this.tokenExpires) return;
    await this.page.reload({ waitUntil: 'networkidle', timeout: TIMEOUTS.navigation });
    await this.openCard('accesstoken');
    for (const scope of SCOPES) await this.page.locator(S.scope(scope)).check();
    const token = await this.serviceCall<unknown>(() => this.page.locator(S.requestToken).click());
    if (token.status !== 200) {
      throw new Error(`saLTIre could not get an access token: HTTP ${token.status}.`);
    }
    this.tokenExpires = Date.now() + TOKEN_REUSE_MS;
  }

  private async agsSection(section: keyof typeof AGS_SECTIONS): Promise<void> {
    await this.openCard('outcomes2');
    // saLTIre's own section labels (its markup, not the platform's).
    const toggle = this.page.locator(`${S.ags.card} button`, { hasText: AGS_SECTIONS[section] });
    const field = section === 'score' ? S.ags.scoreUrl : S.ags.containerUrl;
    if (!(await this.page.locator(field).isVisible())) await toggle.click();
    await this.page.locator(field).waitFor();
  }

  async postScore(
    launch: LtiLaunch,
    scoreGiven: number,
    scoreMaximum: number,
    lineItemUrl?: string,
  ): Promise<LtiServiceResponse> {
    const url = agsLineItemUrl(launch, lineItemUrl);
    await this.ensureToken();
    const a = S.ags;
    // The score endpoint is not an input of its own: saLTIre derives it from
    // the line item chosen in the line-item section (line item + `/scores`).
    await this.agsSection('lineItems');
    const item = this.page.locator(a.itemUrl);
    await item.fill(url);
    await item.dispatchEvent('change');
    await this.agsSection('score');
    if ((await this.page.locator(a.scoreUrl).inputValue()) !== `${url}/scores`) {
      throw new Error(`saLTIre did not take ${url} as the line item to score.`);
    }
    await this.page.locator(a.scoreUser).fill(String(launch.claims.sub));
    await this.page.locator(a.scoreGiven).fill(String(scoreGiven));
    await this.page.locator(a.scoreMaximum).fill(String(scoreMaximum));
    await this.page.locator(a.activityProgress).fill('Completed');
    await this.page.locator(a.gradingProgress).fill('FullyGraded');
    return this.serviceCall(() => this.page.locator(a.scoreSend).click());
  }

  async createLineItem(
    launch: LtiLaunch,
    item: Omit<AgsLineItem, 'id'>,
  ): Promise<LtiServiceResponse<AgsLineItem>> {
    await this.ensureToken();
    await this.agsSection('lineItems');
    const a = S.ags;
    await this.page.locator(a.containerChoice).check();
    await this.page.locator(a.containerUrl).fill(agsLineItemsUrl(launch));
    await this.page.locator(a.label).fill(item.label ?? '');
    await this.page.locator(a.points).fill(String(item.scoreMaximum));
    await this.page.locator(a.resourceLinkId).fill(item.resourceLinkId ?? '');
    await this.page.locator(a.resourceId).fill('');
    await this.page.locator(a.tag).fill('');
    return this.serviceCall(() => this.page.locator(a.create).click());
  }

  async listLineItems(launch: LtiLaunch): Promise<LtiServiceResponse<readonly AgsLineItem[]>> {
    await this.ensureToken();
    await this.agsSection('lineItems');
    const a = S.ags;
    await this.page.locator(a.containerChoice).check();
    await this.page.locator(a.containerUrl).fill(agsLineItemsUrl(launch));
    for (const filter of a.listFilters) await this.page.locator(filter).uncheck();
    return this.serviceCall(() => this.page.locator(a.read).click());
  }

  async deleteLineItem(_launch: LtiLaunch, lineItemUrl: string): Promise<LtiServiceResponse> {
    await this.ensureToken();
    await this.agsSection('lineItems');
    const a = S.ags;
    await this.page.locator(a.itemChoice).check();
    await this.page.locator(a.itemUrl).fill(lineItemUrl);
    return this.serviceCall(() => this.page.locator(a.delete).click());
  }

  async memberships(launch: LtiLaunch, url?: string): Promise<LtiServiceResponse<Memberships>> {
    const target = nrpsMembershipsUrl(launch, url);
    await this.ensureToken();
    await this.openCard('nrp');
    await this.page.locator(S.nrps.url).fill(target);
    await this.page.locator(S.nrps.resourceLinkFilter).uncheck();
    return this.serviceCall(() => this.page.locator(S.nrps.read).click());
  }

  // --- Deep linking ---------------------------------------------------------

  async chooseDeepLink(window: Page, choice: 'a' | 'b'): Promise<LtiDeepLinkChoice> {
    const d = S.deepLinking;
    await window
      .locator(S.rawParameters)
      .waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });
    // The tab is an `href="#"` anchor its script takes over; clicked before the
    // script is ready, it navigates to saLTIre's home page instead.
    await window.waitForLoadState('networkidle', { timeout: TIMEOUTS.navigation });
    await window.locator(d.tab).click();
    await window.locator(d.itemTypes).first().waitFor({ timeout: TIMEOUTS.expect });
    // saLTIre remembers ticked items across picks in a session: tick only this one.
    for (const box of await window.locator(d.itemTypes).all()) {
      if (await box.isChecked()) await box.uncheck();
    }
    await window.locator(d.itemType(DEEP_LINK_TYPES[choice])).check();
    const answer = window.waitForResponse((r) => r.url().includes('/lti-dl/response'), {
      timeout: TIMEOUTS.navigation,
    });
    await window.locator(d.returnSelection).click();
    const response = await answer;
    // The answer is a top-level form post to the platform: let the window land on
    // its page before the caller closes it (closing mid-navigation can hang).
    if (!window.isClosed()) {
      await window.waitForURL(response.url(), { timeout: TIMEOUTS.navigation });
    }
    const item = contentItemFromResponseBody(response.request().postData() ?? '');
    if (item === undefined) throw new Error('saLTIre returned no content item.');
    return { answerStatus: response.status(), ...item };
  }

  async dispose(): Promise<void> {
    await this.context.close();
  }
}

/** The saLTIre provider: every feature, given a public platform. */
class SaltireProvider implements LtiToolProvider {
  readonly name = 'saltire';
  readonly features: ReadonlySet<LtiToolFeature> = new Set([
    'claims',
    'services',
    'deep-linking',
    'inline',
  ]);
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = saltireBaseUrlFromEnv();
  }

  async openSession(context: LtiToolContext): Promise<LtiToolSession> {
    return SaltireSession.open(this.features, this.baseUrl, context);
  }
}

export const ltiToolProvider = SaltireProvider;
