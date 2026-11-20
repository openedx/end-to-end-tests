import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  FrameLocator,
  Page,
} from '@playwright/test';

import type { AppConfig } from '../config';
import type {
  AgsLineItem,
  LtiLaunch,
  LtiLaunchInfo,
  LtiServiceResponse,
  Memberships,
} from '../api';

export type { AgsLineItem, LtiLaunch, LtiLaunchInfo, LtiServiceResponse, Memberships };

/**
 * What a tool can do beyond a plain launch. A spec that needs one carries the
 * matching capability tag (step 4 of the provider work), and a provider declares
 * only what it really supports, so a target never runs a case its tool can't.
 *
 * - `claims`: reports every claim a launch carried (roles, `name`, `email`, …).
 * - `services`: calls the platform's LTI Advantage services (AGS, NRPS) as the
 *   tool — which needs the platform reachable from the tool.
 * - `deep-linking`: answers a deep-linking request with a resource the test
 *   chooses.
 * - `inline`: can be launched in the block's iframe, not only in a new window.
 */
export const LTI_TOOL_FEATURES = ['claims', 'services', 'deep-linking', 'inline'] as const;
export type LtiToolFeature = (typeof LTI_TOOL_FEATURES)[number];

/** The capability a target declares for a feature (`lti-tool-<feature>`). */
export function featureCapability(feature: LtiToolFeature): `lti-tool-${LtiToolFeature}` {
  return `lti-tool-${feature}`;
}

/** What a provider may use to open a session. */
export interface LtiToolContext {
  readonly config: AppConfig;
  /** A request context with no platform session, for the tool's own HTTP. */
  readonly request: APIRequestContext;
  /** The run's browser, for a provider driven through the tool's own pages. */
  readonly browser: Browser;
}

/**
 * Where to read a launch from. A tool that records launches (the bundled one)
 * finds it by the block's resource link; a tool that only shows the message it
 * received (saLTIre) reads it from the window or frame the launch landed in.
 */
export interface LtiLaunchSource {
  /** The launched block's usage key (the `resource_link.id` claim). */
  readonly resourceLinkId: string;
  /** A launch already read: the one wanted is newer (a relaunch of the same block). */
  readonly after?: LtiLaunch;
  /** The new window, or the block's inline launch frame. */
  readonly surface?: Page | FrameLocator;
}

/** The resource a deep-linking pick returned, and how the platform took it. */
export interface LtiDeepLinkChoice {
  /** The HTTP status the platform answered the tool's deep-linking response with. */
  readonly answerStatus: number;
  /** The resource's launch URL, when the tool sent one. */
  readonly url?: string;
  /** The resource's custom parameters: what a later launch of it carries as `custom`. */
  readonly custom: Readonly<Record<string, string>>;
}

/**
 * One test's use of a tool: its own registration, and the actors it has
 * admitted. Opened per test and disposed after, so parallel tests never share a
 * registration.
 */
export interface LtiToolSession {
  /** What the tool supports beyond a plain launch: its provider's features. */
  readonly features: ReadonlySet<LtiToolFeature>;
  /** The URLs written into a block, as a browser reaches the tool. */
  readonly launchUrl: string;
  readonly oidcUrl: string;
  readonly deepLinkingUrl: string;
  /** The tool's RSA public key (PEM), for the block's public-key mode. */
  publicKey(): Promise<string>;
  /** Registers the platform as Studio shows it for one block (or one reusable configuration). */
  register(info: LtiLaunchInfo): Promise<void>;
  /**
   * Readies another actor's browser context (a learner's, course staff's, the
   * author's) to launch into this session. A no-op for a tool that keeps no
   * per-browser state.
   */
  admit(context: BrowserContext): Promise<void>;
  /** What a launch carried, once the tool has it. Throws when it never arrives. */
  readLaunch(source: LtiLaunchSource): Promise<LtiLaunch>;
  /** Posts a completed, fully graded score for the launching user (`services`). */
  postScore(
    launch: LtiLaunch,
    scoreGiven: number,
    scoreMaximum: number,
    lineItemUrl?: string,
  ): Promise<LtiServiceResponse>;
  /** Creates a line item in the launch's container (`services`, programmatic mode). */
  createLineItem(
    launch: LtiLaunch,
    item: Omit<AgsLineItem, 'id'>,
  ): Promise<LtiServiceResponse<AgsLineItem>>;
  listLineItems(launch: LtiLaunch): Promise<LtiServiceResponse<readonly AgsLineItem[]>>;
  deleteLineItem(launch: LtiLaunch, lineItemUrl: string): Promise<LtiServiceResponse>;
  /** The course's members as NRPS answers the tool (`services`). */
  memberships(launch: LtiLaunch, url?: string): Promise<LtiServiceResponse<Memberships>>;
  /**
   * Picks resource `choice` in the tool's deep-linking page, opened in `window`,
   * and returns it (`deep-linking`). Two choices differ in their `custom`.
   */
  chooseDeepLink(window: Page, choice: 'a' | 'b'): Promise<LtiDeepLinkChoice>;
  /** Frees what the session holds. Best-effort. */
  dispose(): Promise<void>;
}

/**
 * An LTI 1.3 tool the suite's LTI specs launch: the bundled one (`local`, built
 * in) or a plugin listed in `CUSTOM_LTI_TOOL_PROVIDER_PLUGINS`, selected by
 * `LTI_TOOL_PROVIDER`.
 */
export interface LtiToolProvider {
  /** The name `LTI_TOOL_PROVIDER` selects it by. */
  readonly name: string;
  /** What the tool supports beyond a plain launch. */
  readonly features: ReadonlySet<LtiToolFeature>;
  openSession(context: LtiToolContext): Promise<LtiToolSession>;
}
