import { existsSync } from 'node:fs';
import path from 'node:path';

import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

import {
  AccountNotConfiguredError,
  accountSignInStudio,
  provisionAuthorSession,
  provisionLearnerSession,
  withAdminSession,
} from '../accounts';
import { StudioHomePage } from '../pages/studio/home/studio-home.page';
import { StudioCourseOutlinePage } from '../pages/studio/course-outline.page';
import { StudioAdvancedSettingsPage } from '../pages/studio/settings/advanced-settings.page';
import { StudioCertificatesPage } from '../pages/studio/settings/certificates.page';
import { StudioCourseTeamPage } from '../pages/studio/settings/course-team.page';
import { StudioGradingPage } from '../pages/studio/settings/grading.page';
import { StudioGroupConfigurationsPage } from '../pages/studio/settings/group-configurations.page';
import { StudioScheduleDetailsPage } from '../pages/studio/settings/schedule-details.page';
import { StudioPagesResourcesPage } from '../pages/studio/pages-resources/pages-resources.page';
import { StudioExportPage } from '../pages/studio/tools/export.page';
import { StudioImportPage } from '../pages/studio/tools/import.page';
import { StudioChecklistsPage } from '../pages/studio/tools/checklists.page';
import { CourseCreatorAdminPage } from '../pages/studio/admin/course-creator-admin.page';
import { AUTH_STATE_DIR, authStateFile } from '../auth';
import {
  ensureCourse,
  newCourseIdentity,
  studioOrigin,
  type CourseIdentity,
  unitsContaining,
  assertCourseAccessible,
  fetchStudioUsername,
  fetchStudioHome,
  fetchCourseSettingsFlags,
  ensureCertificateBearingMode,
  courseKeySkipReason,
  enrollInCourseViaApi,
  fetchCourseDetail,
  fetchCourseOutline,
  primeCoursewareForLearner,
  fetchCourseProgress,
  newLearnerIdentity,
  type CourseDetail,
  type CourseOutline,
  type CourseProgress,
  type CourseUnit,
  type LearnerIdentity,
} from '../api';
import { getConfig, getRunId, missingCapabilities, TIMEOUTS, type AppConfig } from '../config';
import { AccountSettingsPage } from '../pages/lms/auth/account-settings.page';
import { CatalogPage } from '../pages/lms/catalog/catalog.page';
import { CourseAboutPage } from '../pages/lms/catalog/course-about.page';
import { CourseOutlinePage } from '../pages/lms/course-home/course-outline.page';
import { ProgressPage } from '../pages/lms/course-home/progress.page';
import { DashboardPage } from '../pages/lms/dashboard/dashboard.page';
import { UnitPage } from '../pages/lms/courseware/unit.page';
import { canCompleteUnit } from '../steps/completion';
import { establishStudioBrowserSession, signInToStudioThroughUi } from '../steps/studio';
import { ForgotPasswordPage } from '../pages/lms/auth/forgot-password.page';
import { LoginPage } from '../pages/lms/auth/login.page';
import { RegistrationPage } from '../pages/lms/auth/registration.page';

/**
 * Fixtures the suite adds on top of Playwright's built-ins. Each is composed
 * through this one entry point so specs receive fully-composed, typed objects.
 */
