import type { Page } from '@playwright/test';

import { LOCAL_LTI_TOOL_PROVIDER, TIMEOUTS } from '../config';
import { ltiToolClient, type LtiToolClient } from '../api';
import { LtiDeepLinkPicker } from '../pages/lti-tool/deep-link-picker.page';
import type {
  LtiDeepLinkChoice,
  LtiLaunch,
  LtiLaunchSource,
  LtiToolContext,
  LtiToolFeature,
  LtiToolProvider,
  LtiToolSession,
} from './types';

const POLL_INTERVAL_MS = 500;

/** Everything the LTI specs check. */
const LOCAL_FEATURES: ReadonlySet<LtiToolFeature> = new Set([
  'claims',
  'services',
  'deep-linking',
  'inline',
]);

/**
 * A session on the bundled tool (`scripts/lti-tool.mts`), which the run starts
 * on this machine. The tool records every launch and keeps one registration per
 * client id, so a session needs no state of its own: it reads launches by the
 * block's resource link, and admitting another actor's browser is a no-op.
 */
class LocalLtiToolSession implements LtiToolSession {
  readonly features = LOCAL_FEATURES;

  constructor(private readonly client: LtiToolClient) {}

  get launchUrl(): string {
    return this.client.launchUrl;
  }

  get oidcUrl(): string {
    return this.client.oidcUrl;
  }

  /** The tool answers deep-linking requests at its launch URL. */
  get deepLinkingUrl(): string {
    return this.client.launchUrl;
  }

  publicKey(): Promise<string> {
    return this.client.publicKey();
  }

  register: LtiToolSession['register'] = (info) => this.client.register(info);

  admit(): Promise<void> {
    return Promise.resolve();
  }

  async readLaunch(source: LtiLaunchSource): Promise<LtiLaunch> {
    const deadline = Date.now() + TIMEOUTS.navigation;
    for (;;) {
      const newest = (await this.client.launches(source.resourceLinkId))[0];
      if (newest !== undefined && newest.id > (source.after?.id ?? 0)) return newest;
      if (Date.now() > deadline) {
        throw new Error(
          `The LTI test tool received no launch of ${source.resourceLinkId}` +
            `${source.after === undefined ? '' : ` after launch ${source.after.id}`} within ` +
            `${TIMEOUTS.navigation} ms.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  postScore: LtiToolSession['postScore'] = (launch, given, max, lineItemUrl) =>
    this.client.postScore(launch, given, max, lineItemUrl);

  createLineItem: LtiToolSession['createLineItem'] = (launch, item) =>
    this.client.createLineItem(launch, item);

  listLineItems: LtiToolSession['listLineItems'] = (launch) => this.client.listLineItems(launch);

  deleteLineItem: LtiToolSession['deleteLineItem'] = (launch, url) =>
    this.client.deleteLineItem(launch, url);

  memberships: LtiToolSession['memberships'] = (launch, url) =>
    this.client.memberships(launch, url);

  /** The bundled tool offers resources `a` and `b`; a launch of one carries `custom.resource`. */
  async chooseDeepLink(window: Page, choice: 'a' | 'b'): Promise<LtiDeepLinkChoice> {
    const picker = new LtiDeepLinkPicker(window);
    await picker.waitFor();
    const answer = await picker.choose(choice);
    return {
      answerStatus: answer.status(),
      url: `${this.client.launchUrl}?r=${choice}`,
      custom: { resource: choice },
    };
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * The built-in provider: the suite's bundled LTI 1.3 tool. It supports
 * everything the LTI specs check, and is what CI runs. The tool must answer
 * (the run starts it when `lti-tool` is declared); opening a session checks.
 */
export const localLtiToolProvider: LtiToolProvider = {
  name: LOCAL_LTI_TOOL_PROVIDER,
  features: LOCAL_FEATURES,
  async openSession({ config, request }: LtiToolContext): Promise<LtiToolSession> {
    const client = ltiToolClient(request, config);
    await client.health();
    return new LocalLtiToolSession(client);
  },
};
