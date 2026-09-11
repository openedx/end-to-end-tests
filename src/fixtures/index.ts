import path from 'node:path';

import {
  test as base,
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type PlaywrightWorkerArgs,
} from '@playwright/test';

import {
  AccountNotConfiguredError,
  accountSignInStudio,
  provisionAuthorSession,
  provisionLearnerSession,
  reauthenticateStudioAuthor,
  withAdminSession,
} from '../accounts';
import { StudioHomePage } from '../pages/studio/home/studio-home.page';
import { StudioCourseOutlinePage } from '../pages/studio/course-outline.page';
import { StudioOutlineConfigureDialog } from '../pages/studio/outline-configure.dialog';
import { StudioUnitPage } from '../pages/studio/unit.page';
import { StudioAdvancedSettingsPage } from '../pages/studio/settings/advanced-settings.page';
import { StudioCertificatesPage } from '../pages/studio/settings/certificates.page';
import { StudioCourseTeamPage } from '../pages/studio/settings/course-team.page';
import { StudioGradingPage } from '../pages/studio/settings/grading.page';
import { StudioGroupConfigurationsPage } from '../pages/studio/settings/group-configurations.page';
import { StudioScheduleDetailsPage } from '../pages/studio/settings/schedule-details.page';
import { StudioPagesResourcesPage } from '../pages/studio/pages-resources/pages-resources.page';
import { StudioCustomPagesPage } from '../pages/studio/custom-pages/custom-pages.page';
import { StudioExportPage } from '../pages/studio/tools/export.page';
import { StudioImportPage } from '../pages/studio/tools/import.page';
import { StudioChecklistsPage } from '../pages/studio/tools/checklists.page';
import { CourseCreatorAdminPage } from '../pages/studio/admin/course-creator-admin.page';
import { AUTH_STATE_DIR, authStateFile, isUsableStateFile, persistStorageState } from '../auth';
import {
  buildSection,
  DEFAULT_SECTION_SHAPE,
  ensureCourse,
  establishStudioSession,
  fetchCourseNavigation,
  fetchSequenceMetadata,
  updateAdvancedSettings,
  updateCourseDetails,
  type AuthoredSection,
  type SectionShape,
  StudioSessionExpiredError,
  newCourseIdentity,
  studioOrigin,
  type CourseIdentity,
  unitsContaining,
  assertCourseAccessible,
  fetchStudioUsername,
  DEFAULT_PASSWORD,
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
   * Ensures the browser page holds an interactive Studio session as the worker's
   * author, and returns nothing.
   *
   * The studio-author project loads the author's captured state, and normally the
   * page completes Studio's SSO silently off it — no login, so the login rate
   * limit is untouched. But the stored Django session can be lost mid-run — the
   * cache backing sessions is flushed or evicted (a service restart does this), or
   * a safe-sessions user mismatch forces a logout — and the page is then bounced to
   * the authn login MFE. When that happens this recovers with a single UI sign-in
   * and **persists the refreshed session back to the worker's state file**, so the
   * rest of the worker's Studio specs reuse the live session instead of each
   * re-signing-in (which would press the rate limit). The API `request` fixture
   * stays valid alongside it (a re-login does not invalidate the other session on
   * this platform). This does not cover the separate ~1h JWT-cookie clock the API
   * `request` replays — a run over an hour needs session+CSRF API auth instead.
   */
  studioAuthorSession: void;
  /** Studio Home page object (`frontend-app-course-authoring`). */
  studioHomePage: StudioHomePage;
  /** A course's outline in the authoring MFE — where creating a course lands. */
  studioCourseOutlinePage: StudioCourseOutlinePage;
  /** The Configure dialog opened from an outline card (release dates, visibility, grading, prerequisites). */
  outlineConfigureDialog: StudioOutlineConfigureDialog;
  /** The unit (container) page object. */
  studioUnitPage: StudioUnitPage;
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
  /** Custom Pages page object (authoring MFE). */
  customPagesPage: StudioCustomPagesPage;
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
  /**
   * A section of this test's own in the worker's {@link WorkerFixtures.contentCourse},
   * built through the xblock API in the default shape (one subsection, one unit
   * with a text block and a multiple-choice problem), units left **unpublished**
   * so publishing is the spec's own act. Named after the test and run, so two
   * tests sharing the course never confuse their content and a spec may match
   * these names in the LMS as its own data.
   */
  ownSection: AuthoredSection;
  /**
   * Builds further sections of this test's own in the content course, for specs
   * whose case needs a different shape (a graded subsection, a gating pair, a
   * video unit). Each call gets a distinct label.
   */
  authorSection: (shape?: SectionShape, label?: string) => Promise<AuthoredSection>;
  /**
   * The learner half of a round trip: a fresh account enrolled in the content
   * course, holding its **own** browser context and request context so the
   * author's session on `page`/`request` is never touched (the platform's
   * `PREVENT_CONCURRENT_LOGINS` would otherwise evict one of them). Both
   * contexts are disposed when the test ends.
   */
  roundTripLearner: RoundTripLearner;
  /**
   * Two independent {@link roundTripLearner}s — for a case whose point is that
   * two learners see different content (a cohort-restricted unit).
   */
  roundTripLearners: readonly [RoundTripLearner, RoundTripLearner];
  /** A {@link roundTripLearner} enrolled in the not-yet-started {@link WorkerFixtures.futureCourse}. */
  futureCourseLearner: RoundTripLearner;
  /**
   * A **fresh, empty** course of this test's own (seeded with a past start date),
   * for specs that build the outline through the UI. Unlike the shared
   * {@link WorkerFixtures.contentCourse}, its outline holds only what the test
   * creates, so `.last()`/`.first()` card lookups are unambiguous and the page
   * stays light — which matters for the New-section/subsection/unit flow on a
   * slower MFE. One course per test that asks.
   */
  authoringCourse: AuthoredCourse;
  /** A {@link roundTripLearner} enrolled in this test's {@link authoringCourse}. */
  authoringCourseLearner: RoundTripLearner;
}

