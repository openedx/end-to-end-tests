import type { Locator, Page } from '@playwright/test';

import { COURSE_ABOUT_SELECTORS, courseAboutCoursewareLink, type AppConfig } from '../../../config';

/**
 * A course's About page in the catalog MFE. Locators and single-surface actions
 * only — specs own the assertions.
 */
export class CourseAboutPage {
  readonly enrollButton: Locator;
  readonly detailsItemLabels: Locator;
  readonly detailsItemValues: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.enrollButton = page.locator(COURSE_ABOUT_SELECTORS.enrollButton);
    this.detailsItemLabels = page.locator(COURSE_ABOUT_SELECTORS.detailsItemLabel);
    this.detailsItemValues = page.locator(COURSE_ABOUT_SELECTORS.detailsItemValue);
  }

  url(courseKey: string): string {
    return `${this.config.baseUrls.apps}/catalog/courses/${courseKey}/about`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
  }

  /**
   * The courseware link that replaces the enroll call to action once the learner
   * is enrolled — the enrolled state, expressed structurally. Read it on the About
   * page: dashboard course cards link to the same href.
   */
  coursewareLink(courseKey: string): Locator {
    return this.page.locator(courseAboutCoursewareLink(courseKey));
  }

  /**
   * Clicks Enroll and waits for the enrollment to have been acted on.
   *
   * The MFE enrolls through the enrollment API and then sends the learner on to
   * the dashboard, so leaving the About route is the completion signal. Callers
   * that want to see the enrolled state on this page navigate back to it; the
   * authoritative check is the enrollment API, not either rendering.
   */
  async enroll(courseKey: string): Promise<void> {
    await this.enrollButton.click();
    await this.page.waitForURL((url) => !url.pathname.includes(`/${courseKey}/about`));
  }
}
