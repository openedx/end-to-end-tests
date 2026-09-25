# Capabilities

Installations differ in what they run: which features are on, which
micro-frontends are deployed, which optional services exist, and how a few
platform settings are configured. The suite handles that with **capabilities**.
A capability is a named property of the target, and the tests that depend on it
carry a matching tag. This document describes each capability, when to use it,
which Open edX releases are known to support it, and where CI turns it on.

`src/config/capabilities.ts` is the authoritative list. This document explains
it, and `tests/config/capabilities-doc.spec.ts` keeps the two in step.

## How capabilities work

- **Declaring.** A target lists what it has in `CAPABILITIES`, a
  comma-separated list (see `.env.example`). The list is validated at load time:
  an unknown name, or two mutually exclusive capabilities together, fails the
  run before any test starts.
- **Gating.** A test tagged with a capability (`@teams`) runs only where that
  capability is enabled. The `capabilityGate` fixture reads each test's own
  tags, so the tag is the whole contract. Any other tag (`@smoke`,
  `@mfe-learning`) is only a filter.
- **Off until declared, except the default-on ones.** Most capabilities are off
  unless declared. The **default-on** capabilities describe what a stock install
  ships and are on unless a target opts out with a `-` prefix
  (`CAPABILITIES=-mfe-authn`). Opting out of a capability that is not default-on
  is a configuration error.
- **Mutually exclusive pairs.** Some capabilities are two implementations or two
  configurations of one surface; declaring both fails validation. Where one half
  of a pair is default-on, declaring the other half replaces it without an
  explicit opt-out (`support-url` alone turns `no-support-url` off).
- **Declared means present.** A gated test asserts that the feature it covers is
  really there, so a target that declares a capability it lacks **fails** rather
  than passing vacuously. For the installation-setting and content capabilities,
  the fixture that reads the setting checks the declaration against the target.
  It fails the test, naming the setting, when they disagree. It also refuses a
  test that reads the setting without carrying its tag.
- **What a capability gates.** It gates the coverage that is *about* the feature,
  not every journey that happens to pass through it. Where a feature is one of two
  routes to the same place, the journey takes whichever route the target offers
  and stays ungated (`locateCourseInCatalog` does this for catalog search).
- **Settings are capabilities, not skips.** When a case depends on how the target
  is configured, give it a capability rather than a fixture that probes the
  target and skips. Every remaining runtime skip is labelled
  `// skip-kind: capability | suite-config | content`. See CONVENTIONS.md,
  "Tags".

### Adding a capability

1. Add it to `CAPABILITIES` in `src/config/capabilities.ts` with a comment saying
   what it means.
   - If a stock install has it, add it to `DEFAULT_ON_CAPABILITIES`.
   - If it has an alternative, add the pair to `MUTUALLY_EXCLUSIVE_CAPABILITIES`.
2. Describe it in this document, in the right section below, and in the CI table
   (the unit test fails until you do).
3. Mention it in the "Known capabilities" comment of `.env.example`.
4. Declare it in `.ci/openedx-releases.json` for the releases CI should run it on,
   or in a profile's `capabilities` in `.ci/profiles.json` if only that profile
   provides it.

## Where CI turns each capability on

CI runs `main` and `verawood` on every pull request, under the `default` and
`extended` profiles (`.ci/profiles.json`). The older releases run on demand
through `run_tests_tutor.yml`'s `openedx_release` input, usually with `default`
only.

The release columns show what `.ci/openedx-releases.json` gives the `default`
profile. The `extended` column shows what that profile changes on top.

| Value | Meaning |
| --- | --- |
| `declared` | listed for that release |
| `default` | on by default and not opted out |
| `opted out` | turned off with `-name` |
| `replaced` | on by default, but the release declares the other half of its pair |
| `—` | off |
| `+` / `−` (extended) | the profile turns it on / off |
| `+ verawood` (extended) | on only where the release has the plugin that provides it |

<!-- ci-table:start -->

