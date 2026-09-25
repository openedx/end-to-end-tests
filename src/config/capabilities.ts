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
  // Course discussions: the `openedx` discussion provider (the forum, served
  // in-process by `openedx-forum`) and the discussions MFE. Default on: the
  // forum ships with the platform. An installation without it — or one still
  // on the legacy provider — opts out with `-discussions`. Tutor needs the
  // `forum` plugin (and its `do init` task, which creates the forum's search
  // indices) for this surface to answer.
  'discussions',
  // Course notifications as verawood ships them: on by default platform-wide
  // (`notifications.disable_notifications` turns them off), the v3 preferences
  // API (`/api/notifications/v3/configurations/`) and the notifications tray in
  // every MFE header. Default on; ulmo and earlier — opt-in course flags, older
  // preference APIs, no built-in tray — opt out with `-notifications` in
  // `.ci/openedx-releases.json`.
  'notifications',
  // A mailbox the suite can read is configured (`MAIL_PROVIDER`, see
  // `src/mail/`) and the target's outbound mail reaches it, so e-mail content
  // is assertable. Opt-in and never on by default: it needs infrastructure a
  // default install does not have. Declaring it without `MAIL_PROVIDER` is a
  // configuration error, not a skip.
  'email-inbox',
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
  // target lacks must fail its spec, never skip it. All of these ship with a
  // stock Tutor image (all but `scorm` as edx-platform requirements) and are
  // declared for every release in `.ci/openedx-releases.json` they exist on; a
  // provider that has removed one opts out by leaving it undeclared. Advanced
  // modules the platform itself bundles and no provider opts out of (poll,
  // word cloud, annotatable, …) have no capability: a missing one fails.
  'ora', // Open Response Assessment (`openassessment`, edx-ora2)
  'drag-and-drop-v2', // `drag-and-drop-v2` (xblock-drag-and-drop-v2)
  'pdf-xblock', // `pdf` (xblocks-contrib) under the "Advanced" tile
  'lti', // `lti_consumer` under the "Advanced" tile (no tool launch is asserted)
  'scorm', // `scorm` under the "Advanced" tile
  'edx-sga', // Staff Graded Assignment (`edx_sga`) under the "Advanced" tile, once listed
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
  // Special exams are on (`ENABLE_SPECIAL_EXAMS`, LMS and CMS; off on a
  // default install): timed subsections register as exams and the instructor
  // dashboard offers its Special Exams tab. Gates TC-00541's allowances, and
  // adds that tab to TC-00514's expected set. CI turns the setting on for the
  // releases that declare it.
  'special-exams',
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
  // The console's **not-found view offers a working way back**. On `verawood`
  // its "Back to Studio" action carries a URL and leaves the route; on `main`
  // the same anchor has no `href` and its handler does nothing (`RBAC-008`), so
  // the case has nothing to drive there. Declared where the action works, which
  // makes the regression visible as an undeclared capability rather than as a
  // permanently red case.
  'rbac-error-view-action',
  // The **certificate web view renders** on an install with no marketing site.
  // On `master` `marketing_link()` no longer falls back to the LMS's own pages
  // (`MKTG_URL_LINK_MAP`), so the About link is unset, the view's footer
  // context never defines `company_about_url` and the page answers 500
  // (`CERT-002`); earlier releases render it. Declared where it renders, like
  // `rbac-error-view-action`, so the regression is an undeclared capability
  // rather than a permanently red case.
  'certificate-web-view',
  // The **recommender's Studio editor shows the settings it saved**. Before
  // recommender-xblock 5.1.0 (`verawood` pins 5.0.0) the editor rendered its
  // defaults whatever the block held, so an author's change looked lost
  // (`XBLOCK-002`, the sheet's "can't change settings" on TC-00132); 5.1.0
  // renders the saved configuration. Declared where it does, so the gap is an
  // undeclared capability rather than a permanently red case.
  'recommender-studio-settings',
  // --- Installation settings a test depends on -------------------------------
  // Each of these used to be a runtime probe that skipped the case it did not
  // describe. Declaring the setting instead makes the selection explicit (a CI
  // profile can run exactly the cases its configuration enables), and the probe
  // stays as a check: a declaration the target contradicts **fails** the case,
  // naming the setting, rather than skipping it. A test that reads one of these
  // settings must carry its tag (the fixture refuses an untagged test), so the
  // selection cannot drift from the code. Where a case needs the setting *off*,
  // the pair is mutually exclusive (`MUTUALLY_EXCLUSIVE_CAPABILITIES`); a target
  // that declares neither skips both halves.
  //
  // AuthZ course-authoring migration mode: whether saving a course or org waffle
  // override migrates that scope's roles by itself
  // (`ENABLE_AUTOMATIC_AUTHZ_COURSE_AUTHORING_MIGRATION`, off on a stock install)
  // or leaves migration to an operator. CI turns it on (`.ci/tutor/e2e_base.py`).
  // Probed by `authzMigrationMode` (`src/steps/rbac.ts`).
  'authz-auto-migration',
  'authz-manual-migration',
  // The MFE config's `SUPPORT_URL`: set, the headers offer a Help link to it
  // (TC-00020/00021/00023); unset, they offer none. Read from `/api/mfe_config/v1`.
  'support-url',
  'no-support-url',
  // Studio's course-creator group (`ENABLE_CREATOR_GROUP`): a new account has to
  // request course creation, and staff grant it (Studio Home reports the status).
  // Off, every account may create courses and there is nothing to request.
  'course-creator-group',
  // --- Content a test depends on ------------------------------------------------
  // Properties of the target's catalog and configured course that a case needs
  // and a default install lacks, declared like the settings above (and checked
  // the same way) so a profile that seeds the content can select the cases.
  //
  // The catalog lists courses of at least two organizations, so its organization
  // filter can narrow the list (TC-00013's filter case).
  'multi-org-catalog',
  // The configured course (`COURSE_KEY`) has a YouTube intro video on its About
  // page. The demo course has none.
  'course-intro-video',
  // --- Optional services --------------------------------------------------------
  // A working codejail sandbox (a codejail service via `CODE_JAIL_REST_SERVICE_*`,
  // or a local sandbox that can actually run): Python-graded (`loncapa/python`)
  // problems can be scored. Without one, grading fails. edx-codejail raises "safe_exec
  // has not been configured for Python" when nothing is configured. On a stock
  // Tutor install, where the jail is configured but its sandbox cannot start,
  // the jailed subprocess fails (measured on the local `main` sandbox,
  // 2026-09-24). Either way, a default install cannot run TC-00203.
  'codejail',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Capabilities that are **on unless explicitly turned off** — stock surfaces a
 * default installation ships, rather than optional features it may add.
 *
 * The declare-to-enable default is right for optional coverage: forgetting to
 * declare `teams` costs you teams tests you never had. It is wrong
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
 *
 * `discussions` is on by default because the forum ships with the platform; an
 * install without it opts out with `-discussions`.
 *
 * `notifications` is on by default because verawood and every later release
 * enable notifications platform-wide and render the tray; ulmo and earlier opt
 * out with `-notifications`.
 */
export const DEFAULT_ON_CAPABILITIES: ReadonlyArray<Capability> = [
  'mfe-authn',
  'frontend-base',
  'instructor-dashboard',
  'discussions',
  'notifications',
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
  // In-course navigation is one surface with two implementations: the outline
  // sidebar (verawood onward, where the platform no longer reads the
  // `courseware.enable_navigation_sidebar` flag; BTR TC-00047, 49–52, 55–57) and
  // the older in-course navigation of earlier releases. An installation has one
  // or the other, never both.
  ['courseware-navigation-sidebar', 'courseware-legacy-navigation'],
  // AuthZ migration either happens on save or is left to an operator.
  ['authz-auto-migration', 'authz-manual-migration'],
  // The MFE config either sets SUPPORT_URL or it does not.
  ['support-url', 'no-support-url'],
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
