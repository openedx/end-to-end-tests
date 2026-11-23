import type { Locator, Page } from '@playwright/test';

import {
  DATES_SELECTORS,
  datesAssignmentLink,
  datesTabLink,
  type AppConfig,
} from '../../../config';

/**
 * The course Dates tab in the learning MFE: a timeline of the course's fixed
 * dates and, where the course lists them, each assignment's due date.
 *
 * Locators and navigation only; the spec asserts, against the course-home dates
 * API.
 */
export class DatesPage {
  /** The timeline's days, in date order. */
  readonly days: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.days = page.locator(DATES_SELECTORS.day);
  }

  url(courseKey: string): string {
    return `${this.config.mfeUrls.learning}/course/${courseKey}/dates`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.days.first().waitFor();
  }

  /** Reaches the Dates tab from the course's tab bar, as a learner does. */
  async gotoViaCourseTab(courseKey: string): Promise<void> {
    await this.page.locator(datesTabLink(courseKey)).first().click();
    await this.page.waitForURL((url) => url.pathname.endsWith('/dates'));
    await this.days.first().waitFor();
  }

  /** The timeline entry for the subsection with this usage key: its name, linked to it. */
  assignmentLink(subsectionUsageKey: string): Locator {
    return this.days.locator(datesAssignmentLink(subsectionUsageKey));
  }

  /** The day the subsection's due date falls on. */
  dayOf(subsectionUsageKey: string): Locator {
    return this.days.filter({
      has: this.page.locator(datesAssignmentLink(subsectionUsageKey)),
    });
  }

  /** That day's status badge (completed, past due, due next), where it has one. */
  badgeOf(subsectionUsageKey: string): Locator {
    return this.dayOf(subsectionUsageKey).locator(DATES_SELECTORS.dayBadge);
  }
}
