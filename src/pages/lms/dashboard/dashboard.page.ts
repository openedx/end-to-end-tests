import type { Locator, Page } from '@playwright/test';

import { DASHBOARD_SELECTORS, dashboardCourseCardCta, type AppConfig } from '../../../config';

/**
 * The learner dashboard (`frontend-app-learner-dashboard`). Locators and
 * navigation only — specs own the assertions.
 *
 * Reached at the LMS `/dashboard` route, which redirects to the MFE, so that is
 * the URL a learner (and the header's "Courses" link) actually uses.
 */
export class DashboardPage {
  readonly content: Locator;
  readonly courseCards: Locator;
  readonly courseCardTitles: Locator;
  readonly courseCardBanners: Locator;
  readonly courseCardCta: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.content = page.locator(DASHBOARD_SELECTORS.content);
    this.courseCards = page.locator(DASHBOARD_SELECTORS.courseCard);
    this.courseCardTitles = page.locator(DASHBOARD_SELECTORS.courseCardTitle);
    this.courseCardBanners = page.locator(DASHBOARD_SELECTORS.courseCardBanners);
    this.courseCardCta = page.locator(dashboardCourseCardCta());
  }

  get url(): string {
    return `${this.config.baseUrls.lms}/dashboard`;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.content.waitFor();
  }

  /** The card for one course, anchored by the course key in its title link. */
  courseCard(courseKey: string): Locator {
    return this.courseCards.filter({
      has: this.page.locator(`a[href*="${courseKey}"]`),
    });
  }

  /** The course-name link on a course's card. */
  courseCardTitle(courseKey: string): Locator {
    return this.courseCard(courseKey).locator(DASHBOARD_SELECTORS.courseCardTitle);
  }

  /**
   * Follows the card's primary call to action into the course.
   *
   * The control is a link with `href="#"` whose navigation happens in JavaScript,
   * so waiting for the URL to change is the only reliable completion signal —
   * there is no href to predict and no load event to attach to.
   */
  async beginCourse(courseKey: string): Promise<void> {
    await this.courseCard(courseKey).locator(DASHBOARD_SELECTORS.courseCardCta).click();
    await this.page.waitForURL((url) => url.pathname.includes(courseKey));
  }
}
