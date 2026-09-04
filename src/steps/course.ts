import type { CourseDetail } from '../api';
import type { AppConfig } from '../config';
import type { CatalogPage } from '../pages/lms/catalog/catalog.page';

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
 * Opens the catalog and brings one course's result card on screen, by whichever
 * route the installation offers.
 *
 * The catalog MFE renders a search field only where the LMS enables course
 * discovery (`settings.ENABLE_COURSE_DISCOVERY`, declared to the suite as the
 * `catalog-search` capability). With it off — the default — the catalog is a
 * plain paginated list, and paging through it is the only way a learner reaches a
 * given course. Every spec that needs to *get to* a course goes through here, so
 * it exercises the discovery journey the target actually has; the specs that put
 * search itself under test are tagged `@catalog-search` and skip where it is off,
 * so a target that declares the capability without rendering the field fails
 * them rather than silently losing the coverage.
 *
 * @throws {Error} when the course is in neither the search results nor any page
 * of the catalog. That is a target-data problem rather than a failed assertion,
 * so it is reported as one, with the route that was taken.
 */
export async function locateCourseInCatalog(
  catalogPage: CatalogPage,
  config: AppConfig,
  courseKey: string,
  searchTerm: string,
): Promise<void> {
  await catalogPage.goto();

  if (config.capabilities.has('catalog-search')) {
    await catalogPage.search(searchTerm);
    return;
  }

  if (!(await catalogPage.pageToCourseCard(courseKey))) {
    throw new Error(
      `Course "${courseKey}" is not listed on any page of the catalog. This installation ` +
        'does not declare the catalog-search capability, so the course was looked for by ' +
        'paging the whole list; check the course is published and its enrollment window ' +
        'makes it visible in the catalog.',
    );
  }
}
