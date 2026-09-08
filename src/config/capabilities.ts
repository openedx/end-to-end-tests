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
 * Playwright tag (e.g. `@discussions`). This list **is** the tag vocabulary:
 * extend it when new capability-gated coverage is added, and mirror the change in
 * the "Known capabilities" comment of `.env.example`.
 */
export const CAPABILITIES = [
  'mfe-authn',
  // The `frontend-base` shell: the MFEs are bundled into one application with a
  // shared header/footer, replacing the one-MFE-per-app model with its
  // `frontend-component-header`. Present from `main` onward (post-verawood). Gates
  // the coverage that is *about* the shell's own chrome — a11y debt it carries,
  // markup only it renders — while journeys through it stay ungated and rely on
  // selector unions that match both headers (see
  // `src/config/selectors/account-menu.ts`).
  'frontend-base',
  'discussions',
  'teams',
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
 * Capabilities that are **on unless explicitly turned off** — stock surfaces a
 * default installation ships, rather than optional features it may add.
 *
 * The declare-to-enable default is right for optional coverage: forgetting to
 * declare `discussions` costs you discussions tests you never had. It is wrong
 * for a stock surface, where forgetting the declaration would silently drop
 * coverage every install is expected to have. So these invert: an installation
 * that has *replaced* the surface opts out with a `-` prefix
 * (`CAPABILITIES=-mfe-authn`).
 *
 * `mfe-authn` gates coverage that can only exist where the authn MFE owns
 * accounts — native LMS registration and password reset, and the MFE's own
 * screens. An install whose identity lives in an external service (a custom
 * `ACCOUNT_BACKEND`; see `src/accounts/README.md`) has nothing for those specs to
 * drive, and on a locked-down tenant they fail rather than skip.
 *
 * `frontend-base` is on by default because `main` — and every release cut from it
 * — serves its MFEs in the shell; a named release still on the separate-MFE model
 * (verawood and earlier) opts out with `-frontend-base`, which is what
 * `.ci/openedx-releases.json` declares for them.
 */
export const DEFAULT_ON_CAPABILITIES: ReadonlyArray<Capability> = ['mfe-authn', 'frontend-base'];

/** Marks an opt-out in `CAPABILITIES`, e.g. `-mfe-authn`. */
export const CAPABILITY_OPT_OUT_PREFIX = '-';

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

/** True when `capability` is on unless the installation opts out of it. */
export function isDefaultOnCapability(value: Capability): boolean {
  return DEFAULT_ON_CAPABILITIES.includes(value);
}

/**
 * Capabilities a test's tags require that the installation has not enabled — the
 * reason to skip it. Tags that are not capabilities (`@smoke`, `@mfe-account`, …)
 * are ignored, so a spec opts into gating simply by carrying a capability tag.
 *
 * Pure so the gate is unit-testable without a browser; `src/fixtures/` applies
 * it to every spec.
 */
export function missingCapabilities(
  tags: readonly string[],
  enabled: ReadonlySet<Capability>,
): Capability[] {
  const required = tags
    .map((tag) => (tag.startsWith('@') ? tag.slice(1) : tag))
    .filter((tag): tag is Capability => isCapability(tag));
  return [...new Set(required)].filter((capability) => !enabled.has(capability));
}