export interface TestFixtures {
  /** Validated suite configuration for the current run. */
  config: AppConfig;
  /** authn MFE `/login` page object. */
  loginPage: LoginPage;
  /** authn MFE `/register` page object. */
  registrationPage: RegistrationPage;
  /** authn MFE `/reset` (forgot-password) page object. */
  forgotPasswordPage: ForgotPasswordPage;
  /** Account settings page object (`frontend-app-account`). */
  accountSettingsPage: AccountSettingsPage;
  /**
   * A fresh, unique-per-run learner identity. Requesting the fixture yields a new
   * identity, so parallel tests never collide (ADR-0002 test-data rules).
   */
  learnerIdentity: LearnerIdentity;
  /**
   * Applied to every spec automatically: skips the test when its tags name a
   * capability the installation has not enabled. Specs never request it.
   */
  capabilityGate: void;
  /** Catalog MFE page object (`frontend-app-catalog`). */
  catalogPage: CatalogPage;
  /** Course About page object. */
  courseAboutPage: CourseAboutPage;
  /** Courseware unit page object (`frontend-app-learning`). */
  unitPage: UnitPage;
  /** Course home (outline tab) page object. */
  courseOutlinePage: CourseOutlinePage;
  /** Course Progress tab page object. */
  progressPage: ProgressPage;
  /** Learner dashboard page object (`frontend-app-learner-dashboard`). */
  dashboardPage: DashboardPage;
  /**
   * The course the course-completion specs work through, from `COURSE_KEY`.
   *
   * Requesting it **skips the test when `COURSE_KEY` is undeclared** — an
   * installation that has not opted into this coverage still runs the rest of the
   * suite — and fails preflight with an actionable message when the key is set but
   * the target does not serve that course.
   */
  courseKey: string;
  /** The course's own identifiers (number, org, title) from the platform. */
  courseDetail: CourseDetail;
  /**
   * A learner of this test's own, freshly provisioned and signed in, with the
   * browser context carrying their session — **not** enrolled in anything.
   *
   * Course state is per-user and mutated by the tests that use it, so each test
   * owns an identity rather than sharing the captured `@authenticated` session
   * (ADR-0002 parallel-safety).
   */
  courseLearner: CourseLearner;
  /** {@link courseLearner}, enrolled in {@link courseKey} through the API. */
  enrolledCourse: EnrolledCourse;
  /** Course structure (units keyed by block ID) as seen by the enrolled learner. */
  courseOutline: CourseOutline;
  /**
   * Re-reads the course structure, picking up per-block `completion` values that
   * have changed since {@link courseOutline} was taken.
   */
  refreshCourseOutline: () => Promise<CourseOutline>;
  /** Reads the authoritative completion/grade state for the enrolled course. */
  courseProgress: () => Promise<CourseProgress>;
  /**
   * One unit per completion mechanism the suite can drive, chosen from the
   * configured course rather than hard-coded — unit order and content differ per
   * installation.
   *
   * Skips the test when the course offers no such unit, so the selection never
   * becomes a conditional inside a spec.
   */
  completionUnits: CompletionUnits;
  /**
   * Gate for Studio coverage: skips unless the installation declares the `studio`
   * capability, and hands the spec the Studio origin as a plain string.
   *
   * Every Studio spec carries the `@studio` tag, which the `capabilityGate`
   * already enforces; this fixture is the belt to that braces, so a Studio spec
   * that forgets the tag still cannot run against a target without Studio.
   */
  studio: string;
  /**
   * Ensures the browser page holds a **fresh, interactive** Studio session as the
   * worker's author, and returns nothing.
   *
   * The studio-author project loads the author's captured state, which keeps its
   * API session alive through the JWT — but the Django session behind Studio's
   * interactive SSO decays within minutes, so a page that only replays the stored
   * cookies is bounced to the login screen once a few other specs have run. This
   * signs the page in through the UI (the author's username, read from the live
   * API session, plus the suite's fixed account password), which is reliable
   * regardless of how long the run has been going. Author-driven browser specs
   * request it before touching Studio; the API `request` fixture stays valid
   * alongside it (a re-login does not invalidate the other session on this
   * platform).
   */
  studioAuthorSession: void;
  /** Studio Home page object (`frontend-app-course-authoring`). */
  studioHomePage: StudioHomePage;
  /** A course's outline in the authoring MFE — where creating a course lands. */
  studioCourseOutlinePage: StudioCourseOutlinePage;
  /** Schedule & Details settings page object (authoring MFE). */
  scheduleDetailsPage: StudioScheduleDetailsPage;
  /** Grading settings page object (authoring MFE). */
  gradingPage: StudioGradingPage;
  /** Advanced Settings page object (authoring MFE). */
  advancedSettingsPage: StudioAdvancedSettingsPage;
  /** Course Team page object (authoring MFE). */
  courseTeamPage: StudioCourseTeamPage;
  /** Group Configurations page object (authoring MFE). */
  groupConfigurationsPage: StudioGroupConfigurationsPage;
  /** Certificates page object (authoring MFE). */
  certificatesPage: StudioCertificatesPage;
  /** Course Export page object (authoring MFE). */
  exportPage: StudioExportPage;
  /** Course Import page object (authoring MFE). */
  importPage: StudioImportPage;
  /** Launch / Best-practices checklists page object (authoring MFE). */
  checklistsPage: StudioChecklistsPage;
  /** Pages & Resources page object (authoring MFE). */
  pagesResourcesPage: StudioPagesResourcesPage;
  /**
   * Makes learners of this test's own for the LMS half of a Studio case: each
   * call provisions a fresh account and returns a request context holding its
   * session, **separate** from the author's `request`. Contexts are disposed when
   * the test ends. A settings case that needs "a learner who has not enrolled"
   * three times over calls it three times.
   */
  newLearner: () => Promise<StudioLearner>;
  /**
   * Gate for the "Certificates available date" fields: skips unless the target
   * lets Schedule & Details show them (`can_show_certificate_available_date_field`,
   * which needs the `certificates.auto_certificate_generation` switch — off on a
   * default install). What TC-00297 needs before it can drive the fields.
   */
  certificateAvailableDateField: void;
  /**
   * Ensures the worker course offers a certificate-bearing mode (`honor`), which
   * the authoring MFE requires before it renders the Certificates form
   * (`STUDIO-006`). Adds it once with the `staff` (superuser) session — the author
   * session may not (403) — and skips the test when no admin account is configured.
   */
  certificateCourseMode: void;
  /**
   * The identity for a course **this test creates** — for the specs whose subject
   * is course creation (§2.4 course budget: nothing else makes a course). Identity
   * only; the spec drives the creation. Unique per test and per retry, in the
   * worker course's organization so the org exists on the target.
   */
  lifecycleCourse: CourseIdentity;
  /**
   * A freshly registered account with a Studio session but **no** course-creator
   * status yet, installed in the browser context — the subject of TC-00310.
   *
   * Skips where the installation grants course creation to every account
   * (`ENABLE_CREATOR_GROUP` off): there is no request-and-grant flow to test.
   */
  studioNewcomer: StudioNewcomer;
  /**
   * A second browser page signed in as the configured admin (`staff` state), for
   * the administrator's half of a case. Skips when no admin account is configured.
   */
  adminPage: Page;
  /** Studio Django admin for course-creator rows, on {@link adminPage}. */
  courseCreatorAdminPage: CourseCreatorAdminPage;
  /**
   * A session allowed to create a course under a **new** organization
   * (`allow_to_create_new_org`), installed in the browser context: the author when
   * the target lets authors do that, otherwise the configured admin. Skips when
   * neither can. What TC-00248 needs.
   */
  newOrgCreator: NewOrgCreator;
}

