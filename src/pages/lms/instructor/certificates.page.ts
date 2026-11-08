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
    // Either the tools render or the disabled alert does.
    await this.issuedTab.or(this.disabledAlert).first().waitFor();
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
   * "Regenerate Certificates" under the Granted Exceptions filter: opens the
   * generate modal, picks whether every learner with an exception or only those
   * without a certificate yet is generated, and confirms. Returns the `POST
   * certificates/regenerate` response, whose body carries the task id. Filter
   * to `granted_exceptions` first — under the other filters the button opens a
   * different confirm (and under All learners it does nothing).
   */
  async generateForExceptions(scope: 'all' | 'without_certificate'): Promise<Response> {
    await this.regenerateButton.click();
    await this.page.locator(this.s.generateCertificatesOption(scope)).check();
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
