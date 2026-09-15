import type { Locator } from '@playwright/test';

import { INSTRUCTOR_TAB_IDS } from '../../../config';
import { InstructorDashboardPage } from './dashboard.page';

/**
 * The Course Info tab: identifiers, the course status chip and the enrollment
 * counters. The numbers are the dashboard model's (`total_enrollment`,
 * `enrollment_counts`, …), which the spec reads from the API and compares to
 * what is rendered inside one `expect.poll`.
 */
export class InstructorCourseInfoPage extends InstructorDashboardPage {
  /** The org / course id / run spans of the course card. */
  get identifiers(): Locator {
    return this.main.locator(this.s.courseInfoIdentifiers);
  }

  /** The status chip; its Paragon variant follows `has_started` / `has_ended`. */
  get statusBadge(): Locator {
    return this.main.locator(this.s.courseStatusBadge);
  }

  get upcomingBadge(): Locator {
    return this.main.locator(this.s.courseStatusBadgeUpcoming);
  }

  get activeBadge(): Locator {
    return this.main.locator(this.s.courseStatusBadgeActive);
  }

  /** The enrollment counters, in the order rendered (all, staff, learners, one per mode). */
  get enrollmentCounters(): Locator {
    return this.main.locator(this.s.enrollmentCounter);
  }

  async gotoTab(courseKey: string): Promise<void> {
    await this.goto(courseKey, INSTRUCTOR_TAB_IDS.courseInfo);
    await this.enrollmentCounters.first().waitFor();
  }

  /**
   * The counter values as numbers, in rendered order. Digits only: the value is
   * the platform's number, its formatting is locale.
   */
  async counterValues(): Promise<number[]> {
    const texts = await this.enrollmentCounters
      .locator(this.s.enrollmentCounterValue)
      .allTextContents();
    return texts.map((text) => Number(text.replace(/[^\d]/g, '')));
  }
}