/** What one {@link TestFixtures.newLearner} call hands a spec. */
export interface StudioLearner {
  readonly identity: LearnerIdentity;
  /** Request context holding this learner's LMS session. */
  readonly request: APIRequestContext;
}

/** What {@link TestFixtures.studioNewcomer} hands a spec. */
export interface StudioNewcomer {
  readonly identity: LearnerIdentity;
  /** Request context holding the newcomer's LMS + Studio session. */
  readonly request: APIRequestContext;
}

/** What {@link TestFixtures.newOrgCreator} hands a spec. */
export interface NewOrgCreator {
  /** Request context holding the creator's session (author or admin). */
  readonly request: APIRequestContext;
  /** Which role the session belongs to. */
  readonly role: 'author' | 'staff';
}

/**
 * Fixtures shared by every test a worker runs. Worker scope is what keeps the
 * per-run Studio course count down: there is no course-deletion API, so a course
 * per *test* would leave dozens behind on a persistent target.
 */
export interface WorkerFixtures {
  /**
   * The author this worker acts as, in the `studio-author` project: a fresh
   * account, provisioned and granted course-creator status on first use, with its
   * LMS + Studio session captured to a worker-specific state file that the
   * `page` and `request` fixtures then load instead of the project's shared
   * author state.
   *
   * Why per worker rather than the one `setup` captured: the platform's
   * `PREVENT_CONCURRENT_LOGINS` (on by default) kills a user's other sessions on
   * every sign-in, and the browser specs sign the author in through the UI per
   * test (see `studioAuthorSession`). With one author shared by several workers,
   * each worker's sign-in bounced the others' browsers back to the login screen
   * mid-test. One author per worker keeps every sign-in inside the worker whose
   * previous test has already finished with the session.
   *
   * `undefined` outside the `studio-author` project, where nothing needs it.
   * Skips the worker's tests when the author cannot be provisioned for lack of
   * configuration (no admin to grant with), like the `setup` project does.
   */
  workerAuthor: WorkerAuthor | undefined;
  /**
   * The course the Studio settings specs act on — one per worker, created on
   * first use through the Studio API by the `author` session the project loaded,
   * and idempotent per (run, worker) so a retried worker lands on the same
   * course rather than a new one.
   *
   * Two workers never share a course, which is what makes the settings specs
   * parallel-safe while the author account is shared. A spec whose subject *is*
   * course creation (or that must archive a course) creates its own instead of
   * mutating this one.
   *
   * Only meaningful in the `studio-author` project: it reads the author state
   * file that project loads, and fails with a pointer here when it is missing.
   */
  authoredCourse: AuthoredCourse;
}

