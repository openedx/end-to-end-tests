# `src/api/` — API client & data factories

**Single responsibility:** typed HTTP clients for the Open edX APIs the suite
needs, and deterministic, unique-per-run data factories. Set state up through
portable, documented endpoints — never a private fixture or Tutor-shell coupling
(ADR-0002).

Depends only on `src/config/`.

Contains:

- `csrf.ts` — `fetchCsrfToken`: the `GET /csrf/api/v1/token` the authn MFE makes
  before a credentialed POST. Lands the `csrftoken` cookie in the request context.
  Takes an `origin` (LMS by default) because the cookie is per host: a Studio
  write needs a token from Studio.
- `registration.ts` — `registerLearnerAccount`: creates a user via
  `POST /api/user/v1/account/registration/` (the authn MFE's `/register` path).
  Portable account seeding that needs no admin rights; on success the platform
  also signs the user in.
- `login.ts` — `loginSession`: signs in via `POST /api/user/v2/account/login_session/`
  with the CSRF header, leaving parent-domain session/JWT cookies in the jar.
- `user-identity.ts` — `newLearnerIdentity`: a unique-per-run learner identity
  (UUID-suffixed username/email, throwaway password) so parallel tests never
  collide.
- `activation.ts` — `activateAccount` / `extractActivationKey`: visits the
  `/activate/<key>` link (or bare key) an install that enforces email validation
  sends, for the `manual` and plugin account backends.
- `enrollment.ts` — `isEnrolled` / `enrollInCourseViaApi`: the enrollment API,
  both the outcome the catalog specs assert on and the portable seeding the
  course-state fixtures use.
- `course-detail.ts` — `fetchCourseDetail`: the course's own name/org/number,
  so a spec can search or match on data the platform supplied rather than on
  hard-coded copy — plus dates, pacing, effort, visibility and media, the LMS-side
  reading for what an author saved in Studio.
- `course-metadata.ts` — `fetchCourseMetadata`: course-home tabs (in learner
  order) and course access, the LMS-side reading for Pages & Resources toggles,
  custom-page order and prerequisite gating.
- `course-outline.ts` — `fetchCourseOutline` / `buildOutline` / `unitsContaining`:
  the Blocks API folded into sections → subsections → units with per-block
  completion, which is what the completion steps and fixtures drive from; plus
  `fetchCourseNavigation` (the course-home navigation model, a gated subsection
  present as a `lock`) and `fetchSequenceMetadata` (the learning MFE's
  per-subsection reading, `undefined` when it is not served to the learner) — the
  learner-side outcome the visibility round trips assert on.
- `course-preflight.ts` — `assertCourseAccessible` / `courseKeySkipReason`:
  distinguishes "no `COURSE_KEY`" (fixtures skip) from "`COURSE_KEY` names a
  course the target lacks" (`CoursePreflightError`, the run fails).
- `progress.ts` — `fetchCourseProgress`: the course-home progress API — grade,
  passing threshold, completion counts — the numeric answers the course-home
  specs assert on.
- `errors.ts` — `ApiError`, carrying status/url/body for actionable failures.

### Studio clients

Everything Studio-side goes through `studio-origin.ts` (`studioOrigin`,
`studioWriteHeaders`: Studio's CSRF token plus a Studio `Referer`) so a missing
`CMS_BASE_URL` reads as configuration.

- `studio-session.ts` — `establishStudioSession`: the silent OAuth handshake that
  gives a request context holding an LMS session its Studio session too. The LMS
  cookies alone get a `302 /login/` from every Studio URL and a `401` from every
  Studio API; after this one `GET` they work. Success is judged by
  `GET /api/user/v1/me` on Studio, not by a cookie name. Consumers reach it
  through the account backend's `signInStudio` (`src/accounts/`), of which it is
  the default, so an install with its own Studio IdP can replace it.
- `studio-home.ts` — `fetchStudioHome` (course-creator status, org flags,
  in-process re-runs) and `listStudioCourses` (the paginated list with the MFE's
  search / sort / filter parameters; falls back to the v1 payload on releases
  without the v2 endpoint).
- `course-creator.ts` — `requestCourseCreator` (the API) and
  `grantCourseCreator` (Studio's Django admin form, the only grant path on a
  default install; needs a superuser session) — BTR TC-00310 as a mechanism.
- `course-factory.ts` — `newCourseIdentity` (org + `E2E<run id><slot>` number:
  Studio's uniqueness rule is org+number, so the run does not disambiguate),
  `createCourse` (`POST /course/`; a duplicate is **HTTP 200 with `ErrMsg`**, so
  success is "the body has `course_key`"), `ensureCourse` (idempotent per
  identity, and the retry that absorbs `STUDIO-001`), `rerunCourse` /
  `waitForRerun`.
- `course-settings.ts` — Schedule & Details (`v1/course_details`, GET/PUT),
  grading (`v1/course_grading`), Advanced Settings (`/settings/advanced`, the
  legacy JSON view that answers on every release), and `fetchCourseSettingsFlags`
  (`v1/course_settings`: whether the certificates-available-date and prerequisite
  controls render on this target).
- `course-team.ts`, `group-configurations.ts`, `certificates.ts`,
  `course-apps.ts` (Pages & Resources toggles), `custom-pages.ts` (static-tab
  create/rename/delete + reorder read, `v0/tabs`), `course-transfer.ts` (export
  start/poll, import status), `course-checklists.ts` (validation and quality
  behind the Launch and Best-practices checklists — served by the Studio origin),
  `course-modes.ts` (LMS enrollment modes; `ensureCertificateBearingMode` adds the
  `honor` mode a course needs before the Certificates form renders — staff only).
- `xblock.ts` — the legacy `xblock_handler` client: `createXBlock`,
  `updateXBlock`, `publishXBlock`, and the reads (`fetchXBlockOutline`,
  `fetchXBlock`, `fetchCourseIndex`, `fetchContainer` / `fetchContainerChildren`,
  `availableComponentTypes` / `advancedComponentTypes`). The one endpoint the whole
  outline and every unit go through. Duplicate / delete / reorder / move and the
  prerequisite gate are exercised through the outline page object's UI, not a
  parallel API client, so the spec asserts the action the way an author takes it.
- `course-content.ts` — `buildSection` and the `authorProblem` / `authorHtml` /
  `authorVideo` builders (with the per-type problem templates surfaced by
  `problemOlx`): the "a spec builds a section, not a course" helper layer, all
  arrangement done through the xblock API so a spec body opens on the action under
  test.
- `clipboard.ts` — the content-staging clipboard client (`copyToClipboard`):
  staged server-side per user, so a cross-course paste needs no browser clipboard
  and no permission grant. The paste is a UI action the outline/unit page objects
  drive.
- `cohorts.ts` — the LMS instructor cohort client (`enableCohorts` /
  `createCohort` / `linkCohortToGroup` / `addToCohort`). These are Django
  **session**-auth LMS views, not JWT: a JWT-only context is redirected to login
  and the write surfaces as **HTTP 405**, so drive them from a fresh
  `loginSession` on a throwaway context
  (see `.private/studio-auth-resilience.md` §2.4).
- `search.ts` — `searchCourseDiscovery` (the LMS catalog-search index the
  discovery page runs) and `reindexCourse` (Studio's `reindex_link`, global-staff
  only — rebuilds the index so freshly authored content becomes findable).

The auth primitives are what the default auth provider (`src/auth/`) and the
account backends compose into a captured storage state; the course primitives
are what specs assert on ("the UI drives the action; the API decides the
outcome").

### Instructor clients

- `instructor.ts` — the LMS `/api/instructor/v2/courses/<key>/…` API the
  instructor-dashboard MFE is built on (`verawood` onward): the dashboard model
  (`fetchInstructorCourse`: identifiers, counts, the caller's `permissions`, the
  tabs it may see), in-flight tasks and one task by id, reports (`listReports`,
  `downloadReport` with `resolveReportUrl` — `generate` itself is a UI action
  here and returns no task id, see `INSTR-002`), the enrollment list and
  learner / per-problem readings, the two grading writes the seeds and steps
  need (`resetAttempts`, `overrideScore`), extensions (`listUnitExtensions`),
  the certificate reads and the writes the certificate step composes, and
  `grantCourseTeamRole` (report generation needs `data_researcher`). Only what
  a page object, step, fixture or spec calls is here; the rest of the surface
  is driven through the dashboard and asserted on the response it returns. DRF views that accept the JWT, so the author's
  `page.request` drives them. A `400 "already running"` is a
  `TaskAlreadyRunningError`.
- `certificate-generation-config.ts` — `ensureCertificateGenerationEnabled`: the
  platform-wide certificate switch, which has no REST API — only the LMS Django
  admin, session-auth, so it takes a fresh admin `loginSession` context.

### Library clients

- `libraries.ts` — the content libraries v2 API (`/api/libraries/v2/`) the
  library-authoring MFE is built on: libraries (`createLibrary` with a typed
  `LibraryExistsError` keyed on the `slug` field error, `fetchLibrary`,
  `listLibraries` with `textSearch`, `updateLibrary`, `deleteLibrary` typing the
  `LIB-001` 500 as `LibraryDeleteRestrictedError`), publish / commit, blocks and
  their OLX and assets (`libraryOlx` builds escaped html / video / pdf / problem
  OLX), containers (unit / subsection / section) with `children/` and
  `hierarchy/`, collections and their items, and the library team. Keys:
  `libraryKeyFor(org, slug)`, `newLibrarySlug`. Studio-session-authenticated
  (measured: no JWT needed), so the author's `page.request` drives it; responses
  are read through `studioJson` with `allowEmpty` (204s) and the membership
  `forbiddenHint`.
- `library-sync.ts` — the course side of reuse: `importLibraryContent`
  (`POST /xblock/` with `library_content_key`; `category` is mandatory), the
  downstream link (`fetchDownstream`, `listDownstreams` — course key
  URL-encoded) and `acceptSync` / `declineSync`.
- `legacy-libraries.ts` — legacy `library-v1:` libraries (`createLegacyLibrary`,
  `addLegacyLibraryBlock`, `listLegacyLibraries`) and the modulestore migrator
  (`startMigration`, `fetchMigration` — `undefined` on the retrieve-404 race a
  caller polls through — `isMigrationSettled`).
- `tagging.ts` — the content-tagging API (`content_tagging/v1/`): taxonomy
  lifecycle (`listTaxonomies`, `importTaxonomy`, `setTaxonomyOrgs`,
  `deleteTaxonomy`, `listTaxonomyTags`) and object tags (`fetchObjectTags`,
  `setObjectTags`, `fetchObjectTagCounts`) — the tag drawer's oracle.
- `mfe-config.ts` — `fetchAuthoringMfeConfig`: the authoring MFE's `/api/mfe_config`
  (the normalized `AGREEMENT_GATING` map, tagging/assets flags); `agreementTypesIn`.
- `agreements.ts` — the upload-agreement record API (`fetchAgreementRecord`,
  `acceptAgreement`, `listAgreements`): `is_current` is the gating oracle.
- `agreements-admin.ts` — `ensureAgreement` / `bumpAgreementUpdated`: seed and
  edit `UserAgreement` rows through the LMS Django admin (no REST API), on a
  `loginSession` context.
- `assets.ts` — the Studio Files API (`/assets/<key>/`): `fetchAssets` /
  `fetchAllAssets` / `uploadAsset`, plus `setAssetLock` and `deleteAsset` for the
  role cases that must perform them as the account under test (the Files page
  drives the same two in `tests/studio/files/`). Lock answers with the updated
  asset on some releases and a bare `{"locked": …}` on others; both are read.
- `textbooks.ts` — `fetchTextbooks`, the course PDF textbook oracle (deletion is
  driven through the Textbooks page); `createTextbook` posts to the **legacy**
  `/textbooks/<key>` handler, because the v1 API is read-only and answers a
  `POST` with 405 (measured on `main`). The learner effect is read via
  `fetchCourseMetadata` tabs.
- `course-updates.ts` — `fetchCourseUpdates` / `fetchHandouts` / `createCourseUpdate`:
  the Course Updates page's `course_info_update` and handouts-xblock oracles.

### Roles and permissions clients

- `authz.ts` — the `openedx-authz` API (`/api/authz/v1/`) the Roles and
  Permissions console is built on: the role vocabularies (`COURSE_ROLES`,
  `LIBRARY_ROLES`, `PLATFORM_ROLES`, `LEGACY_ROLE_EQUIVALENTS`), `listRoles`,
  `listRoleUsers`, `listAssignments`, `listUserAssignments`, `listAuthzUsers`,
  `listScopes`, `listAuthzOrgs`, `validateMyPermissions` / `canI`,
  `validateUsers`, and the 207-aware writes `assignRole` / `revokeRole` (an
  `errors[]` row names the identifier and the code). `authzScopeKey` encodes a
  scope once, in one place — a course key's `+` must survive the query string.
  Also `fetchWaffleFlagStates` and `isAuthzEnabledForCourse`, the flag document
  every override write waits on.
- `waffle.ts` — `authz.enable_course_authoring` overrides through the Django
  admin: `setCourseFlagOverride` / `setOrgFlagOverride` and their `clear…`
  counterparts. The models are `ConfigurationModel`s, so nothing is ever
  deleted: turning an override off means adding a disabled row.
- `authz-migration.ts` — the read-only Course Authoring Migration Run admin:
  `countMigrationRuns`, `hasCompletedMigrationRun` and `fetchMigrationRunLedger`,
  which decodes the run's `metadata` into the per-assignment ledger
  (`{role, scope, subject}`) that names every mapping a migration made. Filters
  by the model's **raw** values, never by a rendered label.
- `course-access-role-admin.ts` — the legacy `CourseAccessRole` admin:
  `grantLegacyRole` (the only route to an **organization-wide** role — a row with
  a blank course id), `revokeLegacyRole`, `listCourseAccessRoles` and
  `countCourseAccessRoles`. Per-course legacy roles have an API
  (`grantCourseTeamRole`) and use it.
- `user-admin.ts` — `deactivateAccount`: turns an account's `is_active` off
  through the LMS user admin, the only way to reach the platform's "registered
  but not activated" behaviour on a target that activates on registration.
- `django-admin.ts` — the admin-form mechanics the four clients above share:
  `openAdminForm` / `postAdminForm` / `readAdminForm` (a whole change form,
  inline formsets included, read back for re-posting), `findAdminRowPk`,
  `countAdminResultRows`, and `assertAdminPage` — which is what stops an
  **evicted** Django session from reading as an empty list, since `/admin/…`
  answers a logged-out caller with a 302 the request context follows to a 200.
