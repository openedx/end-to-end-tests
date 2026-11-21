import type { APIRequestContext } from '@playwright/test';

import type { AppConfig, LtiToolConfig } from '../config';
import { ApiError } from './errors';
import type { LtiLaunchInfo } from './lti';

/**
 * Client for the suite's LTI 1.3 test tool (`scripts/lti-tool.mts`): its control
 * API, which registers the platform, reports the launches the tool received —
 * the oracle for "the tool was launched with …" — and calls the platform's LTI
 * Advantage services (AGS, NRPS) on the tool's behalf.
 *
 * The suite reaches the control API on this machine directly
 * ({@link LtiToolConfig.controlUrl}); the URLs written into a block are the
 * browser's ({@link LtiToolConfig.baseUrl}).
 */

/** LTI 1.3 claim names, as the tool records them. */
export const LTI_CLAIM = {
  messageType: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  deploymentId: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  targetLinkUri: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  resourceLink: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  roles: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  context: 'https://purl.imsglobal.org/spec/lti/claim/context',
  custom: 'https://purl.imsglobal.org/spec/lti/claim/custom',
  ags: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
  nrps: 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice',
} as const;

/** LIS role URIs the launch and roster cases read. */
export const LTI_ROLE = {
  learner: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
  instructor: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
  administrator: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Administrator',
  systemAdministrator: 'http://purl.imsglobal.org/vocab/lis/v2/system/person#Administrator',
} as const;

/** One launch the tool received. */
export interface LtiLaunch {
  readonly id: number;
  readonly receivedAt: string;
  /** Signature, issuer, deployment and nonce all checked out. */
  readonly verified: boolean;
  /** Why verification failed, when it did. */
  readonly error?: string;
  readonly clientId: string;
  readonly messageType?: string;
  readonly targetLinkUri?: string;
  /** The `resource_link.id` claim: the launched block's usage key. */
  readonly resourceLinkId?: string;
  readonly claims: Readonly<Record<string, unknown>>;
}

/** What a platform service answered a call the tool made. */
export interface LtiServiceResponse<T = unknown> {
  readonly status: number;
  readonly body: T;
}

/** LTI Advantage scopes the tool asks for. */
const LTI_SCOPE = {
  lineItem: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  score: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
  memberships: 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
} as const;

const MEDIA_TYPE = {
  lineItem: 'application/vnd.ims.lis.v2.lineitem+json',
  lineItems: 'application/vnd.ims.lis.v2.lineitemcontainer+json',
  score: 'application/vnd.ims.lis.v1.score+json',
  memberships: 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
} as const;

/** A launch's AGS endpoint claim: the line-item container, and the block's own line item (declarative mode). */
export interface AgsEndpoint {
  readonly scope?: readonly string[];
  readonly lineitems?: string;
  readonly lineitem?: string;
}

/** A launch's NRPS claim. */
export interface NrpsEndpoint {
  readonly context_memberships_url?: string;
}

/** An AGS line item, as the platform answers for one. */
export interface AgsLineItem {
  /** The line item's own URL. */
  readonly id: string;
  readonly scoreMaximum: number;
  readonly label?: string;
  readonly resourceLinkId?: string;
}

/** An NRPS membership container. */
export interface Memberships {
  readonly context?: { readonly id?: string };
  readonly members?: readonly { readonly user_id: string; readonly roles: readonly string[] }[];
}

/** The AGS endpoint claim of a launch, or `undefined` when it carries none. */
export function agsEndpoint(launch: LtiLaunch): AgsEndpoint | undefined {
  return launch.claims[LTI_CLAIM.ags] as AgsEndpoint | undefined;
}

/** The NRPS claim of a launch, or `undefined` when it carries none. */
export function nrpsEndpoint(launch: LtiLaunch): NrpsEndpoint | undefined {
  return launch.claims[LTI_CLAIM.nrps] as NrpsEndpoint | undefined;
}

/** The line item a score goes to: `override`, else the block's own (declarative mode). Throws when neither. */
export function agsLineItemUrl(launch: LtiLaunch, override?: string): string {
  const url = override ?? agsEndpoint(launch)?.lineitem;
  if (url === undefined) throw new Error('The launch carries no AGS line item to score.');
  return url;
}

/** The launch's AGS line-item container. Throws when it carries none. */
export function agsLineItemsUrl(launch: LtiLaunch): string {
  const url = agsEndpoint(launch)?.lineitems;
  if (url === undefined) throw new Error('The launch carries no AGS line-item container.');
  return url;
}

/** The memberships URL to read: `override`, else the launch's NRPS claim. Throws when neither. */
export function nrpsMembershipsUrl(launch: LtiLaunch, override?: string): string {
  const url = override ?? nrpsEndpoint(launch)?.context_memberships_url;
  if (url === undefined) throw new Error('The launch carries no NRPS memberships URL.');
  return url;
}

/** The roles claim of a launch (empty when it carries none). */
export function launchRoles(launch: LtiLaunch): readonly string[] {
  const roles = launch.claims[LTI_CLAIM.roles];
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
}

export class LtiToolClient {
  constructor(
    private readonly request: APIRequestContext,
    readonly tool: LtiToolConfig,
  ) {}

  /** The tool's launch and OIDC login URLs, as the browser reaches them. */
  get launchUrl(): string {
    return `${this.tool.baseUrl}/launch`;
  }

  get oidcUrl(): string {
    return `${this.tool.baseUrl}/login`;
  }

