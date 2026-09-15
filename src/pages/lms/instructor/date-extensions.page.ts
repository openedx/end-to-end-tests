import type { Locator, Response } from '@playwright/test';

import { INSTRUCTOR_TAB_IDS } from '../../../config';
import { InstructorDashboardPage } from './dashboard.page';

/**
 * The Date Extensions tab: grant an individual extension through its modal and
 * reset it from the table. Both actions return the request they fire
 * (`change_due_date`, legacy `reset_due_date`); the table lists what
 * `unit_extensions` returns.
 */
export class InstructorDateExtensionsPage extends InstructorDashboardPage {
  async gotoTab(courseKey: string): Promise<void> {
    await this.goto(courseKey, INSTRUCTOR_TAB_IDS.dateExtensions);
    await this.main.locator(this.s.dataTable).waitFor();
  }

  get addButton(): Locator {
    return this.main.locator(this.s.addExtensionButton).first();
  }

  /**
   * "+ Add Individual Extension" → modal: resolve the learner (Select fires
   * `learners/<id>`), pick the graded subsection by usage key, set the UTC date
   * and time, type a reason, submit. Returns the `change_due_date` response.
   */
  async addExtension(extension: {
    readonly emailOrUsername: string;
    readonly subsectionUsageKey: string;
    readonly due: Date;
    readonly reason: string;
  }): Promise<Response> {
    await this.addButton.click();
    await this.dialog.waitFor();

    await this.dialog.locator(this.s.extensionLearnerInput).fill(extension.emailOrUsername);
    await this.waitForApi({ method: 'GET', urlIncludes: '/learners/' }, () =>
      this.dialog
        .locator(this.s.extensionLearnerInput)
        .locator('..')
        .locator('..')
        .locator('button')
        .click(),
    );
    await this.dialog
      .locator(this.s.extensionSubsectionSelect)
      .selectOption(extension.subsectionUsageKey);

    const iso = extension.due.toISOString();
    await this.dialog.locator(this.s.extensionDateInput).fill(iso.slice(0, 10));
    await this.dialog.locator(this.s.extensionTimeInput).fill(iso.slice(11, 16));
    await this.dialog.locator(this.s.extensionReasonInput).fill(extension.reason);

    const response = await this.waitForApi(
      { method: 'POST', urlIncludes: '/change_due_date' },
      () => this.dialog.locator(this.s.dialogSubmitButton).click(),
    );
    await this.dialog.waitFor({ state: 'hidden' }).catch(() => undefined);
    return response;
  }

  /** The row's "Reset" → confirm → legacy `reset_due_date`. */
  async resetExtension(username: string): Promise<Response> {
    await this.rowFor(username).locator(this.s.rowResetExtensionButton).click();
    await this.dialog.waitFor();
    return this.waitForApi({ method: 'POST', urlIncludes: '/reset_due_date' }, () =>
      this.dialogConfirmButton().click(),
    );
  }

  /** Types into the username filter of the table's control bar. */
  async filterByUsername(username: string): Promise<void> {
    await this.waitForApi({ method: 'GET', urlIncludes: '/unit_extensions?' }, () =>
      this.main.locator(this.s.dataTableControlBar).locator('input').first().fill(username),
    );
  }
}
