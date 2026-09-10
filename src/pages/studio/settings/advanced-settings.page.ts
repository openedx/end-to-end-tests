import type { Locator, Page } from '@playwright/test';

import {
  STUDIO_ADVANCED_SETTINGS_SELECTORS,
  STUDIO_SETTINGS_SAVE_BAR_SELECTORS,
  TIMEOUTS,
  type AppConfig,
} from '../../../config';
import { studioOrigin } from '../../../api';
import { waitForWrite } from '../wait-for-write';

/**
 * Advanced Settings in the authoring MFE (`/settings/advanced/<key>` on Studio,
 * redirected to the MFE). Each setting is a `<textarea>` holding its value as
 * JSON, keyed by the setting's camelCase policy name; editing one reveals the
 * shared save bar. Locators and single-surface actions; the spec asserts, against
 * `fetchAdvancedSettings` and the LMS course/enrollment APIs.
 */
export class StudioAdvancedSettingsPage {
  readonly page: Page;
  readonly saveButton: Locator;

  constructor(
    page: Page,
    private readonly config: AppConfig,
  ) {
    this.page = page;
    this.saveButton = page.locator(STUDIO_SETTINGS_SAVE_BAR_SELECTORS.saveButton);
  }

  url(courseKey: string): string {
    return `${studioOrigin(this.config)}/settings/advanced/${courseKey}`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.page.locator(STUDIO_ADVANCED_SETTINGS_SELECTORS.ready).waitFor();
  }

  /** The textarea for one setting, by its camelCase policy name. */
  field(name: string): Locator {
    return this.page.locator(STUDIO_ADVANCED_SETTINGS_SELECTORS.field(name));
  }

  /**
   * Sets one setting's value. `value` is the JSON the field holds: a string is
   * passed as JSON (`"about"` → the field shows `"about"`), everything else is
   * serialized (`5`, `true`, `["teams"]`).
   */
  async setField(name: string, value: unknown): Promise<void> {
    const field = this.field(name);
    await field.click();
    await field.press('ControlOrMeta+a');
    await field.press('Delete');
    await field.pressSequentially(JSON.stringify(value));
    await field.blur();
  }

  /**
   * Presses "Save changes" and returns the status of the resulting write. The MFE
   * saves advanced settings with `PATCH /api/contentstore/v0/advanced_settings/<key>`
   * (the `v0` route the authoring MFE posts to), so the spec judges the save
   * before reading it back.
   */
  async save(courseKey: string): Promise<{ status: number }> {
    await this.saveButton.waitFor({ state: 'visible' });
    const response = await waitForWrite(
      this.page,
      {
        method: ['PATCH', 'POST', 'PUT'],
        urlIncludes: `advanced_settings/${courseKey}`,
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => this.saveButton.click(),
    );
    return { status: response.status() };
  }
}