  private async control<T>(path: string, data?: unknown): Promise<T> {
    const url = `${this.tool.controlUrl}${path}`;
    let response: Awaited<ReturnType<APIRequestContext['get']>>;
    try {
      response =
        data === undefined ? await this.request.get(url) : await this.request.post(url, { data });
    } catch (error) {
      throw new ApiError(
        `The LTI test tool is not answering at ${url} (${String(error)}). The run starts it ` +
          'when the target declares "lti-tool"; check that its port is free and LTI_TOOL_BASE_URL.',
        { status: 0, url, body: '' },
      );
    }
    const text = await response.text();
    if (!response.ok()) {
      throw new ApiError(
        `The LTI test tool answered ${path} with HTTP ${response.status()}: ${text}`,
        {
          status: response.status(),
          url,
          body: text,
        },
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(
        `The LTI test tool answered ${path} with something other than JSON: ${text.slice(0, 200)}`,
        { status: response.status(), url, body: text },
      );
    }
  }

  /** Whether the tool is up. Throws naming the tool's address when it is not. */
  async health(): Promise<void> {
    await this.control('/_control/health');
  }

  /** The tool's RSA public key (PEM), for the block's `lti_1p3_tool_public_key`. */
  async publicKey(): Promise<string> {
    return (await this.control<{ pem: string }>('/_control/key')).pem;
  }

  /** Registers the platform as Studio shows it for one block. Idempotent per client id. */
  async register(info: LtiLaunchInfo): Promise<void> {
    await this.control('/_control/registrations', {
      issuer: info.issuer,
      clientId: info.clientId,
      deploymentId: info.deploymentId,
      keysetUrl: info.keysetUrl,
      tokenUrl: info.tokenUrl,
      authUrl: info.loginUrl,
    });
  }

  /** The launches the tool received for a block, newest first. */
  async launches(resourceLinkId: string): Promise<readonly LtiLaunch[]> {
    return this.control<readonly LtiLaunch[]>(
      `/_control/launches?resourceLinkId=${encodeURIComponent(resourceLinkId)}`,
    );
  }

  /**
   * Posts a completed, fully graded score for the launching user to a line item
   * — the block's own (`lineitem`, declarative mode) unless `lineItemUrl` names
   * another. Returns the platform's answer.
   */
  async postScore(
    launch: LtiLaunch,
    scoreGiven: number,
    scoreMaximum: number,
    lineItemUrl?: string,
  ): Promise<LtiServiceResponse> {
    const url = agsLineItemUrl(launch, lineItemUrl);
    return this.call({
      clientId: launch.clientId,
      scopes: [LTI_SCOPE.score],
      method: 'POST',
      url: `${url}/scores`,
      contentType: MEDIA_TYPE.score,
      body: {
        userId: launch.claims.sub,
        scoreGiven,
        scoreMaximum,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
        timestamp: new Date().toISOString(),
      },
    });
  }

  /** Creates a line item in the launch's container (programmatic mode). */
  async createLineItem(
    launch: LtiLaunch,
    item: Omit<AgsLineItem, 'id'>,
  ): Promise<LtiServiceResponse<AgsLineItem>> {
    return this.call<AgsLineItem>({
      clientId: launch.clientId,
      scopes: [LTI_SCOPE.lineItem],
      method: 'POST',
      url: agsLineItemsUrl(launch),
      contentType: MEDIA_TYPE.lineItem,
      accept: MEDIA_TYPE.lineItem,
      body: item,
    });
  }

  /** The line items in the launch's container. */
  async listLineItems(launch: LtiLaunch): Promise<LtiServiceResponse<readonly AgsLineItem[]>> {
    return this.call<readonly AgsLineItem[]>({
      clientId: launch.clientId,
      scopes: [LTI_SCOPE.lineItem],
      url: agsLineItemsUrl(launch),
      accept: MEDIA_TYPE.lineItems,
    });
  }

  /** Deletes a line item by its URL. */
  async deleteLineItem(launch: LtiLaunch, lineItemUrl: string): Promise<LtiServiceResponse> {
    return this.call({
      clientId: launch.clientId,
      scopes: [LTI_SCOPE.lineItem],
      method: 'DELETE',
      url: lineItemUrl,
    });
  }

  /**
   * The course's members as the platform's NRPS answers the tool, at the
   * launch's `context_memberships_url` unless `url` names another.
   */
  async memberships(launch: LtiLaunch, url?: string): Promise<LtiServiceResponse<Memberships>> {
    return this.call<Memberships>({
      clientId: launch.clientId,
      scopes: [LTI_SCOPE.memberships],
      url: nrpsMembershipsUrl(launch, url),
      accept: MEDIA_TYPE.memberships,
    });
  }

  /** Calls a platform LTI Advantage service as the tool, with a fresh access token. */
  private async call<T = unknown>(options: {
    readonly clientId: string;
    readonly scopes: readonly string[];
    readonly url: string;
    readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    readonly body?: unknown;
    readonly contentType?: string;
    readonly accept?: string;
  }): Promise<LtiServiceResponse<T>> {
    return this.control<LtiServiceResponse<T>>('/_control/call', options);
  }
}

/**
 * A client for the configured LTI test tool. Throws when the target does not
 * declare `lti-tool` (there is no tool configured).
 */
export function ltiToolClient(request: APIRequestContext, config: AppConfig): LtiToolClient {
  if (config.ltiTool === undefined) {
    throw new ApiError(
      'This needs the LTI test tool, which runs only when CAPABILITIES declares "lti-tool".',
      { status: 0, url: '', body: '' },
    );
  }
  return new LtiToolClient(request, config.ltiTool);
}
