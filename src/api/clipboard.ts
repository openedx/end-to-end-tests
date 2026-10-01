import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
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
 * How many times a copy that answers 500 is re-issued (`PLAT-010`). One retry
 * clears the race below; the second is headroom.
 */
const CLIPBOARD_DEADLOCK_RETRIES = 2;

/**
 * Copies a block to the user's server-side clipboard — the call the authoring
 * MFE's "Copy to clipboard" makes. It stages the block's OLX per user (no browser
 * clipboard, no permission grant), so a later paste — in the same or another
 * course the user can edit — can insert it. The paste itself is a UI action the
 * outline/unit page objects drive; the spec asserts on the resulting block.
 *
 * Works around `PLAT-010` (docs/findings.md, openedx-platform#39118): a copy
 * expires the user's previous clipboard content and queues its deletion from
 * inside the request's transaction. An idle CMS worker deletes that row (and,
 * by cascade, the user's clipboard row) before the request commits, and the
 * request's own clipboard update then deadlocks with it: MySQL 1213, answered
 * as a bare 500. The failed request rolls back while the deletion stands, so
 * re-issuing the copy succeeds. Only a 500 is retried, and immediately: the
 * race is already over by the time the error comes back.
 */
export async function copyToClipboard(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<Clipboard> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await studioWrite<Clipboard>(
        request,
        config,
        'POST',
        CLIPBOARD_PATH,
        `Copying ${usageKey} to the clipboard`,
        { usage_key: usageKey },
      );
    } catch (error) {
      const deadlocked = error instanceof ApiError && error.status === 500;
      if (!deadlocked || attempt >= CLIPBOARD_DEADLOCK_RETRIES) {
        throw error;
      }
    }
  }
}
