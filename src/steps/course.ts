import type { Page } from '@playwright/test';

import type { CourseDetail } from '../api';
import type { CatalogPage } from '../pages/lms/catalog/catalog.page';
import type { CourseAboutPage } from '../pages/lms/catalog/course-about.page';

/**
 * A search term that finds one specific course in the catalog.
 *
 * Uses the course **number** (e.g. `DemoX`) rather than its title: the number is
 * an identifier the platform never translates, whereas a title is localizable and
 * differs per installation. It also matches more narrowly — on a default install
 * the title's words ("Open", "Course") match unrelated courses too.
 */
export function catalogSearchTermFor(detail: CourseDetail): string {
  return detail.number;
}

/**
 * Enrolls the current learner by driving the catalog the way the BTR script does:
 * catalog → search → About page → Enroll.
 *
 * Specs that merely *need* an enrollment should use the `enrolledCourse` fixture,
 * which goes through the enrollment API. This step exists for the specs where the
 * enrollment journey itself is under test.
 */
export async function enrollThroughCatalog(
  catalogPage: CatalogPage,
  courseAboutPage: CourseAboutPage,
  courseKey: string,
  searchTerm: string,
): Promise<void> {
  await catalogPage.goto();
  await catalogPage.search(searchTerm);
  await catalogPage.openCourseAbout(courseKey);
  await courseAboutPage.enroll(courseKey);
}

/** Opens the course's About page directly and enrolls from it. */
export async function enrollFromAboutPage(
  courseAboutPage: CourseAboutPage,
  courseKey: string,
): Promise<void> {
  await courseAboutPage.goto(courseKey);
  await courseAboutPage.enroll(courseKey);
}

/** Navigates to the learner dashboard. */
export async function gotoDashboard(page: Page, lmsBaseUrl: string): Promise<void> {
  await page.goto(`${lmsBaseUrl}/dashboard`);
}
