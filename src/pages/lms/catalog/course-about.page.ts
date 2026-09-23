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
  readonly shareTwitter: Locator;
  readonly shareFacebook: Locator;
  readonly shareEmail: Locator;
  readonly mediaImage: Locator;
  readonly introVideoButton: Locator;
  readonly introVideoFrame: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.enrollButton = page.locator(COURSE_ABOUT_SELECTORS.enrollButton);
    this.detailsItemLabels = page.locator(COURSE_ABOUT_SELECTORS.detailsItemLabel);
    this.detailsItemValues = page.locator(COURSE_ABOUT_SELECTORS.detailsItemValue);
    this.shareTwitter = page.locator(COURSE_ABOUT_SELECTORS.shareTwitter);
    this.shareFacebook = page.locator(COURSE_ABOUT_SELECTORS.shareFacebook);
    this.shareEmail = page.locator(COURSE_ABOUT_SELECTORS.shareEmail);
    this.mediaImage = page.locator(COURSE_ABOUT_SELECTORS.mediaImage);
    this.introVideoButton = page.locator(COURSE_ABOUT_SELECTORS.introVideoButton);
    this.introVideoFrame = page.locator(COURSE_ABOUT_SELECTORS.introVideoFrame);
  }

  url(courseKey: string): string {
    return `${this.config.baseUrls.apps}/catalog/courses/${courseKey}/about`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
  }

  /**
   * Opens the page and waits for the course data the MFE renders it from
   * (`GET /api/courseware/course/<key>`), so what follows reads a rendered page.
   */
  async gotoRendered(courseKey: string): Promise<void> {
    const loaded = this.page.waitForResponse(
      (response) =>
        response.url().startsWith(`${this.config.baseUrls.lms}/api/courseware/course/`) &&
        response.ok(),
    );
    await this.goto(courseKey);
    await loaded;
    await this.detailsItemValues.first().waitFor();
  }

  /**
   * An ISO date as the page formats dates — the short month-day-year form in
   * the page's own language and the browser's time zone, which is how the
   * catalog renders "Classes start". The expectation is computed here, in the
   * page, so it tracks the page's locale rather than the runner's.
   */
  async formatShortDate(iso: string): Promise<string> {
    return this.page.evaluate(
      (value) =>
        new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(new Date(value)),
      iso,
    );
  }

  /** Whether the course image actually loaded (a broken image reads `false`). */
  async mediaImageLoaded(): Promise<boolean> {
    return this.mediaImage.evaluate(
      (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
    );
  }

  /** Presses the intro-video play button and returns the player's embed URL. */
  async openIntroVideo(): Promise<string> {
    await this.introVideoButton.click();
    await this.introVideoFrame.waitFor({ state: 'attached' });
    return new URL((await this.introVideoFrame.getAttribute('src')) ?? '', 'https:').toString();
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
