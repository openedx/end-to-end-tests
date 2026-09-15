import type { Locator, Response } from '@playwright/test';

import { INSTRUCTOR_TAB_IDS } from '../../../config';
import { InstructorDashboardPage } from './dashboard.page';

/** The "Enroll Learners" / "Add Beta Testers" modal, open. */
export class EnrollmentModal {
  constructor(
    private readonly owner: InstructorEnrollmentsPage,
    private readonly dialog: Locator,
    private readonly textarea: Locator,
    private readonly checkboxes: Locator,
    private readonly submitButton: Locator,
    private readonly submitUrlFragment: string,
  ) {}

  /** Usernames and/or e-mail addresses, one per line. */
  async fillIdentifiers(identifiers: readonly string[]): Promise<void> {
    await this.textarea.fill(identifiers.join('\n'));
  }

  /** "Auto Enroll" — the first checkbox, checked by default. */
  async setAutoEnroll(on: boolean): Promise<void> {
    await this.checkboxes.nth(0).setChecked(on);
  }

  /** "Notify Users by Email" — the second checkbox, checked by default. */
  async setNotifyByEmail(on: boolean): Promise<void> {
    await this.checkboxes.nth(1).setChecked(on);
  }

  /** Presses Save and returns the `…/modify` response it fires. */
  async submit(): Promise<Response> {
    const response = await this.owner.waitForApi(
      { method: 'POST', urlIncludes: this.submitUrlFragment },
      () => this.submitButton.click(),
    );
    await this.dialog.waitFor({ state: 'hidden' }).catch(() => undefined);
    return response;
  }
}

/**
 * The Enrollments tab: bulk enroll, beta testers, the enrollment-status check
 * and the enrollment table. Every action returns the API response the MFE
 * fires, so the spec judges the per-identifier `results` itself.
 */
export class InstructorEnrollmentsPage extends InstructorDashboardPage {
  async gotoTab(courseKey: string): Promise<void> {
    await this.goto(courseKey, INSTRUCTOR_TAB_IDS.enrollments);
    await this.main.locator(this.s.dataTable).waitFor();
  }

  private async openModal(button: Locator, submitUrlFragment: string): Promise<EnrollmentModal> {
    await button.click();
    await this.dialog.waitFor();
    return new EnrollmentModal(
      this,
      this.dialog,
      this.dialog.locator(this.s.identifiersTextarea),
      this.dialog.locator(this.s.modalCheckbox),
      this.dialogConfirmButton(),
      submitUrlFragment,
    );
  }

  /** "+ Enroll Learners" → its modal (submits `enrollments/modify`). */
  async openEnrollLearners(): Promise<EnrollmentModal> {
    return this.openModal(
      this.main.locator(this.s.enrollLearnersButton).first(),
      '/enrollments/modify',
    );
  }

  /** "+ Add Beta Testers" → its modal (submits `beta_testers/modify`). */
  async openAddBetaTesters(): Promise<EnrollmentModal> {
    return this.openModal(
      this.main.locator(this.s.addBetaTestersButton).first(),
      '/beta_testers/modify',
    );
  }

  /**
   * Overflow menu → "Check Enrollment Status" → the modal; types the identifier
   * and presses Check, returning the legacy `get_student_enrollment_status`
   * response. The modal shows a localized sentence, which is not asserted.
   */
  async checkEnrollmentStatus(identifier: string): Promise<Response> {
    await this.main.locator(this.s.checkEnrollmentStatusMenu).click();
    await this.openMenuItems().first().click();
    await this.dialog.waitFor();
    await this.dialog.locator(this.s.statusModalInput).fill(identifier);
    const response = await this.waitForApi(
      { method: 'POST', urlIncludes: '/get_student_enrollment_status' },
      () => this.dialog.locator(this.s.statusModalCheckButton).click(),
    );
    return response;
  }

  /** Filters the table by beta-tester status (`select[name=isBetaTester]`). */
  async filterBetaTesters(value: 'true' | 'false' | ''): Promise<void> {
    await this.waitForApi({ method: 'GET', urlIncludes: '/enrollments?' }, () =>
      this.main.locator(this.s.betaTesterFilter).selectOption(value),
    );
  }

  /**
   * The row's overflow menu has one item — "Grant Beta Tester Role" or "Remove
   * Beta Tester Role" depending on the row. Clicking it (and confirming the
   * removal dialog when one opens) fires `beta_testers/modify`.
   */
  async toggleBetaTester(username: string): Promise<Response> {
    const row = this.rowFor(username);
    await row.locator(this.s.rowBetaTesterMenuButton).click();
    await this.page.locator(this.s.rowMenuPopover).first().click();
    return this.waitForApi({ method: 'POST', urlIncludes: '/beta_testers/modify' }, async () => {
      // Granting is immediate; removing asks for confirmation first.
      if (await this.dialog.count()) await this.dialogConfirmButton().click();
    });
  }

  /** The row's "Unenroll" → confirm → `enrollments/modify`. */
  async unenroll(username: string): Promise<Response> {
    await this.rowFor(username).locator(this.s.rowUnenrollButton).click();
    await this.dialog.waitFor();
    return this.waitForApi({ method: 'POST', urlIncludes: '/enrollments/modify' }, () =>
      this.dialogConfirmButton().click(),
    );
  }
}
