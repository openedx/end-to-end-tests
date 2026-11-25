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
  /** The modal listing the settings a save was refused for. */
  readonly errorModal: Locator;
  /** One list item per refused setting in {@link errorModal}. */
  readonly errorItems: Locator;

  constructor(
    page: Page,
    private readonly config: AppConfig,
  ) {
    this.page = page;
    this.saveButton = page.locator(STUDIO_SETTINGS_SAVE_BAR_SELECTORS.saveButton);
    this.errorModal = page.locator(STUDIO_ADVANCED_SETTINGS_SELECTORS.errorModal);
    this.errorItems = page.locator(STUDIO_ADVANCED_SETTINGS_SELECTORS.errorItem);
  }

  /** The heading naming the setting in a refused-setting list item. */
  errorItemTitle(item: Locator): Locator {
    return item.locator(STUDIO_ADVANCED_SETTINGS_SELECTORS.errorItemTitle);
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
   * Sets one setting's field to `text` exactly as typed — for a value that is not
   * JSON at all, which {@link setField} cannot express.
   */
  async setFieldText(name: string, text: string): Promise<void> {
    const field = this.field(name);
    await field.click();
    await field.press('ControlOrMeta+a');
    await field.press('Delete');
    await field.pressSequentially(text);
    await field.blur();
  }

  /**
   * Presses "Save changes" on edits the page's own JSON check refuses, and waits
   * for the error modal it opens instead of sending a write.
   */
  async saveRefusedLocally(): Promise<void> {
    await this.saveButton.waitFor({ state: 'visible' });
    await this.saveButton.click();
    await this.errorModal.waitFor();
  }

  /**
   * Presses "Save changes" and returns the status of the resulting write, so the
   * spec judges the save before reading it back. The MFE has saved advanced
   * settings under more than one API generation (`PATCH
   * /api/contentstore/v0/advanced_settings/<key>`, and a course-scoped
   * `.../courses/<key>/advanced_settings/` route), so the write is recognised by
   * its resource and course, not by one fixed URL shape.
   */
  async save(courseKey: string): Promise<{ status: number }> {
    await this.saveButton.waitFor({ state: 'visible' });
    const response = await waitForWrite(
      this.page,
      {
        method: ['PATCH', 'POST', 'PUT'],
        predicate: (r) => r.url().includes('advanced_settings') && r.url().includes(courseKey),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => this.saveButton.click(),
    );
    return { status: response.status() };
  }
}
