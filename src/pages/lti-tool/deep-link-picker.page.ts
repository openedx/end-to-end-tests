import type { Page, Response } from '@playwright/test';

import { LTI_TOOL_SELECTORS, TIMEOUTS } from '../../config';
import { LTI_CONSUMER_API_PATH } from '../../api';

/**
 * The test tool's deep-linking picker (`scripts/lti-tool/tool.mts`), in the
 * window an author's deep-linking launch opened: one button per resource.
 * Choosing one makes the tool post its signed answer back to the platform.
 */
export class LtiDeepLinkPicker {
  constructor(private readonly page: Page) {}

  /** Waits for the picker to render (the launch was verified). */
  async waitFor(): Promise<void> {
    await this.page.locator(LTI_TOOL_SELECTORS.picker).waitFor({ timeout: TIMEOUTS.navigation });
  }

  /**
   * Chooses a resource by its key and returns the platform's answer to the
   * tool's deep-linking response (`POST …/lti-dl/response`).
   */
  async choose(key: string): Promise<Response> {
    const answer = this.page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().includes(LTI_CONSUMER_API_PATH) &&
        r.url().includes('/lti-dl/response'),
      { timeout: TIMEOUTS.navigation },
    );
    await this.page.locator(LTI_TOOL_SELECTORS.choice(key)).click();
    return answer;
  }
}
