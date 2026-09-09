import type { Locator, Page } from '@playwright/test';

import { STUDIO_GROUP_CONFIGURATIONS_SELECTORS, type AppConfig } from '../../../config';
import { GROUP_CONFIGURATIONS_WRITE_PATH, studioOrigin } from '../../../api';
import { waitForWrite } from '../wait-for-write';

/**
 * Group Configurations in the authoring MFE (`/group_configurations/<key>` on
 * Studio, redirected to the MFE). Covers content groups. Locators and
 * single-surface actions; the spec asserts, against `fetchGroupConfigurations`.
 */
export class StudioGroupConfigurationsPage {
  readonly page: Page;
  readonly contentGroupCards: Locator;
  readonly addContentGroupButton: Locator;
  readonly newGroupNameInput: Locator;

  constructor(
    page: Page,
    private readonly config: AppConfig,
  ) {
    this.page = page;
    const s = STUDIO_GROUP_CONFIGURATIONS_SELECTORS;
    this.contentGroupCards = page.locator(s.contentGroupCard);
    this.addContentGroupButton = page.locator(s.addContentGroupButton).first();
    this.newGroupNameInput = page.locator(s.newGroupNameInput);
  }

  url(courseKey: string): string {
    return `${studioOrigin(this.config)}/group_configurations/${courseKey}`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.page.locator(STUDIO_GROUP_CONFIGURATIONS_SELECTORS.page).waitFor();
  }

  /**
   * Adds a content group with `name`: opens the form, fills the name, and submits,
   * waiting for the write the MFE posts. Returns the status of that write.
   */
  async addContentGroup(courseKey: string, name: string): Promise<{ status: number }> {
    await this.addContentGroupButton.click();
    await this.newGroupNameInput.fill(name);
    const create = this.page
      .locator(STUDIO_GROUP_CONFIGURATIONS_SELECTORS.createGroupButton)
      .last();
    const response = await waitForWrite(
      this.page,
      {
        method: ['POST', 'PATCH', 'PUT'],
        urlIncludes: `${GROUP_CONFIGURATIONS_WRITE_PATH}/${courseKey}`,
      },
      () => create.click(),
    );
    return { status: response.status() };
  }
}
