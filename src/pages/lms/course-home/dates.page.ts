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

  /** The day whose heading shows this date, formatted as by {@link formatDay}. */
  dayOn(formattedDay: string): Locator {
    return this.days.filter({
      has: this.page.locator(DATES_SELECTORS.dayHeader, { hasText: formattedDay }),
    });
  }

  /**
   * An ISO instant as the timeline heads a day: weekday, short month, day and
   * year in the page's own language and the browser's time zone (a learner
   * with no time-zone preference, which is every learner the suite makes). The
   * expectation is computed in the page, so it tracks the page's locale rather
   * than the runner's.
   */
  async formatDay(iso: string): Promise<string> {
    return this.page.evaluate(
      (value) =>
        new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(new Date(value)),
      iso,
    );
  }

  /**
   * The status badges (completed, past due, due next) of the subsection's day:
   * none, one for the day, or more where its entries differ in state.
   */
  badgesOf(subsectionUsageKey: string): Locator {
    return this.dayOf(subsectionUsageKey).locator(DATES_SELECTORS.dayBadge);
  }
}
