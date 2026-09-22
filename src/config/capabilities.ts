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
  // Content libraries v2 (Learning Core): the library-authoring MFE
  // (`/library/<lib key>` inside the authoring app), the `/api/libraries/v2/`
  // CMS API, and the course side of reuse — "Library Content" in a unit's
  // add-component bar, library units/sections in the outline, and the
  // `/api/contentstore/v2/downstreams/` sync API. Both `main` and `verawood`
  // ship all of it, containers included, so `.ci/openedx-releases.json`
  // declares it for them; `ulmo` and earlier are left undeclared and the
  // `tests/studio/library/` tree skips there. Studio's home API reports it as
  // `libraries_v2_enabled`. Team management is *not* covered by this
  // capability: where the admin console MFE is configured (`ADMIN_CONSOLE_URL`)
  // the library MFE hands "Manage team" to it, which is the `rbac` epic's
  // surface. Deleting a library that ever held a container fails on the
  // platform (`LIB-001`), so the fixtures tear down best-effort.
  'content-libraries',
  // Legacy (modulestore, `library-v1:`) content libraries and the tool that
  // migrates them into v2 libraries (`/api/modulestore_migrator/v1/`). Legacy
  // libraries are deprecated and hidden once an installation enables the
  // `contentstore.new_studio_mfe.disable_legacy_libraries` waffle flag; a
  // default install (measured on `main`) still creates them, so `main` and
  // `verawood` declare this. Gates only the BTR migration cases.
  'content-libraries-v1',
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
  // Studio (the CMS) and the course-authoring MFE are present and the suite may
  // author against them. Declaring it makes `CMS_BASE_URL` required (see
  // `load.ts`) and enables the `author` role; leaving it undeclared skips the
  // whole `tests/studio/` tree so an LMS-only target runs cleanly.
  'studio',
  // Content tagging: the taxonomy list/detail pages in the authoring MFE
  // (`/taxonomies`, `ENABLE_TAGGING_TAXONOMY_PAGES`) and the tag drawers on
  // outline items, unit-page components and the Align sidebar. Reported by
  // Studio's home API as `taxonomies_enabled`; declared for `main`/`verawood`,
  // undeclared on `ulmo` and earlier. **Managing** taxonomies (import, assign to
  // an org, export, delete) is restricted to a taxonomy admin (staff/superuser),
  // so the specs that drive the taxonomy pages seed and act as the admin under
  // the admin lock and skip without an admin account — like `certificates`.
  // **Tagging** an object (the drawers) needs write access to that object's
  // course: on `main`/`verawood` course object-tags go through openedx-authz
  // (`COURSES_MANAGE_TAGS`, the `authz.enable_course_authoring` flag), granted to
  // a course's creator at creation, so the worker author tags only courses it
  // created this run.
  'taxonomies',
  // The Verawood authoring sidebar: the Info / Add / Align / Help rail on the
  // course-outline page and the Info / Add / Align rail on the unit page
  // (`src/generic/sidebar`, the `CourseAuthoring*SidebarSlot`s). Present on
  // `main` and `verawood`; `ulmo` and earlier render neither the outline
  // Info/Add/Align pages nor the unit-page sidebar, so they leave it undeclared
  // and the sidebar specs skip. Not a version switch — the tag drawer opens from
  // the card kebab on every release and stays ungated beyond `taxonomies`; this
  // gates only the coverage that is *about* the sidebar rail and its panels.
  'authoring-sidebar',
  // File/video upload agreements: the authoring MFE blocks the Files (and Videos)
  // upload controls behind a banner until the user accepts each configured
  // agreement, driven by the `AGREEMENT_GATING` MFE-config map
  // ({ "upload"|"upload.files"|"upload.videos": type|[types] }) and the LMS
  // `/api/agreements/v1/` API. The gating map is site configuration read from
  // `/api/mfe_config/v1` (cached ~5 min), so it cannot be toggled per run: an
  // install declares this only when it has configured the map (CI sets it in the
  // Tutor patch), and the specs read the map, seed the matching `UserAgreement`
  // rows via Django admin, and skip where it is absent or no admin is configured.
  'upload-agreements',
  // Optional component (XBlock) types an author can add to a unit. Each is a
  // tile in the unit page's "Add component" bar and an entry in the CMS
  // `container_handler` API's `component_templates`; a declared type that the
  // target lacks must fail its spec, never skip it. All of these ship with
  // edx-platform (and so with a stock Tutor image) and are declared for every
  // release in `.ci/openedx-releases.json`; a provider that has removed one opts
  // out by leaving it undeclared.
  'ora', // Open Response Assessment (`openassessment`, edx-ora2)
  'drag-and-drop-v2', // `drag-and-drop-v2` (xblock-drag-and-drop-v2)
  'pdf-xblock', // `pdf` under the "Advanced" tile
  'lti', // `lti_consumer` under the "Advanced" tile (no tool launch is asserted)
  'scorm', // `scorm` under the "Advanced" tile
  'edx-sga', // Staff Graded Assignment (`staffgradedxblock`) under the "Problem" tile
  // The LMS instructor dashboard as the instructor-dashboard MFE
  // (`frontend-app-instructor-dashboard`, served at
  // `${APPS_BASE_URL}/instructor-dashboard/<course>`), driven by the
  // `/api/instructor/v2/` API. From verawood onward the LMS redirects the legacy
  // `/courses/<key>/instructor` dashboard to it unless the
  // `instructor.legacy_instructor_dashboard` waffle flag is on (the legacy
  // dashboard is deprecated: DEPR-38432, removal targeted for 2026-11). Default
  // on, because that is what the platform ships; ulmo and earlier — legacy
  // dashboard, no v2 API — opt out with `-instructor-dashboard` in
  // `.ci/openedx-releases.json`, and the `tests/lms/instructor/` tree skips.
  // A legacy-dashboard implementation, if BTR ever needs one for older releases,
  // would be the other half of a mutually-exclusive pair named
  // `instructor-dashboard-legacy`; it is not added until it has coverage.
  'instructor-dashboard',
  // Course certificates can be generated on the installation. Certificates ship
  // with the platform but the platform-wide switch
  // (`CertificateGenerationConfiguration`, Django admin) is off on a default
  // install; the suite turns it on once per run through the admin account and
  // skips this coverage with a reason where no admin account is configured.
  // Gates the instructor dashboard's Certificates tab (BTR TC-00536–00538).
  'certificates',
  // Reserved for the Superset / Aspects analytics reports on the instructor
  // dashboard (BTR TC-00542–00559). Aspects is a separate deployment, not part
  // of a default install; no spec uses this capability yet, so declaring it has
  // no effect — it exists so the tag vocabulary is settled before that coverage
  // is written.
  'analytics',
  // Roles and permissions under **openedx-authz**: the `/api/authz/v1/` API and
  // the Roles and Permissions console (the admin-console MFE, reached through
  // the `ADMIN_CONSOLE_URL` the authoring MFE config advertises). Both ship on
  // `main` and `verawood` (openedx-authz 1.23.0 and 1.21.0), so
  // `.ci/openedx-releases.json` declares it for them and the `tests/rbac/` tree
  // skips on `ulmo` and earlier. Library roles work with no flag at all; course
  // roles are enforced only where `authz.enable_course_authoring` is turned on
  // for a course or an org, which the specs do themselves through the Django
  // admin (so that coverage also needs an admin account).
  'rbac',
  // AuthZ course authoring is enabled for the **whole target**, not just the
  // courses a spec turns it on for. Declared nowhere by default — CI does not
  // set the global flag, because enabling it platform-wide locks every
  // unmigrated course's team out of Studio. It gates the one assertion a
  // per-course or per-org override cannot reach: Studio Home's link into the
  // console, which the authoring MFE renders from the flag read with no course
  // context (BTR TC-00560's first entry point).
  'rbac-global',
  // The console's **library permission matrix matches the API's own permission
  // list**, one row per permission. On `main` (openedx-authz 1.23) it does:
  // eleven rows for eleven library permissions, and each role column's ticks
  // equal that role's `roles/?scope=` permission count. On `verawood` (1.21) the
  // same tab renders fourteen rows — the inaccuracy
  // [wg-build-test-release#609](https://github.com/openedx/wg-build-test-release/issues/609)
  // reported against that release. So the matrix's **structure** is asserted
  // everywhere and its **fidelity to the API** only where the fix has landed.
  'rbac-matrix-parity',
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
 *
 * `instructor-dashboard` is on by default because verawood and every later
 * release serve the instructor dashboard as its MFE; ulmo and earlier, which
 * still render the legacy dashboard, opt out with `-instructor-dashboard` in
 * `.ci/openedx-releases.json`.
 */
export const DEFAULT_ON_CAPABILITIES: ReadonlyArray<Capability> = [
  'mfe-authn',
  'frontend-base',
  'instructor-dashboard',
];

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