/** What {@link TestFixtures.roundTripLearner} hands a spec. */
export interface RoundTripLearner {
  readonly identity: LearnerIdentity;
  readonly courseKey: string;
  /** Request context holding this learner's LMS session. */
  readonly request: APIRequestContext;
  /** Browser context (and its one page) carrying the same session. */
  readonly context: BrowserContext;
  readonly page: Page;
  /** Courseware unit page object bound to this learner's page. */
  readonly unitPage: UnitPage;
  /** Course-home outline page object bound to this learner's page. */
  readonly courseOutlinePage: CourseOutlinePage;
  /**
   * The course structure **as this learner sees it** (Blocks API): unreleased,
   * hidden, group-restricted and unsatisfied-gated blocks are absent. The
   * outcome reading of every visibility round trip — poll it under
   * `TIMEOUTS.contentPublish` after an authoring change.
   */
  outline: () => Promise<CourseOutline>;
  /** One subsection as this learner sees it, or `undefined` when it is not served to them. */
  sequence: (sequentialId: string) => ReturnType<typeof fetchSequenceMetadata>;
  /** The course-home navigation model as this learner sees it. */
  navigation: () => ReturnType<typeof fetchCourseNavigation>;
  /**
   * Renders one subsection for this learner through the API before the browser
   * does — the AnonymousUserId race workaround (`primeCoursewareForLearner`).
   * Call it with the test's own subsection before opening a unit in the browser.
   */
  prime: (sequentialId: string) => Promise<void>;
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
   * every sign-in. `studioAuthorSession` normally completes Studio SSO silently
   * (no login), but recovers a decayed session with a UI re-login — and with one
   * author shared by several workers, each such re-login bounced the others'
   * browsers back to the login screen mid-test. One author per worker keeps every
   * sign-in inside the worker whose
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
  /**
   * The course the authoring round-trip specs build content in — one per worker,
   * distinct from {@link authoredCourse} because the settings specs move that
   * course's schedule and enrollment window around, which would make a learner's
   * ability to enroll here depend on test order. Seeded once: start date in the
   * past (a new course starts in 2040 by default) and subsection gating enabled.
   * Specs share it **by section**: each builds its own (`ownSection`) and never
   * touches another test's.
   */
  contentCourse: AuthoredCourse;
  /**
   * A course left at its default **future** start date (2040), never edited: what
   * the future-dated publish cases need, and the destination for cross-course
   * paste. One per worker.
   */
  futureCourse: AuthoredCourse;
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
/**
 * Builds a test fixture that hands the spec a page object constructed from the
 * `page` and `config` fixtures — the shape almost every page-object fixture takes.
 * Playwright reads the returned function's destructured parameters to wire its
 * dependencies, so `{ page, config }` stays declared here rather than hidden.
 */
function pageObjectFixture<T>(
  Ctor: new (page: Page, config: AppConfig) => T,
): (args: { page: Page; config: AppConfig }, use: (value: T) => Promise<void>) => Promise<void> {
  return async ({ page, config }, use) => {
    await use(new Ctor(page, config));
  };
}

/**
 * The fixed, far-past start date the content course gets, so every learner the
 * suite enrolls can reach its content. A constant rather than "now": the
 * release-date specs place their own dates on either side of it.
 */
export const CONTENT_COURSE_START = '2000-01-01T00:00:00Z';

/**
 * Provisions one worker-scoped course as the worker's author — the body every
 * worker-course fixture shares (`authoredCourse`, `contentCourse`, `futureCourse`).
 *
 * Creates the course for `identity` (idempotently: a restarted worker lands on
 * its predecessor's course), recovering once from a Studio session that the CI
 * target evicted from its shared cache (it does so spuriously, at any time, with
 * no logout event). This is also the immediate, self-verifying check that the
 * just-provisioned author can actually author: a genuinely broken session fails
 * loudly here at worker setup instead of cascading through every spec. Loads the
 * captured session if the file is intact; a torn one (an OOM kill mid-write) opens
 * anonymous and the create's recovery signs in fresh.
 *
 * `seed` runs after the course exists, on the same authenticated context, for
 * the one-time settings a fixture needs on its course; it must be idempotent.
 */
async function provisionWorkerCourse(
  playwright: PlaywrightWorkerArgs['playwright'],
  workerAuthor: WorkerAuthor | undefined,
  identity: CourseIdentity,
  seed?: (request: APIRequestContext, courseKey: string) => Promise<void>,
): Promise<AuthoredCourse> {
  const config = getConfig();
  if (workerAuthor === undefined) {
    throw new Error(
      `The worker course ${identity.courseKey} needs the worker author, which only the ` +
        '"studio-author" project provides. Run Studio specs in that project.',
    );
  }
  const authorState = workerAuthor.stateFile;
  const credentials = {
    emailOrUsername: workerAuthor.identity.username,
    password: DEFAULT_PASSWORD,
  };

  let request = await playwright.request.newContext(
    isUsableStateFile(authorState) ? { storageState: authorState } : {},
  );
  try {
    // Best-effort: give this context a Studio session off the captured LMS
    // session (the silent SSO handshake; a no-op when it already has one) and
    // persist it so the per-test `request`/`page` contexts that load the state
    // file start authenticated too. If the captured session is already gone the
    // handshake cannot establish one — fall through, the create below detects
    // that and recovers.
    try {
      await establishStudioSession(request, config);
      persistStorageState(await request.storageState(), authorState);
    } catch {
      // Left to the create's own recovery below.
    }

    let courseKey: string;
    try {
      courseKey = await ensureCourse(request, config, identity);
    } catch (error) {
      if (!(error instanceof StudioSessionExpiredError)) throw error;
      // The captured session was gone and cannot be recovered in place — a
      // credential sign-in is refused on a jar that still holds session cookies,
      // and an `APIRequestContext` cannot clear them. So sign in fresh on a clean
      // context, persist it for the per-test contexts, and retry the create.
      await request.dispose();
      request = await playwright.request.newContext();
      await reauthenticateStudioAuthor(request, config, credentials);
      persistStorageState(await request.storageState(), authorState);
      courseKey = await ensureCourse(request, config, identity);
    }
    if (seed !== undefined) {
      await seed(request, courseKey);
    }
    return {
      ...identity,
      courseKey,
      studioUrl: `${studioOrigin(config)}/course/${courseKey}`,
    };
  } finally {
    await request.dispose();
  }
}

/**
 * A learner of the test's own, enrolled in `courseKey`, with a request context
 * and a browser context both carrying the session. The caller disposes both.
 */
async function provisionRoundTripLearner(
  playwright: PlaywrightWorkerArgs['playwright'],
  browser: Browser,
  config: AppConfig,
  courseKey: string,
): Promise<RoundTripLearner> {
  const request = await playwright.request.newContext();
  const identity = await provisionLearnerSession(request, config);
  await enrollInCourseViaApi(request, config, courseKey);
  const context = await browser.newContext();
  await context.addCookies((await request.storageState()).cookies);
  const page = await context.newPage();
  return {
    identity,
    courseKey,
    request,
    context,
    page,
    unitPage: new UnitPage(page, config),
    courseOutlinePage: new CourseOutlinePage(page, config),
    outline: () => fetchCourseOutline(request, config, courseKey, identity.username),
    sequence: (sequentialId) => fetchSequenceMetadata(request, config, sequentialId),
    navigation: () => fetchCourseNavigation(request, config, courseKey),
    prime: (sequentialId) => primeCoursewareForLearner(request, config, sequentialId),
  };
}

async function disposeRoundTripLearner(learner: RoundTripLearner): Promise<void> {
  await learner.context.close();
  await learner.request.dispose();
}

/**
 * Ensures the per-test `request` context holds a **live Studio Django session**
 * before it drives the legacy session-authed xblock writes (`POST /xblock/`).
 *
 * The context loads the worker author's captured state, whose Studio session may
 * have been evicted by a later CMS login of the same author (the three
 * worker-course fixtures each establish one; `PREVENT_CONCURRENT_LOGINS` keeps
 * only the last). The write then 302s to sign-in — a JWT read like
 * `fetchXBlockOutline` survives, but the session-only write cannot. The SSO
 * handshake trades the still-live LMS session on this context for a fresh Studio
 * session, which is exactly what those writes need. Idempotent: a no-op when the
 * session is already live.
 */
async function establishAuthorWriteSession(
  request: APIRequestContext,
  config: AppConfig,
): Promise<void> {
  await establishStudioSession(request, config);
}

/** A section label unique to this test and run, safe to match as the test's own data. */
function sectionLabel(testInfo: { testId: string; retry: number }, ordinal: number): string {
  return `E2E ${getRunId()} ${testInfo.testId.slice(-6)}R${testInfo.retry} S${ordinal}`;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // eslint-disable-next-line no-empty-pattern
  config: async ({}, use) => {
    await use(getConfig());
  },

  loginPage: pageObjectFixture(LoginPage),

  registrationPage: pageObjectFixture(RegistrationPage),

  forgotPasswordPage: pageObjectFixture(ForgotPasswordPage),

  accountSettingsPage: pageObjectFixture(AccountSettingsPage),

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
  catalogPage: pageObjectFixture(CatalogPage),

  courseAboutPage: pageObjectFixture(CourseAboutPage),

  unitPage: pageObjectFixture(UnitPage),

  courseOutlinePage: pageObjectFixture(CourseOutlinePage),

  progressPage: pageObjectFixture(ProgressPage),

  dashboardPage: pageObjectFixture(DashboardPage),

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
        if (isUsableStateFile(stateFile)) {
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
            adminStorageState: isUsableStateFile(staffState) ? staffState : undefined,
          });
        } catch (error) {
          if (error instanceof AccountNotConfiguredError) {
            base.skip(true, error.message);
          }
          throw error;
        }
        persistStorageState(await request.storageState(), stateFile);
        await use({ identity, stateFile });
      } finally {
        await request.dispose();
      }
    },
    { scope: 'worker', timeout: TIMEOUTS.studioSetup },
  ],

  // The `page` and `request` contexts load the worker's own author when there is
  // one, and whatever the project configured otherwise. Both the session cookie
  // and the JWT are kept: a call then survives as long as *either* is valid —
  // Playwright drops the JWT once it is past its ~1h expiry, leaving the fortnight
  // session cookie to carry reads/writes, while the JWT covers the window where the
  // session itself has decayed (a cache flush or eviction) but is not yet renewed.
  // (Stripping the JWT to force session-only auth was tried and reverted: it left
  // API calls with no fallback the moment the session decayed — a 401 under load.)
  storageState: async ({ playwright, workerAuthor, config }, use, testInfo) => {
    // On a retry of a worker-author test, refresh the persisted Studio session
    // before the `page`/`request` contexts load it. The previous attempt may have
    // failed because the memory-constrained CI evicted the session from its shared
    // cache mid-run, and the state file still holds the dead one; a fresh sign-in
    // (on a clean context — a login is refused on a jar that still holds session
    // cookies) restores it for both contexts. Gated on `retry > 0` so a healthy
    // first attempt spends no login and never presses the LMS login rate limit —
    // only a test that already failed pays for the recovery. This is the API-side
    // counterpart to `studioAuthorSession`'s in-test browser recovery.
    if (workerAuthor !== undefined && testInfo.retry > 0) {
      const fresh = await playwright.request.newContext();
      try {
        await reauthenticateStudioAuthor(fresh, config, {
          emailOrUsername: workerAuthor.identity.username,
          password: DEFAULT_PASSWORD,
        });
        persistStorageState(await fresh.storageState(), workerAuthor.stateFile);
      } finally {
        await fresh.dispose();
      }
    }
    await use(workerAuthor?.stateFile ?? testInfo.project.use.storageState);
  },

  authoredCourse: [
    async ({ playwright, workerAuthor }, use, workerInfo) => {
      // The identity is keyed on the run id (shared by all workers, minted in
      // global setup) and this worker's parallel slot, so a restarted worker
      // reuses its predecessor's course instead of creating another.
      const identity = newCourseIdentity(getConfig(), getRunId(), `W${workerInfo.parallelIndex}`);
      await use(await provisionWorkerCourse(playwright, workerAuthor, identity));
    },
    { scope: 'worker', timeout: TIMEOUTS.studioSetup },
  ],

  contentCourse: [
    async ({ playwright, workerAuthor }, use, workerInfo) => {
      const config = getConfig();
      const identity = newCourseIdentity(
        config,
        getRunId(),
        `W${workerInfo.parallelIndex}C`,
        'content',
      );
      await use(
        await provisionWorkerCourse(
          playwright,
          workerAuthor,
          identity,
          async (request, courseKey) => {
            // Learners must be able to reach the content: a new course starts in
            // 2040. Re-applied on every provisioning (idempotent), so a restarted
            // worker never inherits a half-seeded course.
            await updateCourseDetails(request, config, courseKey, {
              start_date: CONTENT_COURSE_START,
            });
            await updateAdvancedSettings(request, config, courseKey, {
              enable_subsection_gating: true,
            });
          },
        ),
      );
    },
    // Two extra Studio writes on top of the create.
    { scope: 'worker', timeout: TIMEOUTS.studioSetup * 2 },
  ],

  futureCourse: [
    async ({ playwright, workerAuthor }, use, workerInfo) => {
      const identity = newCourseIdentity(
        getConfig(),
        getRunId(),
        `W${workerInfo.parallelIndex}F`,
        'future',
      );
      await use(await provisionWorkerCourse(playwright, workerAuthor, identity));
    },
    { scope: 'worker', timeout: TIMEOUTS.studioSetup },
  ],

  studioAuthorSession: async ({ page, request, config, studio, workerAuthor }, use) => {
    void studio;
    // The page already carries the worker author's browser-usable LMS session
    // (the studio-author project loads its storage state), so the Studio session
    // is normally completed off that — a silent SSO handshake, no credential
    // entry. A per-test UI login would re-authenticate the same author on every
    // Studio test, and with one worker running the whole Studio suite against a
    // single author that trips the LMS login rate limit (30 / 5 min).
    const authenticated = await establishStudioBrowserSession(page, config);
    if (!authenticated) {
      // The stored session decayed (expiry, or a concurrent-login eviction) and
      // Studio bounced to the login MFE. Recover with a single UI sign-in — using
      // the worker author's own identity, so it does not depend on the (equally
      // decayed) API session — rather than letting every remaining Studio test
      // fail on the login page.
      const username =
        workerAuthor?.identity.username ?? (await fetchStudioUsername(request, config));
      await signInToStudioThroughUi(page, config, {
        emailOrUsername: username,
        password: DEFAULT_PASSWORD,
      });
      // Persist the refreshed session so the rest of this worker's Studio tests
      // load a live one and reuse it, instead of each re-signing-in (which would
      // press the rate limit). Worker authors own their own state file, so this
      // write races nothing.
      if (workerAuthor) {
        persistStorageState(await page.context().storageState(), workerAuthor.stateFile);
      }
    }
    await use();
  },

  studioHomePage: pageObjectFixture(StudioHomePage),

  studioCourseOutlinePage: pageObjectFixture(StudioCourseOutlinePage),

  outlineConfigureDialog: pageObjectFixture(StudioOutlineConfigureDialog),

  studioUnitPage: pageObjectFixture(StudioUnitPage),

  scheduleDetailsPage: pageObjectFixture(StudioScheduleDetailsPage),

  gradingPage: pageObjectFixture(StudioGradingPage),

  advancedSettingsPage: pageObjectFixture(StudioAdvancedSettingsPage),

  courseTeamPage: pageObjectFixture(StudioCourseTeamPage),

  groupConfigurationsPage: pageObjectFixture(StudioGroupConfigurationsPage),

  certificatesPage: pageObjectFixture(StudioCertificatesPage),

  exportPage: pageObjectFixture(StudioExportPage),

  importPage: pageObjectFixture(StudioImportPage),

  checklistsPage: pageObjectFixture(StudioChecklistsPage),

  pagesResourcesPage: pageObjectFixture(StudioPagesResourcesPage),

  customPagesPage: pageObjectFixture(StudioCustomPagesPage),

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
      config.credentials.admin === undefined || !isUsableStateFile(staffState),
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
      admin === undefined || !isUsableStateFile(state),
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

  ownSection: async ({ request, config, contentCourse }, use, testInfo) => {
    await establishAuthorWriteSession(request, config);
    await use(
      await buildSection(
        request,
        config,
        contentCourse.courseKey,
        sectionLabel(testInfo, 0),
        DEFAULT_SECTION_SHAPE,
      ),
    );
  },

  authorSection: async ({ request, config, contentCourse }, use, testInfo) => {
    let ordinal = 0;
    await use(async (shape = DEFAULT_SECTION_SHAPE, label) => {
      ordinal += 1;
      await establishAuthorWriteSession(request, config);
      return buildSection(
        request,
        config,
        contentCourse.courseKey,
        label ?? sectionLabel(testInfo, ordinal),
        shape,
      );
    });
  },

  roundTripLearner: async ({ playwright, browser, config, contentCourse }, use) => {
    const learner = await provisionRoundTripLearner(
      playwright,
      browser,
      config,
      contentCourse.courseKey,
    );
    try {
      await use(learner);
    } finally {
      await disposeRoundTripLearner(learner);
    }
  },

  roundTripLearners: async ({ playwright, browser, config, contentCourse }, use) => {
    const learners = await Promise.all([
      provisionRoundTripLearner(playwright, browser, config, contentCourse.courseKey),
      provisionRoundTripLearner(playwright, browser, config, contentCourse.courseKey),
    ]);
    try {
      await use([learners[0], learners[1]]);
    } finally {
      await Promise.all(learners.map(disposeRoundTripLearner));
    }
  },

  futureCourseLearner: async ({ playwright, browser, config, futureCourse }, use) => {
    const learner = await provisionRoundTripLearner(
      playwright,
      browser,
      config,
      futureCourse.courseKey,
    );
    try {
      await use(learner);
    } finally {
      await disposeRoundTripLearner(learner);
    }
  },

  authoringCourse: async ({ playwright, workerAuthor }, use, testInfo) => {
    const config = getConfig();
    // A course of this test's own, keyed to the test and retry so a rerun reuses
    // it rather than piling up. Seeded past-start so the learner can reach it.
    const identity = newCourseIdentity(
      config,
      getRunId(),
      `A${testInfo.testId.replace(/[^\w]/g, '').slice(-6)}R${testInfo.retry}`,
      'authoring',
    );
    await use(
      await provisionWorkerCourse(
        playwright,
        workerAuthor,
        identity,
        async (request, courseKey) => {
          await updateCourseDetails(request, config, courseKey, {
            start_date: CONTENT_COURSE_START,
          });
        },
      ),
    );
  },

  authoringCourseLearner: async ({ playwright, browser, config, authoringCourse }, use) => {
    const learner = await provisionRoundTripLearner(
      playwright,
      browser,
      config,
      authoringCourse.courseKey,
    );
    try {
      await use(learner);
    } finally {
      await disposeRoundTripLearner(learner);
    }
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
