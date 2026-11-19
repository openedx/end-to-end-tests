import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import {
  configureLti13Block,
  createXBlock,
  publishXBlock,
  readLtiLaunchInfo,
  type Lti13Settings,
  type LtiLaunchInfo,
  type LtiToolClient,
} from '../api';

/** An LTI 1.3 block the test tool can be launched from. */
export interface ReadyLtiBlock {
  readonly blockKey: string;
  readonly unitKey: string;
  /** What the tool was registered with: the block's client id, keyset, token and login URLs. */
  readonly info: LtiLaunchInfo;
}

/**
 * Seeds an LTI 1.3 block pointed at the suite's test tool and makes it
 * launchable, the way an author and a tool administrator would between them:
 * the block is created in `unitKey` and given the tool's launch and login URLs
 * and public key (plus `settings`), its registration values are read back from
 * Studio — which also creates the block's LTI configuration, so a duplicate of
 * it shares the client id — and registered with the tool, and the unit is
 * published.
 *
 * `request` is the author's (`page.request` in a test that holds the author's
 * browser session).
 */
export async function seedReadyLtiBlock(
  request: APIRequestContext,
  config: AppConfig,
  tool: LtiToolClient,
  unitKey: string,
  settings: Omit<Lti13Settings, 'launchUrl' | 'oidcUrl' | 'toolPublicKey'> & {
    readonly displayName?: string;
  } = {},
): Promise<ReadyLtiBlock> {
  const { displayName, ...blockSettings } = settings;
  const blockKey = await createXBlock(request, config, {
    parentLocator: unitKey,
    category: 'lti_consumer',
    ...(displayName === undefined ? {} : { displayName }),
  });
  await configureLti13Block(request, config, blockKey, {
    ...blockSettings,
    launchUrl: tool.launchUrl,
    oidcUrl: tool.oidcUrl,
    toolPublicKey: await tool.publicKey(),
  });
  const info = await readLtiLaunchInfo(request, config, blockKey);
  await tool.register(info);
  await publishXBlock(request, config, unitKey);
  return { blockKey, unitKey, info };
}
