import type { Locator, Page } from '@playwright/test';

import { STUDIO_GROUP_CONFIGURATIONS_SELECTORS, type AppConfig } from '../../../config';
import { GROUP_CONFIGURATIONS_WRITE_PATH, studioOrigin } from '../../../api';
import { waitForWrite } from '../wait-for-write';

/**
 * Group Configurations in the authoring MFE (`/group_configurations/<key>` on
 * Studio, redirected to the MFE). Covers content groups and experiment-group
 * configurations. Locators and single-surface actions; the spec asserts, against
 * `fetchGroupConfigurations`.
 */
export class StudioGroupConfigurationsPage {
  readonly page: Page;
  readonly contentGroupCards: Locator;
  readonly addContentGroupButton: Locator;
  readonly newGroupNameInput: Locator;
  /** The sections of the main column, in page order. */
  readonly sections: Locator;
  readonly experimentForm: Locator;

  constructor(
    page: Page,
    private readonly config: AppConfig,
  ) {
    this.page = page;
    const s = STUDIO_GROUP_CONFIGURATIONS_SELECTORS;
    this.contentGroupCards = page.locator(s.contentGroupCard);
    this.addContentGroupButton = page.locator(s.addContentGroupButton).first();
    this.newGroupNameInput = page.locator(s.newGroupNameInput);
    this.sections = page.locator(s.section);
    this.experimentForm = page.locator(s.experimentForm);
  }

  url(courseKey: string): string {
    return `${studioOrigin(this.config)}/group_configurations/${courseKey}`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.page.locator(STUDIO_GROUP_CONFIGURATIONS_SELECTORS.page).waitFor();
  }

  /**
   * How many sections the main column shows. Read once the column has replaced
   * the loading spinner: every section is rendered with it.
   */
  async sectionCount(): Promise<number> {
    await this.page.locator(STUDIO_GROUP_CONFIGURATIONS_SELECTORS.mainColumn).waitFor();
    return this.sections.count();
  }

  /**
   * The experiment-groups section. The MFE renders it after every other section,
   * and only for a course with content experiments enabled — so on a course
   * without them this is the content-groups section, and a spec tells the two
   * apart by the section count.
   */
  experimentSection(): Locator {
    return this.sections.last();
  }

  /** The experiment-group configuration cards. */
  experimentCards(): Locator {
    return this.experimentSection().locator(STUDIO_GROUP_CONFIGURATIONS_SELECTORS.experimentCard);
  }

  /**
   * Creates an experiment-group configuration named `name` with the form's default
   * two groups: opens the form from the experiment section, fills the name and
   * submits, waiting for the write the MFE posts. Returns the status of that write.
   */
  async addExperimentConfiguration(courseKey: string, name: string): Promise<{ status: number }> {
    const s = STUDIO_GROUP_CONFIGURATIONS_SELECTORS;
    await this.experimentSection().locator(s.sectionAddButton).first().click();
    await this.experimentForm.waitFor();
    await this.page.locator(s.experimentNameInput).fill(name);
    const response = await waitForWrite(
      this.page,
      {
        method: ['POST', 'PATCH', 'PUT'],
        urlIncludes: `${GROUP_CONFIGURATIONS_WRITE_PATH}/${courseKey}`,
      },
      () => this.page.locator(s.experimentCreateButton).click(),
    );
    return { status: response.status() };
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