/** What {@link WorkerFixtures.workerAuthor} holds. */
export interface WorkerAuthor {
  readonly identity: LearnerIdentity;
  /** Storage state (LMS + Studio session) the worker's contexts load. */
  readonly stateFile: string;
}

/** What {@link WorkerFixtures.authoredCourse} hands a spec. */
export interface AuthoredCourse extends CourseIdentity {
  /** The course's Studio URL (redirects to the authoring MFE where applicable). */
  readonly studioUrl: string;
}

/** What {@link TestFixtures.courseLearner} hands a spec. */
export interface CourseLearner {
  readonly courseKey: string;
  readonly identity: LearnerIdentity;
}

/** Units chosen for {@link TestFixtures.completionUnits}. */
export interface CompletionUnits {
  /** A unit whose blocks all complete by being viewed (no problem, no video). */
  readonly viewOnly: CourseUnit;
  /** A unit containing a problem, and nothing the suite cannot drive. */
  readonly withProblem: CourseUnit;
  /**
   * A whole subsection the suite can complete — every one of its units is
   * drivable — for coverage about subsection-level state. The smallest such
   * subsection, since each unit costs the platform's dwell delay per block.
   */
  readonly drivableSubsection: {
    readonly sequentialId: string;
    readonly units: readonly CourseUnit[];
  };
}

/** What {@link TestFixtures.enrolledCourse} hands a spec. */
export type EnrolledCourse = CourseLearner;