| Capability | main | verawood | ulmo | teak | sumac | redwood | extended |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mfe-authn` | default | default | default | default | default | default | |
| `frontend-base` | default | opted out | opted out | opted out | opted out | opted out | |
| `discussions` | default | default | default | default | default | default | |
| `notifications` | default | default | opted out | opted out | opted out | opted out | |
| `email-inbox` | declared | declared | — | — | — | — | |
| `teams` | declared | declared | declared | declared | declared | declared | |
| `notes` | declared | declared | declared | declared | declared | declared | |
| `wiki` | declared | declared | — | — | — | — | |
| `cohorts` | declared | declared | declared | declared | declared | declared | |
| `content-libraries` | declared | declared | — | — | — | — | |
| `content-libraries-v1` | declared | declared | — | — | — | — | |
| `courseware-navigation-sidebar` | declared | declared | — | — | — | — | |
| `courseware-legacy-navigation` | — | — | declared | declared | declared | declared | |
| `catalog-search` | declared | declared | declared | declared | declared | declared | |
| `studio` | declared | declared | declared | declared | declared | declared | |
| `taxonomies` | declared | declared | — | — | — | — | |
| `authoring-sidebar` | declared | declared | — | — | — | — | |
| `upload-agreements` | declared | declared | — | — | — | — | |
| `ora` | declared | declared | declared | declared | declared | declared | |
| `drag-and-drop-v2` | declared | declared | declared | declared | declared | declared | |
| `pdf-xblock` | declared | declared | — | — | — | — | |
| `lti` | declared | declared | declared | declared | declared | declared | |
| `scorm` | declared | declared | declared | declared | declared | declared | |
| `edx-sga` | declared | declared | declared | declared | declared | declared | |
| `instructor-dashboard` | default | default | opted out | opted out | opted out | opted out | |
| `certificates` | declared | declared | declared | declared | declared | declared | |
| `special-exams` | declared | declared | — | — | — | — | |
| `analytics` | — | — | — | — | — | — | |
| `rbac` | declared | declared | — | — | — | — | |
| `rbac-global` | — | — | — | — | — | — | |
| `rbac-matrix-parity` | declared | — | — | — | — | — | |
| `rbac-error-view-action` | — | declared | — | — | — | — | |
| `certificate-web-view` | — | declared | declared | declared | declared | declared | |
| `recommender-studio-settings` | declared | — | — | — | — | — | |
| `authz-auto-migration` | declared | declared | — | — | — | — | − |
| `authz-manual-migration` | replaced | replaced | default | default | default | default | + |
| `support-url` | — | — | — | — | — | — | + |
| `no-support-url` | default | default | default | default | default | default | − |
| `course-creator-group` | default | default | default | default | default | default | |
| `multi-org-catalog` | — | — | — | — | — | — | + |
| `course-intro-video` | — | — | — | — | — | — | + |
| `codejail` | — | — | — | — | — | — | + verawood |

<!-- ci-table:end -->

## Capability reference

"Known to support" names the releases on which the suite has run the coverage
and passed: the releases CI turns the capability on for, plus what a release note
or a measurement established. A release not listed has not been verified; it
does not necessarily lack the feature. Where a release is known **not** to
support something, the entry says so.

### Stock surfaces (on by default)

| Capability | What it means | Tag | Known to support |
| --- | --- | --- | --- |
| `mfe-authn` | The authn MFE owns accounts: native LMS registration, password reset and the MFE's own screens. An install whose identity lives in an external service (a custom `ACCOUNT_BACKEND`, see `src/accounts/README.md`) opts out. | The registration, password-reset and authn-screen specs (`tests/lms/auth/`). Not specs that merely sign in through the account backend. | every release CI runs |
| `frontend-base` | The frontend-base shell: the MFEs bundled into one application with a shared header and footer. | Only coverage that is *about* the shell's own chrome (its a11y debt, markup only it renders). Journeys through it stay ungated and match both headers with a selector union. | `main`. `verawood` and earlier use one MFE per app and opt out. |
| `instructor-dashboard` | The LMS instructor dashboard as its MFE, driven by `/api/instructor/v2/`. From verawood the legacy dashboard redirects to it. | `tests/lms/instructor/` and the legacy-role cases in `tests/rbac/roles/`. | `main`, `verawood`. `ulmo` and earlier render the legacy dashboard and opt out. |
| `discussions` | Course discussions through the `openedx` provider (the in-process forum) and the discussions MFE. Tutor needs the `forum` plugin and its `do init` task. | The forum, Discussion tab and discussion-notification specs. | every release CI runs |
| `notifications` | Course notifications as verawood ships them: on platform-wide, the v3 preferences API and the tray in every MFE header. | `tests/lms/notifications/`. | `main`, `verawood`. `ulmo` and earlier (opt-in course flags, older APIs, no tray) opt out. |

### Installation settings (mutually exclusive pairs, stock half on by default)

A target that differs from the stock setting declares the other half.

| Capability | What it means | Tag | Known to support |
| --- | --- | --- | --- |
| `authz-auto-migration` / `authz-manual-migration` | Whether saving a course or org AuthZ waffle override migrates that scope's roles by itself (`ENABLE_AUTOMATIC_AUTHZ_COURSE_AUTHORING_MIGRATION`, off on a stock install) or leaves migration to an operator. Checked by `authzMigrationMode`, which probes an org with no courses. | Auto: the migration and rollback cases in `tests/rbac/transition/` and `tests/rbac/studio-authz/` (TC-00587–00614 area). Manual: TC-00613 / 00614. | Both modes on `main` and `verawood` (rbac is absent earlier). CI's `default` declares auto; `extended` runs manual. |
| `support-url` / `no-support-url` | Whether the MFE config (`/api/mfe_config/v1`) sets `SUPPORT_URL`. Set, the headers offer a Help link to it; unset (stock), they offer none. | The Help-link cases of TC-00020 / 00021 / 00023 in `tests/lms/chrome/header.spec.ts`. | Both on `main` and `verawood` (`extended` sets one). The learning header renders `href="null"` when unset (`LEARN-002`, an expected failure). |
| `course-creator-group` | Studio's course-creator group (`ENABLE_CREATOR_GROUP`, on in a stock CMS): a new account must request course creation and staff grant it. An install where every account may create courses opts out. | TC-00310 (`tests/studio/home/course-creator.spec.ts`). | every release CI runs |

### Platform features and services

| Capability | What it means | Tag | Known to support |
| --- | --- | --- | --- |
| `studio` | Studio (the CMS) and the course-authoring MFE are present and the suite may author against them. Makes `CMS_BASE_URL` required and enables the `author` role. Undeclared, the whole `tests/studio/` tree skips, so an LMS-only target runs cleanly. | Every Studio and authored-content spec (most carry it through a shared tag list). | every release CI runs |
| `catalog-search` | Search and filtering in the catalog MFE, gated on the LMS's top-level `ENABLE_COURSE_DISCOVERY`. Without it the catalog has no search field, only a paginated list. Ask the install rather than assuming: `curl -s <LMS_BASE_URL>/api/mfe_config/v1 \| grep ENABLE_COURSE_DISCOVERY`. | The search cases of `tests/lms/catalog/discovery.spec.ts`. Discovery and enrollment journeys stay ungated. | every release CI runs |
| `email-inbox` | A mailbox the suite can read is configured (`MAIL_PROVIDER`, see `src/mail/`) and the target's mail reaches it. Declaring it without `MAIL_PROVIDER` is a configuration error. | The e-mail cases: password reset, dashboard e-mail settings, notification e-mail, bulk e-mail. | `main`, `verawood` (CI's Mailpit service) |
| `certificates` | Course certificates can be generated. The platform-wide switch is off on a fresh install. The suite turns it on through the admin account and skips without one. | The certificate specs: Studio settings, the instructor dashboard's Certificates tab and report, learner certificates, profile visibility. | every release CI runs |
| `special-exams` | `ENABLE_SPECIAL_EXAMS` is on (LMS and CMS; off on a default install): timed subsections register as exams, and the instructor dashboard offers its Special Exams tab. | TC-00541, and TC-00514's expected tab set. | `main`, `verawood` |
| `codejail` | A working codejail sandbox: Python-graded (`loncapa/python`) problems can be scored. A stock Tutor install has codejail configured but no sandbox that can start, so such a problem answers with no grade. | TC-00203 (`tests/studio/unit/python-grader.spec.ts`). | `verawood` with `tutor-contrib-codejail`. That plugin has no Tutor 23 (`main`) build yet. |
| `analytics` | Aspects (the Superset analytics deployment) is installed. No spec is tagged with it yet; the reports (TC-00542–00559) and Studio's in-context metrics are Epic 16. Declared, it already adds Aspects' Reports tab to TC-00514's expected instructor-dashboard tabs. | TC-00514 reads it; the Aspects coverage of Epic 16. | not yet verified |

### Course and LMS features

| Capability | What it means | Tag | Known to support |
| --- | --- | --- | --- |
| `teams` | Course teams are available (the Teams tab, and team settings in Studio's Advanced Settings). | `tests/lms/teams/`, TC-00274, the ORA team-submissions switch (TC-00115). | every release CI runs |
| `notes` | Course notes: the notes service runs and `ENABLE_EDXNOTES` is on. On `main` it must be set as a flat setting, not only in `FEATURES` (`TUTOR-001`). | TC-00038 (`tests/lms/courseware/notes.spec.ts`). | every release CI runs |
| `wiki` | The course wiki is available (a Pages & Resources toggle and a course-home tab). | TC-00240 and the course-home wiki tab. | `main`, `verawood` |
| `cohorts` | Cohorts can be managed and linked to content groups. | TC-00292, TC-00058, TC-00539 and the instructor Cohorts tab. | every release CI runs |
| `courseware-navigation-sidebar` / `courseware-legacy-navigation` | In-course navigation is one surface with two implementations: the outline sidebar (verawood onward, TC-00047–00057) or the older in-course navigation. An install has one or the other. | The sidebar: `tests/lms/courseware/`, the course-home and Studio sidebar round trips. The legacy half has no specs yet: declaring it gates nothing, but keeps a target from also declaring the sidebar. | Sidebar: `main`, `verawood`. `ulmo` and earlier declare the legacy half. |

### Studio authoring

| Capability | What it means | Tag | Known to support |
| --- | --- | --- | --- |
| `content-libraries` | Content libraries v2 (Learning Core): the library-authoring MFE, `/api/libraries/v2/`, and reuse of library content in courses. Team management is `rbac`, not this. | `tests/studio/library/`, and the library cases in `tests/rbac/`. | `main`, `verawood`. `ulmo` and earlier are not covered. |
| `content-libraries-v1` | Legacy (modulestore) libraries and the migrator into v2. Hidden once `contentstore.new_studio_mfe.disable_legacy_libraries` is on. | The legacy-library and migration cases in `tests/studio/library/`. | `main`, `verawood` (a default install still creates them) |
| `taxonomies` | Content tagging: the taxonomy pages (`ENABLE_TAGGING_TAXONOMY_PAGES`) and the tag drawers. Managing taxonomies needs the admin account. | `tests/studio/tagging/`, and tag filters in `tests/studio/library/`. | `main`, `verawood` |
| `authoring-sidebar` | The Verawood authoring sidebar: the Info / Add / Align / Help rail on the outline and the Info / Add / Align rail on the unit page. | `tests/studio/sidebar/`, and the Align cases in `tests/studio/tagging/`. | `main`, `verawood`. Not rendered on `ulmo` and earlier. |
| `upload-agreements` | Upload agreements gate the Files and Videos uploads (the `AGREEMENT_GATING` MFE-config map plus `/api/agreements/v1/`). Declared but with no gating map, the case fails. | `tests/studio/files/agreements.spec.ts` (TC-00501–00507). | `main`, `verawood` (CI sets the map in its Tutor plugin) |

### Optional XBlocks

Component types an author can add to a unit. Each ships with a stock Tutor
image; a target that removed one leaves it undeclared. Blocks the platform bundles
and nobody removes (poll, word cloud, annotatable, …) have no capability, so a
missing one fails.

| Capability | What it means | Tag | Known to support |
| --- | --- | --- | --- |
| `ora` | Open Response Assessment (`openassessment`, edx-ora2). | TC-00221, TC-00115, ORA notifications. | every release CI runs |
| `drag-and-drop-v2` | `drag-and-drop-v2` (xblock-drag-and-drop-v2). | TC-00220. | every release CI runs |
| `pdf-xblock` | `pdf` (xblocks-contrib) under the Advanced tile. | The PDF component and library-PDF cases (TC-00508–00512). | `main`, `verawood` |
| `lti` | `lti_consumer` under the Advanced tile. The block is added and configured; no tool launch is asserted. | TC-00212 (LTI) and the advanced-module matrix. | every release CI runs |
| `scorm` | `scorm` under the Advanced tile. The block is added; no package is played. | TC-00212 (SCORM). | every release CI runs |
| `edx-sga` | Staff Graded Assignment (`edx_sga`) under the Advanced tile. | TC-00212 (SGA) and the matrix. | every release CI runs |

### Roles and permissions (openedx-authz)

| Capability | What it means | Tag | Known to support |
| --- | --- | --- | --- |
| `rbac` | Roles and permissions under openedx-authz: `/api/authz/v1/` and the Roles and Permissions console (the admin-console MFE at `ADMIN_CONSOLE_URL`). Course roles need `authz.enable_course_authoring` per course or org, which the specs set themselves. | `tests/rbac/`. | `main`, `verawood` (openedx-authz 1.23 and 1.21) |
| `rbac-global` | AuthZ course authoring is on for the **whole site**. Never on by default: enabling it locks every unmigrated course's team out of Studio. | TC-00560's first entry point (Studio Home's console link). | not verified in CI: it needs a profile of its own, because it cannot share an install with the rest of the suite |

### Release differences

These mark behaviour that really differs between releases, usually a regression
or a fix, so the gap shows as an undeclared capability rather than a
permanently red case. Declare one where the behaviour is right.

| Capability | What it means | Tag | Known to support |
| --- | --- | --- | --- |
| `rbac-matrix-parity` | The console's library permission matrix matches the API's own permission list. `verawood` (openedx-authz 1.21) renders 14 rows for 11 permissions (wg-build-test-release#609). | The fidelity half of the permission-matrix case. | `main` |
| `rbac-error-view-action` | The console's not-found view offers a working way back. On `main` the action does nothing (`RBAC-008`). | TC-00442. | `verawood` |
| `certificate-web-view` | The certificate web view renders on an install with no marketing site. On `main` it answers 500 (`CERT-002`). | The render half of TC-00033. | `verawood`, `ulmo`, `teak`, `sumac`, `redwood` |
| `recommender-studio-settings` | The recommender's Studio editor shows the settings it saved (recommender-xblock ≥ 5.1.0). `verawood` pins 5.0.0 (`XBLOCK-002`). | TC-00132. | `main` |

### Content

Properties of the catalog and of the configured course (`COURSE_KEY`) that a
default install lacks. A target that has the content declares them. CI's
`extended` profile seeds it (`.ci/seed/extended.sh`).

| Capability | What it means | Tag | Known to support |
| --- | --- | --- | --- |
| `multi-org-catalog` | The catalog lists courses of at least two organizations, so its organization filter can narrow the list. | TC-00017's organization-filter case. | `main`, `verawood` (seeded) |
| `course-intro-video` | The configured course has a YouTube intro video on its About page. The demo course has none. | TC-00013's intro-video case. | `main`, `verawood` (seeded) |
