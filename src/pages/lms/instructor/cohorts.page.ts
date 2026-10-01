import type { Response } from '@playwright/test';

import { INSTRUCTOR_TAB_IDS } from '../../../config';
import { InstructorDashboardPage } from './dashboard.page';

/**
 * The Cohorts tab: turn cohorts on, add a cohort (its assignment method and
 * associated content group), and add learners to the cohort on show. Every
 * action returns the v1 cohorts request it fires (`/api/cohorts/v1/…`); the
 * spec reads the cohort back from that API.
 */
export class InstructorCohortsPage extends InstructorDashboardPage {
  async gotoTab(courseKey: string): Promise<void> {
    await this.waitForApi({ method: 'GET', urlIncludes: '/api/cohorts/v1/settings/' }, () =>
      this.goto(courseKey, INSTRUCTOR_TAB_IDS.cohorts),
    );
    await this.main.locator(this.s.cohortsPrimaryButton).first().waitFor();
  }

  /** "Enable Cohorts" (the tab's one primary button while cohorts are off). */
  async enableCohorts(): Promise<Response> {
    const response = await this.waitForApi(
      { method: 'PUT', urlIncludes: '/api/cohorts/v1/settings/' },
      () => this.main.locator(this.s.cohortsPrimaryButton).first().click(),
    );
    await this.main.locator(this.s.cohortPicker).waitFor();
    return response;
  }

  /**
   * "+ Add Cohort" → name, assignment method, and optionally "Select a Content
   * Group" with the group's id → Save. Returns the `POST …/cohorts/` response.
   */
  async addCohort(cohort: {
    readonly name: string;
    readonly assignment: 'random' | 'manual';
    readonly contentGroupId?: number;
  }): Promise<Response> {
    const form = this.main.locator(this.s.cohortForm);
    await this.main.locator(this.s.cohortPicker).waitFor();
    if (!(await form.isVisible())) {
      await this.main.locator(this.s.cohortsPrimaryButton).first().click();
    }
    await form.locator(this.s.cohortNameInput).first().fill(cohort.name);
    await form.locator(this.s.cohortAssignment(cohort.assignment)).check();
    if (cohort.contentGroupId !== undefined) {
      await form.locator(this.s.cohortContentGroupRadio).check();
      await form
        .locator(this.s.cohortContentGroupSelect)
        .selectOption(String(cohort.contentGroupId));
    }
    return this.waitForApi({ method: 'POST', urlIncludes: '/api/cohorts/v1/courses/' }, () =>
      form.locator(this.s.cohortFormSubmit).click(),
    );
  }

  /** Whether the add-cohort form (opened if it is not) lets "Manual" be chosen. */
  async manualAssignmentEnabled(): Promise<boolean> {
    const form = this.main.locator(this.s.cohortForm);
    if (!(await form.isVisible())) {
      await this.main.locator(this.s.cohortsPrimaryButton).first().click();
    }
    return form.locator(this.s.cohortAssignment('manual')).isEnabled();
  }

  /** Shows one cohort by its id, in the cohort picker. */
  async showCohort(cohortId: number): Promise<void> {
    await this.main.locator(this.s.cohortPicker).selectOption(String(cohortId));
  }

  /** Adds learners (usernames or e-mails) to the cohort on show; returns the request's response. */
  async addLearners(identifiers: readonly string[]): Promise<Response> {
    await this.main.locator(this.s.cohortLearnersInput).fill(identifiers.join(', '));
    return this.waitForApi({ method: 'POST', urlIncludes: '/cohorts/' }, () =>
      this.main.locator(this.s.cohortLearnersSubmit).click(),
    );
  }
}
