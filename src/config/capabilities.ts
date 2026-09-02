/**
 * Capability declaration schema.
 *
 * Installations differ in which features are enabled, so optional coverage is
 * gated behind an explicit capability declaration (ADR-0002, "Runnable by any
 * provider against their own installation"). A provider turns capabilities on or
 * off in configuration to match their installation; specs tagged with a
 * capability run only when it is declared.
 */

/**
 * Coarse capabilities that gate optional spec coverage. Each corresponds to a
 * Playwright tag (e.g. `@discussions`). Extend this list as new capability-gated
 * coverage is added; the companion `CONVENTIONS.md` is authoritative on the tag
 * vocabulary.
 */
export const CAPABILITIES = [
  'discussions',
  'teams',
  'certificates',
  'notes',
  'wiki',
  'badges',
  'credly-badges',
  'cohorts',
  'content-libraries',
  // The learning MFE's in-course outline sidebar, behind the
  // `courseware.enable_navigation_sidebar` waffle flag. Its counterpart covers the
  // installations that keep the older in-course navigation instead.
  'courseware-navigation-sidebar',
  'courseware-legacy-navigation',
  // Search and filtering in the catalog MFE, gated on the LMS's top-level
  // `settings.ENABLE_COURSE_DISCOVERY`, which the MFE reads from
  // `GET /api/mfe_config/v1`. With it off the catalog renders no search field at
  // all — just a paginated course list — so paging is the only route to a given
  // course. Declared for every release in `.ci/openedx-releases.json`: search is
  // meant to be on, and an install that lacks it should fail this coverage
  // loudly rather than skip it.
  // See `src/steps/course.ts` for the two routes to a course.
  'catalog-search',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Groups of capabilities that must not be enabled together: each group is a
 * single platform surface backed by mutually-exclusive implementations, so
 * enabling one means the other's tests are not applicable (ADR-0002). Declaring
 * more than one member of a group is a configuration error.
 *
 * This is intentionally seeded with a single illustrative pair; the mechanism is
 * the deliverable. Add real exclusive groups here as they are identified.
 */
export const MUTUALLY_EXCLUSIVE_CAPABILITIES: ReadonlyArray<readonly Capability[]> = [
  // Only one badging backend can be active on an installation at a time.
  ['badges', 'credly-badges'],
  // In-course navigation is one surface with two implementations, chosen by the
  // `courseware.enable_navigation_sidebar` waffle flag: with it enabled the
  // outline sidebar renders (BTR TC-00048/51/55), with it disabled the older
  // navigation does (TC-00047). An installation has one or the other, never both.
  ['courseware-navigation-sidebar', 'courseware-legacy-navigation'],
];

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}