/**
 * The composition root. Specs import `test`/`expect` from here (not directly from
 * `@playwright/test`) so they receive fully-composed, typed objects.
 *
 * Requesting `config` also fails fast with a clear {@link ConfigError} when the
 * environment is invalid, rather than surfacing later as a confusing navigation
 * failure.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  // eslint-disable-next-line no-empty-pattern
  config: async ({}, use) => {
    await use(getConfig());
  },

  loginPage: async ({ page, config }, use) => {
    await use(new LoginPage(page, config));
  },

  registrationPage: async ({ page, config }, use) => {
    await use(new RegistrationPage(page, config));
  },

  forgotPasswordPage: async ({ page, config }, use) => {
    await use(new ForgotPasswordPage(page, config));
  },

  accountSettingsPage: async ({ page, config }, use) => {
    await use(new AccountSettingsPage(page, config));
  },

  // eslint-disable-next-line no-empty-pattern
  learnerIdentity: async ({}, use) => {
    await use(newLearnerIdentity());
  },

  /**
   * Capability gate (ADR-0002, "Runnable by any provider against their own
   * installation"). A spec tagged `@discussions` runs only where discussions are
   * declared; one tagged `@mfe-authn` runs unless the installation has opted out
   * of the authn MFE. Skipping here — rather than in each test body — is what
   * keeps the gate uniform and the specs free of configuration logic.
   */
  capabilityGate: [
    async ({ config }, use, testInfo) => {
      const missing = missingCapabilities(testInfo.tags, config.capabilities);
      testInfo.skip(
        missing.length > 0,
        `Installation does not have: ${missing.join(', ')}. Declare ${missing.length === 1 ? 'it' : 'them'} in CAPABILITIES to run this spec.`,
      );
      await use();
    },
    { auto: true },
  ],
  catalogPage: async ({ page, config }, use) => {
    await use(new CatalogPage(page, config));
  },

  courseAboutPage: async ({ page, config }, use) => {
    await use(new CourseAboutPage(page, config));
  },

  unitPage: async ({ page, config }, use) => {
    await use(new UnitPage(page, config));
  },

  courseOutlinePage: async ({ page, config }, use) => {
    await use(new CourseOutlinePage(page, config));
  },

  progressPage: async ({ page, config }, use) => {
    await use(new ProgressPage(page, config));
  },

  dashboardPage: async ({ page, config }, use) => {
    await use(new DashboardPage(page, config));
  },

  courseKey: async ({ request, config }, use) => {
    const skipReason = courseKeySkipReason(config);
    base.skip(skipReason !== undefined, skipReason);
    // Narrowing: courseKeySkipReason returns undefined only when courseKey is set.
    const courseKey = config.courseKey as string;

    await assertCourseAccessible(request, config, courseKey);
    await use(courseKey);
  },

  courseDetail: async ({ request, config, courseKey }, use) => {
    await use(await fetchCourseDetail(request, config, courseKey));
  },

  courseLearner: async ({ page, request, config, courseKey }, use) => {
    // One seam for "a learner whose session `request` holds", shared with the auth
    // provider — see `provisionLearnerSession` for why this must not sign in on
    // top of the session registration already created.
    const identity = await provisionLearnerSession(request, config);

    // Hand the API session to the browser, replacing whatever storage state the
    // project loaded, so the page drives the course as this test's own learner.
    await page.context().clearCookies();
    await page.context().addCookies((await request.storageState()).cookies);

    await use({ courseKey, identity });
  },

  enrolledCourse: async ({ request, config, courseLearner }, use) => {
    await enrollInCourseViaApi(request, config, courseLearner.courseKey);
    await use(courseLearner);
  },

  courseOutline: async ({ request, config, enrolledCourse }, use) => {
    const outline = await fetchCourseOutline(
      request,
      config,
      enrolledCourse.courseKey,
      enrolledCourse.identity.username,
    );
    // Every courseware spec passes through here with a fresh learner, so this is
    // where the learner's first block render is serialized ahead of the browser
    // (see `primeCoursewareForLearner` for the platform race it sidesteps).
    const firstSequential = outline.units[0]?.sequentialId;
    if (firstSequential !== undefined) {
      await primeCoursewareForLearner(request, config, firstSequential);
    }
    await use(outline);
  },

  refreshCourseOutline: async ({ request, config, enrolledCourse }, use) => {
    await use(() =>
      fetchCourseOutline(
        request,
        config,
        enrolledCourse.courseKey,
        enrolledCourse.identity.username,
      ),
    );
  },

  courseProgress: async ({ request, config, enrolledCourse }, use) => {
    await use(() => fetchCourseProgress(request, config, enrolledCourse.courseKey));
  },

  studio: async ({ config }, use) => {
    base.skip(
      !config.capabilities.has('studio'),
      'Studio coverage needs the "studio" capability (and CMS_BASE_URL). Declare it in ' +
        'CAPABILITIES to enable the tests/studio/ tree.',
    );
    await use(studioOrigin(config));
  },

  workerAuthor: [
    async ({ playwright }, use, workerInfo) => {
      // Only the project that runs as the author needs one; it is recognised by
      // the state file it was configured to load.
      if (workerInfo.project.use.storageState !== authStateFile('author')) {
        await use(undefined);
        return;
      }
      const config = getConfig();
      const stateFile = path.join(AUTH_STATE_DIR, `author-worker-${workerInfo.parallelIndex}.json`);
      const request = await playwright.request.newContext();
      try {
        // Playwright replaces a worker after a failure, keeping its slot. The
        // replacement must carry on as the same author — it owns the slot's
        // course — so a state file the slot already wrote this run is reused
        // rather than a second author provisioned. Global setup clears `.auth/`,
        // so nothing older than the run can be picked up.
        if (existsSync(stateFile)) {
          const resumed = await playwright.request.newContext({ storageState: stateFile });
          try {
            const username = await fetchStudioUsername(resumed, config);
            await use({ identity: newLearnerIdentity({ username }), stateFile });
            return;
          } finally {
            await resumed.dispose();
          }
        }
        // Grant with the admin session `setup` captured where it is still there,
        // rather than signing the admin in once per worker.
        const staffState = authStateFile('staff');
        let identity: LearnerIdentity;
        try {
          identity = await provisionAuthorSession(request, config, {
            adminStorageState: existsSync(staffState) ? staffState : undefined,
          });
        } catch (error) {
          if (error instanceof AccountNotConfiguredError) {
            base.skip(true, error.message);
          }
          throw error;
        }
        await request.storageState({ path: stateFile });
        await use({ identity, stateFile });
      } finally {
        await request.dispose();
      }
    },
    { scope: 'worker', timeout: TIMEOUTS.studioSetup },
  ],

  // The `page` and `request` contexts load the worker's own author when there is
  // one, and whatever the project configured otherwise.
  storageState: async ({ workerAuthor }, use, testInfo) => {
    await use(workerAuthor?.stateFile ?? testInfo.project.use.storageState);
  },

  authoredCourse: [
    async ({ playwright, workerAuthor }, use, workerInfo) => {
      const config = getConfig();
      if (workerAuthor === undefined) {
        throw new Error(
          'authoredCourse needs the worker author, which only the "studio-author" project ' +
            'provides. Run Studio specs in that project.',
        );
      }
      const authorState = workerAuthor.stateFile;

      // The identity is keyed on the run id (shared by all workers, minted in
      // global setup) and this worker's parallel slot, so a restarted worker
      // reuses its predecessor's course instead of creating another.
      const identity = newCourseIdentity(config, getRunId(), `W${workerInfo.parallelIndex}`);

      const request = await playwright.request.newContext({ storageState: authorState });
      try {
        const courseKey = await ensureCourse(request, config, identity);
        await use({
          ...identity,
          courseKey,
          studioUrl: `${studioOrigin(config)}/course/${courseKey}`,
        });
      } finally {
        await request.dispose();
      }
    },
    { scope: 'worker', timeout: TIMEOUTS.studioSetup },
  ],

  studioAuthorSession: async ({ page, config, studio }, use) => {
    void studio;
    // The page already carries the worker author's browser-usable LMS session
    // (the studio-author project loads its storage state), so the Studio session
    // is completed off that — a silent SSO handshake, no credential entry. A
    // per-test UI login would re-authenticate the same author on every Studio
    // test, and with one worker running the whole Studio suite against a single
    // author that trips the LMS login rate limit (30 / 5 min); this signs in
    // zero times.
    await establishStudioBrowserSession(page, config);
    await use();
  },

  studioHomePage: async ({ page, config }, use) => {
    await use(new StudioHomePage(page, config));
  },

  studioCourseOutlinePage: async ({ page, config }, use) => {
    await use(new StudioCourseOutlinePage(page, config));
  },

  scheduleDetailsPage: async ({ page, config }, use) => {
    await use(new StudioScheduleDetailsPage(page, config));
  },

  gradingPage: async ({ page, config }, use) => {
    await use(new StudioGradingPage(page, config));
  },

  advancedSettingsPage: async ({ page, config }, use) => {
    await use(new StudioAdvancedSettingsPage(page, config));
  },

  courseTeamPage: async ({ page, config }, use) => {
    await use(new StudioCourseTeamPage(page, config));
  },

  groupConfigurationsPage: async ({ page, config }, use) => {
    await use(new StudioGroupConfigurationsPage(page, config));
  },

  certificatesPage: async ({ page, config }, use) => {
    await use(new StudioCertificatesPage(page, config));
  },

  exportPage: async ({ page, config }, use) => {
    await use(new StudioExportPage(page, config));
  },

  importPage: async ({ page, config }, use) => {
    await use(new StudioImportPage(page, config));
  },

  checklistsPage: async ({ page, config }, use) => {
    await use(new StudioChecklistsPage(page, config));
  },

  pagesResourcesPage: async ({ page, config }, use) => {
    await use(new StudioPagesResourcesPage(page, config));
  },

  newLearner: async ({ playwright, config }, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async () => {
      const request = await playwright.request.newContext();
      contexts.push(request);
      const identity = await provisionLearnerSession(request, config);
      return { identity, request };
    });
    await Promise.all(contexts.map((context) => context.dispose()));
  },

  certificateAvailableDateField: async ({ request, config, authoredCourse }, use) => {
    const flags = await fetchCourseSettingsFlags(request, config, authoredCourse.courseKey);
    base.skip(
      !flags.canShowCertificateAvailableDateField,
      'Schedule & Details does not offer the "Certificates available date" fields on this ' +
        'installation (can_show_certificate_available_date_field is false; enable the ' +
        'certificates.auto_certificate_generation switch to cover TC-00297).',
    );
    await use();
  },

  certificateCourseMode: async ({ playwright, config, authoredCourse }, use) => {
    const staffState = authStateFile('staff');
    base.skip(
      config.credentials.admin === undefined || !existsSync(staffState),
      'Certificates need a certificate-bearing course mode, which only a staff/superuser ' +
        'session can add (the author session is refused). Set ADMIN_USERNAME and ADMIN_PASSWORD.',
    );
    const staff = await playwright.request.newContext({ storageState: staffState });
    try {
      await ensureCertificateBearingMode(staff, config, authoredCourse.courseKey);
    } finally {
      await staff.dispose();
    }
    await use();
  },

  lifecycleCourse: async ({ config, authoredCourse }, use, testInfo) => {
    // Stable per test (the test id hashes file + title), distinct per retry so a
    // retried creation is never refused as a duplicate of its own first attempt.
    const slot = `L${testInfo.testId.replace(/[^\w]/g, '').slice(-6)}R${testInfo.retry}`;
    const identity = newCourseIdentity(
      { ...config, org: authoredCourse.org },
      getRunId(),
      slot,
      'lifecycle',
    );
    await use(identity);
  },

  studioNewcomer: async ({ page, playwright, config, studio }, use) => {
    void studio;
    const request = await playwright.request.newContext();
    try {
      const identity = await provisionLearnerSession(request, config);
      await accountSignInStudio({
        config,
        request,
        credentials: { emailOrUsername: identity.email, password: identity.password },
      });
      const home = await fetchStudioHome(request, config);
      base.skip(
        home.courseCreatorStatus === 'granted',
        'This installation grants course creation to every account (ENABLE_CREATOR_GROUP ' +
          'off), so there is no course-creator request to make or grant.',
      );
      base.skip(
        home.courseCreatorStatus === 'disallowed_for_this_site',
        'Course creation is disallowed for this site, so no request can be made.',
      );
      await page.context().clearCookies();
      await page.context().addCookies((await request.storageState()).cookies);
      await use({ identity, request });
    } finally {
      await request.dispose();
    }
  },

  adminPage: async ({ browser, config }, use) => {
    const admin = config.credentials.admin;
    base.skip(
      admin === undefined,
      'This case needs the administrator: set ADMIN_USERNAME and ADMIN_PASSWORD (a superuser).',
    );
    // A fresh context signed in through the UI: the admin's captured API session
    // does not drive the interactive Studio SSO (see signInToStudioThroughUi).
    // Held under the admin-session lock for the whole test: another worker's
    // admin sign-in would end this browser's session (PREVENT_CONCURRENT_LOGINS).
    await withAdminSession(async () => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await signInToStudioThroughUi(page, config, {
          emailOrUsername: (admin as NonNullable<typeof admin>).username,
          password: (admin as NonNullable<typeof admin>).password,
        });
        await use(page);
      } finally {
        await context.close();
      }
    });
  },

  courseCreatorAdminPage: async ({ adminPage, config }, use) => {
    await use(new CourseCreatorAdminPage(adminPage, config));
  },

  newOrgCreator: async ({ page, playwright, request, config, studio }, use) => {
    void studio;
    // When the author's own session may create organizations, the project page is
    // already the right session — the free-text org field is on screen.
    const authorHome = await fetchStudioHome(request, config);
    if (authorHome.allowToCreateNewOrg) {
      await use({ request, role: 'author' });
      return;
    }
    // Otherwise only a superuser's UI offers it. Sign the project page in as the
    // admin through the UI (a captured admin session does not drive Studio SSO in
    // the browser), and hand the spec an admin API context for its assertions.
    const admin = config.credentials.admin;
    const state = authStateFile('staff');
    base.skip(
      admin === undefined || !existsSync(state),
      'Authors may not create organizations on this installation (allow_to_create_new_org ' +
        'is off) and no admin account is configured to do it instead. Set ADMIN_USERNAME ' +
        'and ADMIN_PASSWORD, or allow authors to create organizations.',
    );
    // Under the admin-session lock for the whole test, like `adminPage`.
    await withAdminSession(async () => {
      await signInToStudioThroughUi(page, config, {
        emailOrUsername: (admin as NonNullable<typeof admin>).username,
        password: (admin as NonNullable<typeof admin>).password,
      });
      const staff = await playwright.request.newContext({ storageState: state });
      try {
        await use({ request: staff, role: 'staff' });
      } finally {
        await staff.dispose();
      }
    });
  },

  completionUnits: async ({ courseOutline }, use) => {
    const viewOnly = courseOutline.units.find(
      (unit) => unit.childTypes.length > 0 && unit.childTypes.every((type) => type === 'html'),
    );
    const withProblem = unitsContaining(courseOutline, 'problem').find(canCompleteUnit);

    // Group units by subsection and keep those the suite can complete end to end.
    const bySubsection = new Map<string, CourseUnit[]>();
    for (const unit of courseOutline.units) {
      bySubsection.set(unit.sequentialId, [...(bySubsection.get(unit.sequentialId) ?? []), unit]);
    }
    const drivableSubsection = [...bySubsection.entries()]
      .filter(([, units]) => units.length > 0 && units.every(canCompleteUnit))
      .sort((left, right) => left[1].length - right[1].length)
      .map(([sequentialId, units]) => ({ sequentialId, units }))[0];

    base.skip(
      viewOnly === undefined || withProblem === undefined || drivableSubsection === undefined,
      `The configured course offers no unit for every completion mechanism ` +
        `(view-only: ${viewOnly ? 'found' : 'missing'}, ` +
        `problem: ${withProblem ? 'found' : 'missing'}, ` +
        `fully drivable subsection: ${drivableSubsection ? 'found' : 'missing'}).`,
    );

    await use({
      viewOnly: viewOnly as CourseUnit,
      withProblem: withProblem as CourseUnit,
      drivableSubsection: drivableSubsection as CompletionUnits['drivableSubsection'],
    });
  },
});

export { expect };
