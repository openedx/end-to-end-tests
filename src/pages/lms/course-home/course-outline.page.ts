import type { Locator, Page } from '@playwright/test';

import { COURSE_HOME_SELECTORS, type AppConfig } from '../../../config';

/**
 * Course home: the outline tab a learner lands on. Locators and single-surface
 * actions only — specs own the assertions.
 */
export class CourseOutlinePage {
  readonly sectionTriggers: Locator;
  readonly expandedSectionTriggers: Locator;
  readonly expandAllToggle: Locator;
  readonly startResumeCard: Locator;
  readonly welcomeAlert: Locator;
  readonly tourDialog: Locator;
  readonly modalBackdrop: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.sectionTriggers = page.locator(COURSE_HOME_SELECTORS.sectionTrigger);
    this.expandedSectionTriggers = page.locator(COURSE_HOME_SELECTORS.expandedSectionTrigger);
    this.expandAllToggle = page.locator(COURSE_HOME_SELECTORS.expandAllToggle);
    this.startResumeCard = page.locator(COURSE_HOME_SELECTORS.startResumeCard);
    this.welcomeAlert = page.locator(COURSE_HOME_SELECTORS.welcomeAlert);
    this.tourDialog = page.locator(COURSE_HOME_SELECTORS.tourDialog);
    this.modalBackdrop = page.locator(COURSE_HOME_SELECTORS.modalBackdrop);
  }

  url(courseKey: string): string {
    return `${this.config.baseUrls.apps}/learning/course/${courseKey}/home`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.sectionTriggers.first().waitFor();
  }

  /**
   * Dismisses the first-visit tour modal if it is showing.
   *
   * Escape rather than a button: the modal's two footer buttons are told apart
   * only by Paragon variant classes and their labels, whereas Escape is the
   * platform's own dismissal for a Paragon modal and is the same in every
   * language. Waiting for the backdrop to go is what makes the rest of the page
   * clickable — this is the modal the source suite worked around with
   * `force: true`.
   */
  async dismissTourDialog(): Promise<void> {
    // The modal mounts *after* the outline first renders, so testing for it the
    // moment the page arrives finds nothing and leaves it to appear later and
    // swallow the next click. Waiting for the page's own network activity to
    // settle is what makes its presence decidable.
    await this.page.waitForLoadState('networkidle');
    if ((await this.tourDialog.count()) === 0) {
      return;
    }
    await this.page.keyboard.press('Escape');
    await this.tourDialog.waitFor({ state: 'detached' });
    await this.modalBackdrop.waitFor({ state: 'detached' });
  }

  /**
   * Toggles every outline section open or closed with the one control.
   *
   * Waits the modal backdrop out first: it covers the whole page while the
   * first-visit modal is up, and a click aimed at the outline lands on it instead.
   */
  async toggleAllSections(): Promise<void> {
    await this.modalBackdrop.waitFor({ state: 'detached' });
    await this.expandAllToggle.click();
  }
}
