import type { Locator, Response } from '@playwright/test';

import { INSTRUCTOR_TAB_IDS } from '../../../config';
import { InstructorDashboardPage } from './dashboard.page';

/** One allowance, as the Add Allowance modal takes it. */
export interface AllowanceInput {
  readonly learner: string;
  readonly examType: 'timed' | 'proctored';
  readonly examId: number;
  readonly type: 'additional_time_granted' | 'time_multiplier' | 'review_policy_exception';
  readonly value: string;
}

/**
 * The Special Exams tab's Allowances view: add an allowance through its modal,
 * and edit or delete one from its row's actions. Every action returns the v2
 * `special_exams` request it fires; those answer 200 with a per-row `success`,
 * so the spec reads the allowances back from the API.
 */
export class InstructorSpecialExamsPage extends InstructorDashboardPage {
  async gotoAllowances(courseKey: string): Promise<void> {
    await this.goto(courseKey, INSTRUCTOR_TAB_IDS.specialExams);
    await this.waitForApi({ method: 'GET', urlIncludes: '/special_exams/allowances' }, () =>
      this.main.locator(this.s.specialExamsViewToggle).nth(1).click(),
    );
  }

  /** "Add Allowance" → learners, exam type, the exam, allowance type and value → create. */
  async addAllowance(allowance: AllowanceInput): Promise<Response> {
    await this.main.locator(this.s.addAllowanceButton).click();
    await this.dialog.waitFor();
    await this.dialog.locator(this.s.allowanceLearners).fill(allowance.learner);
    await this.dialog.locator(this.s.allowanceExamType).selectOption(allowance.examType);
    await this.dialog.locator(this.s.allowanceExam(allowance.examId)).check();
    await this.dialog.locator(this.s.allowanceType).selectOption(allowance.type);
    await this.dialog.locator(this.s.allowanceValue).fill(allowance.value);
    return this.submitDialog('POST', '/special_exams/allowances');
  }

  /** The row's actions → Edit → a new value → save. */
  async editAllowance(learner: string, value: string): Promise<Response> {
    await this.openRowMenu(learner);
    await this.page.locator(this.s.allowanceMenuItem).nth(0).click();
    await this.dialog.waitFor();
    await this.dialog.locator(this.s.allowanceValue).fill(value);
    return this.submitDialog('POST', '/special_exams/allowances');
  }

  /** The row's actions → Delete → confirm. */
  async deleteAllowance(learner: string): Promise<Response> {
    await this.openRowMenu(learner);
    await this.page.locator(this.s.allowanceMenuItem).nth(1).click();
    await this.dialog.waitFor();
    const response = await this.waitForApi({ method: 'DELETE', urlIncludes: '/allowance' }, () =>
      this.dialog.locator(this.s.allowanceDeleteConfirm).last().click(),
    );
    await this.dialog.waitFor({ state: 'hidden' }).catch(() => undefined);
    return response;
  }

  /** A learner's row in the allowances table (the username is the test's own). */
  allowanceRow(learner: string): Locator {
    return this.main.locator('table tbody tr').filter({ hasText: learner });
  }

  private async openRowMenu(learner: string): Promise<void> {
    await this.allowanceRow(learner).locator(this.s.allowanceRowActions).last().click();
    await this.page.locator(this.s.allowanceMenuItem).first().waitFor();
  }

  private async submitDialog(method: 'POST', urlIncludes: string): Promise<Response> {
    const response = await this.waitForApi({ method, urlIncludes }, () =>
      this.dialog.locator(this.s.dialogSubmitButton).click(),
    );
    await this.dialog.waitFor({ state: 'hidden' }).catch(() => undefined);
    return response;
  }
}
