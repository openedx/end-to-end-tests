import type { Locator, Page } from '@playwright/test';

import { STUDIO_OUTLINE_SELECTORS, STUDIO_SHELL_SELECTORS, type AppConfig } from '../../config';
import { studioOrigin } from '../../api';

/**
 * A course's outline in the authoring MFE — where Studio lands after creating a
 * course, and the hub the course header links back to. Authoring the outline's
 * *content* is Epic 8; this object covers only what the Studio Home cases need:
 * that the outline for a given course rendered, and that it is empty.
 */
export class StudioCourseOutlinePage {
  readonly courseLockUp: Locator;
  readonly courseOrgNumber: Locator;
  readonly courseTitle: Locator;
  readonly emptyPlaceholder: Locator;
  readonly viewLiveLink: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.courseLockUp = page.locator(STUDIO_SHELL_SELECTORS.courseLockUp);
    this.courseOrgNumber = page.locator(STUDIO_SHELL_SELECTORS.courseOrgNumber);
    this.courseTitle = page.locator(STUDIO_SHELL_SELECTORS.courseTitle);
    this.emptyPlaceholder = page.locator(STUDIO_OUTLINE_SELECTORS.emptyPlaceholder);
    this.viewLiveLink = page.locator(STUDIO_OUTLINE_SELECTORS.viewLiveLink);
  }

  /** The Studio URL for a course; the platform redirects it to the MFE. */
  url(courseKey: string): string {
    return `${studioOrigin(this.config)}/course/${courseKey}`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.waitForCourse(courseKey);
  }

  /**
   * Waits until the outline for `courseKey` is on screen: the URL carries the key
   * and the header lock-up links back to this course. Used after an action
   * elsewhere (creating a course) navigates here.
   */
  async waitForCourse(courseKey: string): Promise<void> {
    await this.page.waitForURL((url) => url.pathname.includes(`/course/${courseKey}`));
    await this.courseLockUp.waitFor();
  }
}
