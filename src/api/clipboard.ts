import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { studioWrite } from './studio-origin';

/** The user's server-side clipboard — what "Copy to clipboard" stages and "Paste" reads. */
export const CLIPBOARD_PATH = '/api/content-staging/v1/clipboard/';

/** The staged clipboard content, as the API reports it. */
export interface Clipboard {
  readonly content: {
    readonly status: string;
    readonly block_type: string;
    readonly block_type_display: string;
    readonly display_name: string;
  } | null;
  readonly source_usage_key: string;
  readonly source_context_title: string;
}

/**
 * Copies a block to the user's server-side clipboard — the call the authoring
 * MFE's "Copy to clipboard" makes. It stages the block's OLX per user (no browser
 * clipboard, no permission grant), so a later paste — in the same or another
 * course the user can edit — can insert it. The paste itself is a UI action the
 * outline/unit page objects drive; the spec asserts on the resulting block.
 */
export async function copyToClipboard(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<Clipboard> {
  return studioWrite<Clipboard>(
    request,
    config,
    'POST',
    CLIPBOARD_PATH,
    `Copying ${usageKey} to the clipboard`,
    { usage_key: usageKey },
  );
}
