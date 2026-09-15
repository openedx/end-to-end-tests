import type { Locator, Response } from '@playwright/test';

import {
  INSTRUCTOR_CERTIFICATE_FILTERS,
  INSTRUCTOR_TAB_IDS,
  type AppConfig,
} from '../../../config';
import type { IssuedCertificateFilter } from '../../../api';
import { InstructorDashboardPage } from './dashboard.page';
import type { Page } from '@playwright/test';

/** Header buttons, in order: "Invalidate Certificate", "Grant Exception(s)". */
const HEADER = { invalidate: 0, grantException: 1 } as const;

/**
 * The Certificates tab: the platform-disabled alert, the issued-certificates
 * table with its filter, and the grant-exception / regenerate / invalidate
 * actions. Each write returns the certificate request it fires; the spec reads
 * `certificates/issued` and the learner's own `progress.certificate_data`.
 */
export class InstructorCertificatesPage extends InstructorDashboardPage {
  constructor(page: Page, config: AppConfig) {
    super(page, config);
  }

  async gotoTab(courseKey: string): Promise<void> {
    await this.goto(courseKey, INSTRUCTOR_TAB_IDS.certificates);
    // Either the tools render (issued-certificates request) or the disabled alert.
    await Promise.race([this.issuedTab.waitFor(), this.disabledAlert.waitFor()]);
  }

  /** Shown instead of the tools while platform-wide generation is off. */
  get disabledAlert(): Locator {
    return this.main.locator(this.s.certificatesDisabledAlert);
  }

  get issuedTab(): Locator {
    return this.main.locator(this.s.issuedTab);
  }

  get historyTab(): Locator {
    return this.main.locator(this.s.historyTab);
  }

  get regenerateButton(): Locator {
    return this.main.locator(this.s.regenerateButton);
  }

  /**
   * Overflow → "Student Generated Certificates" → sets the course toggle and
   * saves. Save posts `certificates/toggle_generation` only when the state
   * changed, so the response is `undefined` when it was already `on`.
   */
  async setStudentGeneratedCertificates(on: boolean): Promise<Response | undefined> {
    await this.main.locator(this.s.certificatesMoreMenu).click();
    await this.openMenuItems().first().click();
    await this.dialog.waitFor();
    const checkbox = this.dialog.locator(this.s.studentGeneratedCheckbox);
    const changed = (await checkbox.isChecked()) !== on;
    await checkbox.setChecked(on);
    if (!changed) {
      await this.closeDialog();
      return undefined;
    }
    const response = await this.waitForApi(
      { method: 'POST', urlIncludes: '/certificates/toggle_generation' },
      () => this.dialogConfirmButton().click(),
    );
    await this.dialog.waitFor({ state: 'hidden' }).catch(() => undefined);
    return response;
  }

  /**
   * "Grant Exception(s)" → Individual tab → learner + notes → submit. Returns
   * the `POST certificates/exceptions` response.
   */
  async grantException(learner: string, notes: string): Promise<Response> {
    await this.main.locator(this.s.certificatesHeaderButton).nth(HEADER.grantException).click();
    const modal = this.page.locator(this.s.grantExceptionsModal);
    await modal.waitFor();
    await this.page.locator(this.s.grantExceptionsIndividualTab).click();
    await modal.locator('input.form-control').first().fill(learner);
    await modal.locator('textarea').first().fill(notes);
    const response = await this.waitForApi(
      { method: 'POST', urlIncludes: '/certificates/exceptions' },
      () => modal.locator(this.s.dialogPrimaryButton).last().click(),
    );
    await modal.waitFor({ state: 'hidden' }).catch(() => undefined);
    return response;
  }

  /**
   * "Invalidate Certificate" → learner + notes → submit (`POST
   * certificates/invalidations`). The modal closes on success; when the
   * platform reports a failed learner (no certificate to invalidate) it stays
   * open showing the error — read the response, then {@link closeDialog}.
   */
  async invalidate(learner: string, notes: string): Promise<Response> {
    await this.main.locator(this.s.certificatesHeaderButton).nth(HEADER.invalidate).click();
    const modal = this.page.locator(this.s.invalidateModal);
    await modal.waitFor();
    await modal.locator('input.form-control').first().fill(learner);
    await modal.locator('textarea').first().fill(notes);
    const response = await this.waitForApi(
      { method: 'POST', urlIncludes: '/certificates/invalidations' },
      () => modal.locator(this.s.dialogPrimaryButton).last().click(),
    );
    await modal.waitFor({ state: 'hidden' }).catch(() => undefined);
    return response;
  }

  /**
   * "Regenerate Certificates" → its modal → confirm. The modal offers the
   * student set / statuses; the default confirms what the filter shows.
   * Returns the `POST certificates/regenerate` response (carries `task_id`).
   */
  async regenerate(): Promise<Response> {
    await this.regenerateButton.click();
    await this.dialog.waitFor();
    return this.waitForApi({ method: 'POST', urlIncludes: '/certificates/regenerate' }, () =>
      this.dialogConfirmButton().click(),
    );
  }

  /** Picks a filter by its API value (items are in `INSTRUCTOR_CERTIFICATE_FILTERS` order). */
  async filter(value: IssuedCertificateFilter): Promise<Response> {
    const index = INSTRUCTOR_CERTIFICATE_FILTERS.indexOf(value);
    await this.main.locator(this.s.certificatesFilterDropdown).click();
    return this.waitForApi(
      {
        method: 'GET',
        urlIncludes: `/certificates/issued?`,
        predicate: (r) => r.url().includes(`filter=${value}`),
      },
      () => this.openMenuItems().nth(index).click(),
    );
  }

  /** Types into the username / e-mail search field. */
  async search(text: string): Promise<Response> {
    return this.waitForApi(
      {
        method: 'GET',
        urlIncludes: '/certificates/issued?',
        predicate: (r) => r.url().includes(`search=${encodeURIComponent(text)}`),
      },
      () => this.main.locator(this.s.certificatesSearchInput).fill(text),
    );
  }
}
