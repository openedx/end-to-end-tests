import type { Locator, Page, Response } from '@playwright/test';

import { INSTRUCTOR_TAB_IDS } from '../../../config';
import { InstructorDashboardPage } from './dashboard.page';

/**
 * Action-card positions on the Grading tab (labels are localized). Single
 * learner: Reset Attempts, Rescore Submission, Override Score, Delete History,
 * Task Status. All learners: Reset Attempts, Rescore Submission, Task Status.
 */
const SINGLE = { reset: 0, rescore: 1, override: 2, deleteHistory: 3, taskStatus: 4 } as const;
const ALL = { reset: 0, rescore: 1, taskStatus: 2 } as const;

/**
 * The Grading tab: pick a learner and a problem, then reset / rescore / override
 * / delete, each confirmed in a dialog and answered by a grading request the
 * page object returns. The learner and problem fields carry the MFE's only test
 * ids; their readings (`learners/<id>`, `problems/<key>`) are the spec's.
 */
export class InstructorGradingPage extends InstructorDashboardPage {
  async gotoTab(courseKey: string): Promise<void> {
    await this.goto(courseKey, INSTRUCTOR_TAB_IDS.grading);
    await this.main.locator(this.s.gradingScopeGroup).waitFor();
  }

  /** "Single Learner" (0) / "All Learners" (1). */
  async selectScope(scope: 'single' | 'all'): Promise<void> {
    await this.page
      .locator(this.s.gradingScopeGroup)
      .locator('button')
      .nth(scope === 'single' ? 0 : 1)
      .click();
  }

  get learnerField(): Locator {
    return this.main.locator(this.s.learnerField);
  }

  get problemField(): Locator {
    return this.main.locator(this.s.problemField);
  }

  /** Inline error under the learner or problem field ("Could not find …"). */
  get fieldError(): Locator {
    return this.main.locator(this.s.fieldError);
  }

  /** Types a username / e-mail and presses Select; returns `GET learners/<id>`. */
  async specifyLearner(emailOrUsername: string): Promise<Response> {
    await this.learnerField.locator(this.s.learnerInput).fill(emailOrUsername);
    return this.waitForApi({ method: 'GET', urlIncludes: '/learners/' }, () =>
      this.learnerField.locator(this.s.fieldSelectButton).click(),
    );
  }

  /** Types a problem usage key and presses Select; returns `GET problems/<key>`. */
  async specifyProblem(usageKey: string): Promise<Response> {
    await this.problemField.locator(this.s.problemInput).fill(usageKey);
    return this.waitForApi({ method: 'GET', urlIncludes: '/problems/' }, () =>
      this.problemField.locator(this.s.fieldSelectButton).click(),
    );
  }

  private card(index: number): Locator {
    return this.main.locator(this.s.actionCard).nth(index);
  }

  private async confirmAction(
    button: Locator,
    match: { method: string; urlIncludes: string },
  ): Promise<Response> {
    await button.click();
    await this.dialog.waitFor();
    return this.waitForApi(match, () => this.dialogConfirmButton().click());
  }

  /** "Reset Attempts to Zero" for the selected learner (`…/grading/attempts/reset?learner=`). */
  async resetAttempts(): Promise<Response> {
    return this.confirmAction(this.card(SINGLE.reset).locator(this.s.actionCardButton), {
      method: 'POST',
      urlIncludes: '/grading/attempts/reset',
    });
  }

  /** "Rescore Learner's Submission" (0) or "Rescore Only if Score Improves" (1). */
  async rescore(options: { readonly onlyIfHigher?: boolean } = {}): Promise<Response> {
    return this.confirmAction(
      this.card(SINGLE.rescore)
        .locator(this.s.actionCardButton)
        .nth(options.onlyIfHigher ? 1 : 0),
      { method: 'POST', urlIncludes: '/grading/scores/rescore' },
    );
  }

  /** Types the new score and presses "Override Learner's Score" (`PUT …/grading/scores`). */
  async overrideScore(score: number): Promise<Response> {
    const card = this.card(SINGLE.override);
    await card.locator(this.s.overrideScoreInput).fill(String(score));
    return this.confirmAction(card.locator(this.s.actionCardButton), {
      method: 'PUT',
      urlIncludes: '/grading/scores',
    });
  }

  /** "Delete Learner's State" (`DELETE …/grading/state`). */
  async deleteHistory(): Promise<Response> {
    return this.confirmAction(this.card(SINGLE.deleteHistory).locator(this.s.actionCardButton), {
      method: 'DELETE',
      urlIncludes: '/grading/state',
    });
  }

  /** All-learners scope: "Reset Attempts to Zero" for everyone (queues a task). */
  async resetAllAttempts(): Promise<Response> {
    return this.confirmAction(this.card(ALL.reset).locator(this.s.actionCardButton), {
      method: 'POST',
      urlIncludes: '/grading/attempts/reset',
    });
  }

  /** All-learners scope: rescore everyone (0) or only where the score improves (1). */
  async rescoreAll(options: { readonly onlyIfHigher?: boolean } = {}): Promise<Response> {
    return this.confirmAction(
      this.card(ALL.rescore)
        .locator(this.s.actionCardButton)
        .nth(options.onlyIfHigher ? 1 : 0),
      { method: 'POST', urlIncludes: '/grading/scores/rescore' },
    );
  }

  get gradebookLink(): Locator {
    return this.main.locator(this.s.gradebookLink);
  }

  get studioGradingLink(): Locator {
    return this.main.locator(this.s.studioGradingLink);
  }

  /** "View Gradebook" opens the gradebook MFE; returns that page (same or new tab). */
  async viewGradebook(): Promise<Page> {
    return this.followLink(this.gradebookLink);
  }

  /** Overflow → "View Course Grading Settings" is a plain link; follows it and returns the new tab. */
  async viewStudioGradingSettings(): Promise<Page> {
    await this.main.locator(this.s.gradebookLink).locator('..').locator('button').click();
    return this.followLink(this.main.locator(this.s.studioGradingLink));
  }

  /**
   * Overflow → "View Grading Configuration" opens a modal showing the grader
   * dump the tab already fetched (`GET grading-config` fires on load, not on
   * open), so this only waits for the dialog.
   */
  async openGradingConfiguration(): Promise<void> {
    await this.gradingOverflowToggle().click();
    await this.openMenuItems().first().click();
    await this.dialog.waitFor();
  }

  /** The overflow dropdown's toggle in the header row beside "View Gradebook". */
  private gradingOverflowToggle(): Locator {
    return this.gradebookLink.locator('..').locator('button');
  }

  private async followLink(link: Locator): Promise<Page> {
    const target = await link.getAttribute('target');
    if (target === '_blank') {
      const [popup] = await Promise.all([this.page.context().waitForEvent('page'), link.click()]);
      await popup.waitForLoadState('domcontentloaded');
      return popup;
    }
    // Same tab: wait for the URL to leave this page, not just for a load state.
    // Where the target lives in the same app (the frontend-base shell on `main`
    // bundles the gradebook with the dashboard) the router changes route without
    // loading a document, so the load state is already reached and would return
    // before the URL updates.
    const from = this.page.url();
    await link.click();
    await this.page.waitForURL((url) => url.href !== from);
    await this.page.waitForLoadState('domcontentloaded');
    return this.page;
  }
}
