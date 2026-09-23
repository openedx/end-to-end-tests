import path from 'node:path';

import {
  test as base,
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type PlaywrightWorkerArgs,
  type TestInfo,
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
import { StudioVideoEditor } from '../pages/studio/editors/video-editor';
import { StudioTextEditor } from '../pages/studio/editors/text-editor';
import { StudioAdvancedSettingsPage } from '../pages/studio/settings/advanced-settings.page';
import { StudioCertificatesPage } from '../pages/studio/settings/certificates.page';
import { StudioCourseTeamPage } from '../pages/studio/settings/course-team.page';
import { StudioGradingPage } from '../pages/studio/settings/grading.page';
import { StudioGroupConfigurationsPage } from '../pages/studio/settings/group-configurations.page';
import { StudioScheduleDetailsPage } from '../pages/studio/settings/schedule-details.page';
import { StudioPagesResourcesPage } from '../pages/studio/pages-resources/pages-resources.page';
import { StudioCustomPagesPage } from '../pages/studio/custom-pages/custom-pages.page';
import { AuthoringSidebar } from '../pages/studio/sidebar/authoring-sidebar.page';
import { TagDrawer } from '../pages/studio/sidebar/tag-drawer.page';
import { TaxonomyListPage } from '../pages/studio/taxonomies/taxonomy-list.page';
import { TaxonomyDetailPage } from '../pages/studio/taxonomies/taxonomy-detail.page';
import { FilesPage } from '../pages/studio/files/files.page';
import { TextbooksPage } from '../pages/studio/textbooks/textbooks.page';
import { UpdatesPage } from '../pages/studio/updates/updates.page';
import { StudioExportPage } from '../pages/studio/tools/export.page';
import { StudioImportPage } from '../pages/studio/tools/import.page';
import { StudioChecklistsPage } from '../pages/studio/tools/checklists.page';
import { CourseCreatorAdminPage } from '../pages/studio/admin/course-creator-admin.page';
import {
  AdminConsolePage,
  AssignRoleWizard,
  PermissionsMatrix,
  TeamMembersTable,
  UserAuditPage,
} from '../pages/admin-console';
import { InstructorCourseInfoPage } from '../pages/lms/instructor/course-info.page';
import { InstructorEnrollmentsPage } from '../pages/lms/instructor/enrollments.page';
import { InstructorGradingPage } from '../pages/lms/instructor/grading.page';
import { InstructorDateExtensionsPage } from '../pages/lms/instructor/date-extensions.page';
import { InstructorDataDownloadsPage } from '../pages/lms/instructor/data-downloads.page';
import { InstructorCertificatesPage } from '../pages/lms/instructor/certificates.page';
import {
  authorLibrary,
  disableAuthzForCourse,
  enableAuthzForCourse,
  ensureDataResearcher,
  probeMigrationMode,
  seedTaxonomy,
  knownChromeDefects,
  readPageChrome,
  submitProblem,
  taxonomyImportFile,
  type AuthoredLibrary,
  type ChromeDefectContext,
  type PageChrome,
  type MigrationMode,
  type MigrationModeProbe,
} from '../steps';
import {
  CourseLibrariesPage,
  CreateLibraryPage,
  LegacyMigrationPage,
  LibraryContainerPage,
  LibraryPage,
  LibraryPickerDialog,
  PreviewChangesDialog,
} from '../pages/studio/library';
import {
  AUTH_STATE_DIR,
  authStateFile,
  isUsableStateFile,
  storedSessionNeedsRefresh,
  persistStorageState,
} from '../auth';
import {
  ApiError,
  GENERAL_TOPIC_ID,
  assignRole,
  authorStaffGradedOra,
  buildSection,
  fetchDiscussionCourse,
  grantCourseTeamRole,
  listDiscussionTopics,
  setEmailCadence,
  setNotificationPreference,
  type EmailCadence,
  type NotificationApp,
  DEFAULT_SECTION_SHAPE,
  ensureCourse,
  establishStudioSession,
  fetchCourseNavigation,
  fetchSequenceMetadata,
  fetchAdvancedSettings,
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
  fetchWaffleFlagStates,
  ensureCertificateBearingMode,
  fetchCertificateConfiguration,
  fetchCertificateGenerationEnabled,
  firstProblem,
  ensureCertificateGenerationEnabled,
  createCertificate,
  setCertificateActive,
  setCourseCertificateGeneration,
  updateGradingPolicy,
  updateXBlock,
  loginSession,
  fetchAuthoringMfeConfig,
  agreementTypesIn,
  acceptAgreement,
  ensureAgreement,
  type AgreementGating,
  type AuthoredProblem,
  courseKeySkipReason,
  enrollInCourseViaApi,
  fetchCourseDetail,
  fetchCourseOutline,
  primeCoursewareForLearner,
  fetchCourseProgress,
  learnerIdentityFor,
  newLearnerIdentity,
  unitsWithHtml5Video,
  type CourseDetail,
  type CourseOutline,
  type CourseProgress,
  type CourseUnit,
  type LearnerIdentity,
  DEFAULT_COURSE_ORG,
  LibraryDeleteRestrictedError,
  LibraryExistsError,
  addLegacyLibraryBlock,
  addLibraryTeamMember,
  createLegacyLibrary,
  createLibrary,
  deleteLibrary,
  fetchBlockHierarchy,
  fetchLibrary,
  libraryKeyFor,
  listCollections,
  listLibraryBlocks,
  deleteTaxonomy,
  importTaxonomy,
  setTaxonomyOrgs,
  type ContentLibrary,
  type LibraryAccessLevel,
  type LibraryBlock,
  type LibraryCollection,
  type LibraryContainer,
  type Taxonomy,
  type ChromeConfig,
  ADULT_YEAR_OF_BIRTH,
  AUTO_CERTIFICATE_GENERATION_SWITCH,
  enableCourseEmail,
  setWaffleSwitch,
  updateAccount,
} from '../api';
import { getConfig, getRunId, missingCapabilities, TIMEOUTS, type AppConfig } from '../config';
import { AccountSettingsPage } from '../pages/lms/auth/account-settings.page';
import { CatalogPage } from '../pages/lms/catalog/catalog.page';
import { CatalogHomePage } from '../pages/lms/catalog/catalog-home.page';
import { FooterBlock } from '../pages/lms/chrome/footer.block';
import { HeaderBlock } from '../pages/lms/chrome/header.block';
import { testIdsFromAnnotations } from '../reporting/test-id';
import { withExclusiveLock, withSharedLock } from './named-lock';
import { CourseAboutPage } from '../pages/lms/catalog/course-about.page';
import { CourseOutlinePage } from '../pages/lms/course-home/course-outline.page';
import { CourseToolsPage } from '../pages/lms/course-home/course-tools.page';
import { ProfilePage } from '../pages/lms/profile/profile.page';
import { TeamsPage } from '../pages/lms/teams/teams.page';
import { ProgressPage } from '../pages/lms/course-home/progress.page';
import { DashboardPage } from '../pages/lms/dashboard/dashboard.page';
import { UnitPage } from '../pages/lms/courseware/unit.page';
import { DiscussionsPage } from '../pages/lms/discussions/discussions.page';
import { NotificationPreferencesPage } from '../pages/lms/notifications/preferences.page';
import { NotificationTray } from '../pages/lms/notifications/tray.page';
import { canCompleteUnit } from '../steps/completion';
import { resolveMailProvider, type Inbox } from '../mail';
import { pollUntil } from '../steps/poll';
import { stubVideoSources } from './video-sources';
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
  /** The catalog MFE's home — the public landing page. */
  catalogHomePage: CatalogHomePage;
  /** The page header, whichever frontend generation renders it. */
  siteHeader: HeaderBlock;
  /** The page footer, whichever frontend generation renders it. */
  siteFooter: FooterBlock;
  /**
   * A signed-out visitor alongside the test's own (signed-in) page: a page in a
   * fresh browser context with its header and footer, for cases that compare
   * the public site with a learner's view (TC-00060). Closed after the test.
   */
  signedOutVisitor: {
    readonly page: Page;
    readonly header: HeaderBlock;
    readonly footer: FooterBlock;
  };
  /**
   * The landing page opened for a signed-out visitor, with the generation of
   * frontend that rendered its chrome and the configuration behind it. A chrome
   * defect known for that generation and layout (`KNOWN_CHROME_DEFECTS`) marks
   * the test as an expected failure here, for the cases it breaks — so specs
   * stay free of generation checks, and a marker lifts itself when the page
   * moves to a frontend without the defect.
   */
  publicChrome: PageChrome;
  /**
   * Chrome readings for a page the test has opened itself: which generation
   * rendered it and the configuration behind it (`read`), the known chrome
   * defects to expect for what the test measured (`expectKnownDefects`, which
   * marks the test an expected failure when one applies to its cases), and the
   * skip for a Help-link case the target's configuration does not apply to
   * (`requireSupportUrl`).
   */
  chromeCase: ChromeCase;
  /** Course About page object. */
  courseAboutPage: CourseAboutPage;
  /** Courseware unit page object (`frontend-app-learning`). */
  unitPage: UnitPage;
  /** Course home (outline tab) page object. */
  courseOutlinePage: CourseOutlinePage;
  /** Course Progress tab page object. */
  progressPage: ProgressPage;
  /** Learner profile page object (`frontend-app-profile`). */
  profilePage: ProfilePage;
  /**
   * A fresh learner whose profile can be shared: `courseLearner` with an adult
   * year of birth, since the platform keeps the profile of an account without
   * one private whatever its settings say. Not enrolled in anything.
   */
  profileLearner: CourseLearner;
  /**
   * A second fresh learner, signed in on a request context of its own — the
   * "someone else" whose reading of the profile learner's account decides a
   * privacy case. Disposed after the test.
   */
  profileViewer: { readonly request: APIRequestContext; readonly username: string };
  /**
   * The content course with teams on and one open topic of the suite's own
   * (`teams_configuration`, written by the author when missing), so learners
   * can create and join teams in it. Gated by the spec's `@teams` tag.
   */
  teamsCourse: AuthoredCourse & { readonly topicId: string };
  /** The learner dashboard in the admin's browser (`adminPage`), for global staff's "View as". */
  adminDashboardPage: DashboardPage;
  /**
   * Turns course e-mail on for the content course only (`enableCourseEmail`,
   * through the Django admin under the admin lock), so its learners' dashboard
   * cards offer "Email settings". Skips without an admin account.
   */
  courseEmailEnabled: void;
  /** The LMS-hosted course tool pages the course home links to (Bookmarks). */
  courseToolsPage: CourseToolsPage;
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
   * The YouTube id of the configured course's About-page intro video. Skips
   * when the course has none — the sheet's "if the course about page has a
   * video" — or when its video is not a YouTube URL the catalog can embed.
   */
  courseIntroVideoId: string;
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
   * A unit containing a video the suite can drive — one with an **HTML5 source**
   * — chosen by structure from the Blocks API's `student_view_data`, never by
   * name. Separate from {@link completionUnits} so that a course whose videos are
   * all YouTube-hosted skips only the video coverage, not the other completion
   * mechanisms.
   *
   * Skips the test when the course offers no such unit.
   */
  videoUnit: CourseUnit;
  /**
   * Serves the bundled clip in place of the HTML5 sources of the given units'
   * videos, on this test's `page`. Call it before opening a unit whose video is to
   * be watched; see `stubVideoSources` for why the real bytes are never fetched.
   */
  stubVideoSources: (units: readonly CourseUnit[]) => Promise<void>;
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
  /** The Verawood authoring sidebar (outline and unit page). */
  authoringSidebar: AuthoringSidebar;
  /** The content tag drawer (embedded in the Align sidebar). */
  tagDrawer: TagDrawer;
  /** The Studio Files page (course assets). */
  filesPage: FilesPage;
  /** The Studio Textbooks page. */
  textbooksPage: TextbooksPage;
  /** The Course Updates page. */
  updatesPage: UpdatesPage;
  /** The video component editor page object. */
  studioVideoEditor: StudioVideoEditor;
  /** The text (TinyMCE) component editor page object. */
  studioTextEditor: StudioTextEditor;
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
  /** Instructor dashboard tab page objects, on the author's page. */
  instructorCourseInfo: InstructorCourseInfoPage;
  instructorEnrollments: InstructorEnrollmentsPage;
  instructorGrading: InstructorGradingPage;
  instructorDateExtensions: InstructorDateExtensionsPage;
  instructorDataDownloads: InstructorDataDownloadsPage;
  instructorCertificates: InstructorCertificatesPage;
  /**
   * Makes sure the **platform** allows certificate generation
   * (`CertificateGenerationConfiguration`, off on a default install). It has no
   * REST API, only the LMS Django admin, which needs a live admin Django
   * session: a throwaway context signed in with `loginSession` under the admin
   * lock. Skips with a reason when no admin account is configured — "not
   * configured", as `courseKey` distinguishes it from "misconfigured".
   */
  certificateGenerationEnabled: void;
  /**
   * Runs one piece of work on a fresh **LMS Django session** for the admin —
   * what the Django admin needs for a write, since it refuses the captured
   * staff API state. Skips with a reason where no admin account is configured.
   *
   * The lock is held for the call, not the test. Holding it across a whole test
   * is what broke first: the lock goes stale after three minutes, another actor
   * takes it, and provisioning any account in the meantime signs the admin in
   * again — which ends this session (`PREVENT_CONCURRENT_LOGINS`) and turns the
   * next admin form into a login page. Group a test's admin work into as few
   * calls as it allows: each call costs an admin sign-in.
   */
  adminLms: AdminLmsRunner;
  /**
   * The worker's AuthZ-enabled course, or a skip with the reason it is missing
   * (no admin account, or the `rbac` capability undeclared).
   */
  authzTarget: AuthzCourse;
  /**
   * The Roles and Permissions console, addressed at the `ADMIN_CONSOLE_URL` this
   * installation advertises in its authoring MFE config. Where `rbac` is
   * declared but no console is configured this **fails** rather than skipping:
   * that is a misconfigured target, not absent coverage.
   */
  adminConsole: AdminConsoleFixture;
  /**
   * Skips unless this target leaves AuthZ migration to an operator — the stock
   * default, where saving a waffle override migrates nothing. The cases that
   * describe that default take it; the ones that describe a migrating target
   * take {@link TestFixtures.authzTarget} and read its `mode`.
   */
  manualMigrationTarget: void;
  /**
   * Skips unless this target migrates AuthZ roles **itself** when a waffle
   * override is saved — the setting CI turns on
   * (`ENABLE_AUTOMATIC_AUTHZ_COURSE_AUTHORING_MIGRATION`). The transition cases
   * describe that path: without it there is no migration run to read and no
   * roles move, so the coverage has no subject rather than a failure.
   */
  automaticMigrationTarget: void;
  /**
   * A learner of the test's own in {@link WorkerFixtures.certificateCourse},
   * enrolled in the **honor** track on its first enrollment (the platform does
   * not move an existing audit enrollment), so a certificate can be generated
   * for it. Own browser and request contexts, disposed at test end.
   */
  certificateLearner: RoundTripLearner;
  /**
   * The platform's automatic certificate generation, held exclusively: a
   * learner of its own in `certificateCourse` (honor), with the platform-wide
   * `certificates.auto_certificate_generation` switch **off** until the test
   * calls `turnOn()`, and switched off again afterwards. Every `certificateLearner`
   * case holds the same lock shared, so none of them sees the switch on. Skips
   * without an admin account.
   */
  certificateAutoGeneration: {
    readonly learner: RoundTripLearner;
    readonly turnOn: () => Promise<void>;
  };
  /**
   * The platform-wide `certificates.auto_certificate_generation` switch, held
   * exclusively: off until the test calls `turnOn()`, and off again afterwards.
   * Every `certificateLearner` case holds the same lock shared. Skips without
   * an admin account.
   */
  certificateSwitch: { readonly turnOn: () => Promise<void> };
  /**
   * The arrangement the gradebook cases start from: a published graded section
   * with a single-choice problem in the content course, a due date on its
   * subsection, and a {@link roundTripLearner} who has already submitted the
   * **wrong** answer. The instructor's adjustment is then the test's own act.
   */
  gradedProblemWithWrongAnswer: GradedProblemSetup;
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
  /**
   * A staff/superuser **API** session (not a browser), Studio SSO completed, held
   * under the admin-session lock for the whole test. For the few author-side reads
   * and actions that are global-staff-only — reindexing a course, reading the
   * staff-only `reindex_link`. Skips when no admin account is configured.
   */
  adminApi: APIRequestContext;
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
   * A {@link roundTripLearner} that is **not** provisioned until the returned
   * function is first awaited — for library round-trip specs, which must run
   * `establishStudioSession` on `page.request` (to re-sync the Studio session
   * the v2 library writes rotate) *before* any learner exists. Provisioning a
   * learner leaves the author's LMS session stale, and the SSO handshake then
   * corrupts the working CMS session instead of healing it. So these specs do
   * all their `page.request` authoring first, then `await roundTripLearnerLater()`
   * for the learner half. The result is memoised (repeat calls return the same
   * learner) and disposed at test end.
   */
  roundTripLearnerLater: () => Promise<RoundTripLearner>;
  /**
   * Re-syncs the worker author's Studio session on `page`/`page.request` through
   * the **browser** — a real navigation to Studio Home that completes the cms-sso
   * handshake and, if the loaded session has decayed, a single UI sign-in that
   * refreshes both the LMS and the Studio halves. Library round-trip specs call
   * this (not `establishStudioSession`) after the seeded library's v2 writes have
   * rotated `page.request`'s Studio session: the API-side SSO handshake heals a
   * live session but *corrupts* one whose LMS half a prior test's learner has
   * left stale, whereas the browser path detects that and re-logs-in instead.
   * Idempotent; the refreshed session is persisted to the worker author's state
   * file so later tests load it.
   */
  resyncStudioAuthor: () => Promise<void>;
  /**
   * Two independent {@link roundTripLearner}s — for a case whose point is that
   * two learners see different content (a cohort-restricted unit).
   */
  roundTripLearners: readonly [RoundTripLearner, RoundTripLearner];
  /** A {@link roundTripLearner} enrolled in the not-yet-started {@link WorkerFixtures.futureCourse}. */
  futureCourseLearner: RoundTripLearner;
  /**
   * Builds a section of this test's own in the worker's video-free course
   * (`videoFreeCourse`), for the cases that need a course the platform can
   * estimate effort for.
   */
  videoFreeSection: (shape: SectionShape) => Promise<AuthoredSection>;
  /** A fresh learner enrolled in `videoFreeCourse`, on their own contexts. */
  videoFreeCourseLearner: RoundTripLearner;
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
  /**
   * A deferred {@link roundTripLearnerLater} enrolled in this test's
   * {@link authoringCourse} — provisioned only when first awaited, so a library
   * round-trip spec can finish its `page.request` authoring first.
   */
  authoringCourseLearnerLater: () => Promise<RoundTripLearner>;
  /** Two independent learners in this test's {@link authoringCourse} (cohort in/out cases). */
  authoringCourseLearners: readonly [RoundTripLearner, RoundTripLearner];

  // --- Content libraries (Epic 10) --------------------------------------------

  /** The library page object (library home, tabs, cards, sidebar, collections). */
  libraryPage: LibraryPage;
  /** A unit / subsection / section landing page in the library MFE. */
  libraryContainerPage: LibraryContainerPage;
  /** The "Create new library" form. */
  createLibraryPage: CreateLibraryPage;
  /** The course-side "Library Content" picker modal. */
  libraryPicker: LibraryPickerDialog;
  /** The "Preview changes" (accept / ignore a library update) modal. */
  previewChangesDialog: PreviewChangesDialog;
  /** The course's Libraries page (Review Content Updates). */
  courseLibrariesPage: CourseLibrariesPage;
  /** The legacy-library migration stepper. */
  legacyMigrationPage: LegacyMigrationPage;
  /**
   * A **published** library seeded for this test with the shape every
   * shared-read case needs (search, filters, hierarchy, reuse, overrides,
   * public read): a text / problem / video / PDF block, a unit, a subsection, a
   * section and a collection. Per test, not per worker — the seed's v2 writes
   * rotate the seeding context's Studio session, so it is built on the test's
   * own `page.request` (see CONVENTIONS.md "Library round trips"). Specs never
   * delete from it; destructive cases take {@link authoringLibrary}.
   */
  seededLibrary: SeededLibrary;
  /**
   * A fresh, **empty** library of this test's own — for cases that create,
   * delete or publish items and would otherwise disturb the shared library.
   * Idempotent per test and retry. Torn down best-effort at test end: the
   * platform refuses to delete a library that has held a container (`LIB-001`),
   * and those are left in place under their run-unique slug.
   */
  authoringLibrary: ContentLibrary;
  /**
   * A **legacy** (`library-v1:`) library of this test's own with two components,
   * the source of the migration cases. Skips unless `content-libraries-v1` is
   * declared; fails if it is declared but Studio reports legacy libraries off
   * (misconfiguration, not optional coverage). Legacy libraries cannot be
   * deleted through any API, so none is torn down.
   */
  legacyLibrary: LegacyLibraryFixture;
  /**
   * Makes a second **Studio user** for a library access case — a fresh
   * course-creator account (public read grants nothing to a plain learner), on
   * its own request context and browser page, optionally added to a library's
   * team at an access level by the worker author. Each call provisions one;
   * contexts are disposed when the test ends. Costs one registration and, on an
   * install with `ENABLE_CREATOR_GROUP`, one course-creator grant per call.
   */
  studioColleague: (options?: StudioColleagueOptions) => Promise<StudioColleague>;
  /**
   * A taxonomy seeded once per worker (idempotent by a worker-unique name),
   * imported and assigned to the worker's org by the **admin** under the admin
   * lock. Its tags are the {@link TAG} tree. Shared by the drawer and Align
   * specs, which scope to it by name so other workers' taxonomies in the same
   * org do not confuse them. Skips when `taxonomies` is undeclared or no admin
   * account is configured (managing a taxonomy is staff-only) — like
   * {@link TestFixtures.certificateGenerationEnabled}. Not torn down: it is
   * shared across the worker's tests and reused by a later run through its name.
   */
  workerTaxonomy: WorkerTaxonomy;
  /**
   * A per-test taxonomy of the test's own, for the cases that re-import or
   * delete one (TC-00262/00264). Imported and org-assigned by the admin under
   * the lock; deleted best-effort at test end. Skips like {@link workerTaxonomy}.
   */
  authoringTaxonomy: WorkerTaxonomy;
  /**
   * The taxonomy admin pages (list and detail) driven by the configured admin,
   * signed into Studio in a fresh browser context and held under the admin lock
   * for the whole test. Skips without a configured admin or the `taxonomies`
   * capability. The bundled `request` is that same admin browser's API context
   * (shared session), for the content-tagging API oracles and cleanup.
   */
  taxonomyAdmin: TaxonomyAdmin;
  /**
   * The upload-agreement gating declared for this installation, with its
   * `UserAgreement` rows seeded (see {@link WorkerFixtures.seededUploadAgreements},
   * which does the work once per worker). Skips without a configured admin, the
   * `upload-agreements` capability or an empty gating map — so only the specs
   * whose subject *is* the gating should take it.
   */
  uploadAgreements: UploadAgreements;
  /**
   * Accepts every configured upload-agreement type for the test's author (its own
   * session, `POST agreement_record`), so a gated install never blocks the
   * author's uploads. A no-op — never a skip — where nothing is gated. The
   * `filesPage` fixture takes it for every Files spec; a spec only needs it
   * directly when it reaches the gated UI without that page object.
   */
  acceptedUploadAgreements: void;
  /**
   * Provisions a **fresh** learner enrolled in {@link WorkerFixtures.contentCourse}
   * on its own contexts, optionally setting notification preferences first —
   * the recipient of a notification case. Fresh per call because what a
   * recipient has received is the assertion (preferences are per user, and a
   * reused account would carry another test's rows). Call it twice for a
   * subject and a sentinel. Every learner is disposed at test end.
   */
  notificationRecipient: (options?: NotificationRecipientOptions) => Promise<RoundTripLearner>;
  /**
   * As {@link notificationRecipient}, but registered at the address of a fresh
   * inbox from the configured mailbox provider (`MAIL_PROVIDER`, `src/mail/`),
   * which it also hands the spec — for the cases whose oracle is the mail
   * itself. Specs that take it carry `@email-inbox`. Registration goes through
   * the configured account backend with the inbox's address, so a backend that
   * mints its own addresses (`openinbox`) cannot be combined with it; the
   * inboxes are disposed at test end.
   */
  mailboxLearner: (options?: NotificationRecipientOptions) => Promise<MailboxLearner>;
  /**
   * A fresh learner registered at an inbox of the configured mailbox provider
   * and enrolled in nothing — for account mail (password reset) rather than
   * course mail. Specs using it carry `@email-inbox`. The inbox and the
   * learner's request context are disposed after the test.
   */
  inboxLearner: InboxLearner;
  /**
   * {@link WorkerFixtures.contentCourse} once its forum is ready for the UI: the
   * topic list is synced from the course structure by a task after the course is
   * created, and the discussions MFE loaded before it offers no topic, so its
   * post editor cannot submit (measured). Polls the list under `contentPublish`.
   */
  forumCourse: AuthoredCourse;
  /**
   * The notifications tray on the test's own `page` — the worker author's in
   * `studio-author`, for the cases whose recipient is the course's staff
   * (TC-00468). A learner's tray is `RoundTripLearner.notificationTray`.
   */
  notificationTray: NotificationTray;
  /**
   * A published one-unit section of {@link forumCourse}, and the in-context
   * discussion topic its unit gets — for the in-unit forum (TC-00029) and the
   * one-sidebar case (TC-00053). Polls until the topic is listed.
   */
  forumUnit: ForumUnit;
  /**
   * A published unit in {@link WorkerFixtures.contentCourse} holding one ORA
   * whose only step is a required staff assessment — the source of
   * `ora_staff_notifications` (to the worker author, the course's staff) and,
   * once graded, `ora_grade_assigned` (to the learner). Gated by `@ora`.
   */
  oraUnit: OraUnit;
}

/** One notification preference to set, as {@link TestFixtures.notificationRecipient} applies it. */
export interface NotificationPreferenceSetting {
  readonly app: NotificationApp;
  readonly type: string;
  readonly channel: 'web' | 'email';
  readonly value: boolean;
}

/** One e-mail cadence to set, as {@link TestFixtures.notificationRecipient} applies it. */
export interface NotificationCadenceSetting {
  readonly app: NotificationApp;
  readonly type: string;
  readonly cadence: EmailCadence;
}

export interface NotificationRecipientOptions {
  readonly preferences?: readonly NotificationPreferenceSetting[];
  readonly cadences?: readonly NotificationCadenceSetting[];
}

/** What {@link TestFixtures.mailboxLearner} hands a spec: the learner and its inbox. */
export interface MailboxLearner extends RoundTripLearner {
  readonly inbox: Inbox;
}

/** What {@link TestFixtures.inboxLearner} hands a spec. */
export interface InboxLearner {
  readonly identity: LearnerIdentity;
  readonly request: APIRequestContext;
  readonly inbox: Inbox;
}

/** What {@link TestFixtures.forumUnit} hands a spec. */
export interface ForumUnit {
  readonly courseKey: string;
  readonly section: AuthoredSection;
  readonly sequentialId: string;
  readonly unitId: string;
  /** The unit's in-context discussion topic. */
  readonly topicId: string;
}

/** What {@link TestFixtures.oraUnit} hands a spec. */
export interface OraUnit {
  readonly courseKey: string;
  readonly sequentialId: string;
  readonly unitId: string;
  readonly oraUsageKey: string;
  readonly displayName: string;
}

/** What {@link TestFixtures.uploadAgreements} hands a spec: the gating map and its types. */
export interface UploadAgreements {
  readonly gating: AgreementGating;
  readonly types: readonly string[];
}

/** What {@link TestFixtures.taxonomyAdmin} hands a spec: the admin's taxonomy pages and API session. */
export interface TaxonomyAdmin {
  readonly list: TaxonomyListPage;
  readonly detail: TaxonomyDetailPage;
  /** The admin's own browser page — what an accessibility scan of these screens runs on. */
  readonly page: Page;
  /** The admin browser's own API context (same session as the pages). */
  readonly request: APIRequestContext;
  /** The content org taxonomies are assigned to (whose courses' drawers list them). */
  readonly org: string;
}

/** What {@link TestFixtures.workerTaxonomy} / {@link TestFixtures.authoringTaxonomy} hand a spec. */
export interface WorkerTaxonomy {
  /** The seeded taxonomy (id, name, tag values live under `TAG`). */
  readonly taxonomy: Taxonomy;
  /** The org it is assigned to — the org whose courses' drawers list it. */
  readonly org: string;
}

/** What {@link TestFixtures.seededLibrary} hands a spec: the seeded library and its items by role. */
export interface SeededLibrary {
  readonly org: string;
  readonly library: ContentLibrary;
  readonly libraryKey: string;
  readonly blocks: {
    readonly text: LibraryBlock;
    readonly problem: LibraryBlock;
    readonly video: LibraryBlock;
    readonly pdf: LibraryBlock;
  };
  readonly units: { readonly unit: LibraryContainer };
  readonly subsections: { readonly subsection: LibraryContainer };
  readonly sections: { readonly section: LibraryContainer };
  readonly collections: { readonly collection: LibraryCollection };
}

/** What {@link TestFixtures.legacyLibrary} hands a spec. */
export interface LegacyLibraryFixture {
  readonly libraryKey: string;
  readonly displayName: string;
  /** The two components' display names (our own data). */
  readonly blockNames: readonly [string, string];
}

export interface StudioColleagueOptions {
  /** Add the colleague to this library's team at this level, as the worker author. */
  readonly libraryAccess?: { readonly libraryKey: string; readonly level: LibraryAccessLevel };
}

/**
 * The parts {@link WorkerFixtures.rbacCast} casts. Each name is a role the BTR
 * plan's own cast list uses (`user_instructor_a`, `user_staff_a`, …), so an
 * account only ever plays one of them.
 */
export const RBAC_CAST_PARTS = [
  'instructor',
  'staff',
  'limitedStaff',
  'dataResearcher',
  'beta',
  'learner',
  'outsider',
  'multiRole',
  'orgInstructor',
  'orgStaff',
  'courseAdmin',
  'courseStaff',
  'newcomer',
  'creator',
  'libraryAuthor',
  'libraryContributor',
  'libraryUser',
  // Three accounts that only ever hold **every** library role at once: the
  // console's pagination case needs twelve assignments, and giving the parts
  // above a role they do not play would change what the library specs measure.
  'teamPagerA',
  'teamPagerB',
  'teamPagerC',
] as const;

export type RbacCastPart = (typeof RBAC_CAST_PARTS)[number];

/** The parts {@link WorkerFixtures.forumCast} casts. */
export type ForumCastPart = 'poster' | 'moderator';

/** What one {@link TestFixtures.studioColleague} call hands a spec. */
export interface StudioColleague {
  readonly identity: LearnerIdentity;
  /** Request context holding the colleague's LMS + Studio session. */
  readonly request: APIRequestContext;
  /** Browser context (and its one page) carrying the same session. */
  readonly context: BrowserContext;
  readonly page: Page;
  /** Page objects bound to the colleague's page. */
  readonly libraryPage: LibraryPage;
  readonly unitPage: StudioUnitPage;
  readonly libraryPicker: LibraryPickerDialog;
  /** Studio Home as this colleague sees it — which courses and libraries are listed to them. */
  readonly studioHomePage: StudioHomePage;
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
  /** The LMS-hosted course tool pages (Bookmarks, Updates) on this learner's page. */
  readonly courseToolsPage: CourseToolsPage;
  /** The learner dashboard on this learner's page. */
  readonly dashboardPage: DashboardPage;
  /** The course Progress tab on this learner's page. */
  readonly progressPage: ProgressPage;
  /** The course Teams page on this learner's page. */
  readonly teamsPage: TeamsPage;
  /** The header's notifications tray, on whatever page this learner is on. */
  readonly notificationTray: NotificationTray;
  /** The account MFE's notification preference centre. */
  readonly notificationPreferences: NotificationPreferencesPage;
  /** The discussions MFE, full page. */
  readonly discussions: DiscussionsPage;
  /** The same MFE inside the learning MFE's in-unit discussions sidebar (open it first). */
  readonly sidebarDiscussions: DiscussionsPage;
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
   * The upload-agreement gating this installation declares, with a `UserAgreement`
   * row seeded per gated type through the LMS admin (idempotent, under the admin
   * lock). Seeded once per worker because the rows are global and an admin
   * sign-in per test would trip the LMS login rate limit.
   *
   * Never skips: an installation without the `upload-agreements` capability, an
   * administrator or an `AGREEMENT_GATING` map yields an empty `types`, which
   * makes {@link TestFixtures.acceptedUploadAgreements} a no-op. The specs whose
   * subject *is* the gating take {@link TestFixtures.uploadAgreements}, which
   * skips instead.
   */
  seededUploadAgreements: UploadAgreements;
  /**
   * Which of the two migration models this target follows, probed once per
   * worker with **no blast radius**: a waffle override is saved for an
   * organization that has no courses, and a target that migrates by itself
   * records a run even for that empty scope. `undefined` where no admin account
   * is configured, because the probe is a Django-admin write.
   */
  authzMigrationMode: MigrationModeProbe | undefined;
  /**
   * A course of this worker's own with `authz.enable_course_authoring` forced
   * **on**, and its roles in authz — migrated by the target where it does that
   * itself, assigned here where it does not, because a flag-on course with no
   * authz roles locks its own team out of Studio. `undefined` without an admin.
   */
  /**
   * A cast of Studio accounts **shared by the worker's RBAC specs**, one per
   * part they play (`instructor`, `course_staff`, `library_user`, …).
   *
   * Every account in `tests/rbac/` used to be provisioned per test, which put a
   * full run of the tree past the platform's sign-in and registration limits —
   * the failures it produced looked like slow renders and dead sessions rather
   * than what they were. The cast fixes the arithmetic: a worker provisions each
   * part **once, on first use**, and the specs take the part they need.
   *
   * It is keyed by part rather than by number on purpose. An account reused
   * across tests keeps whatever roles those tests gave it, so reuse is only safe
   * when the part is the same every time: `cast('staff')` may end up `staff` in
   * several courses, which changes nothing about what `staff` may do in the
   * course under test. A case that needs an account with **no** history — one it
   * deactivates, or one whose emptiness is the assertion on a shared scope —
   * still takes {@link TestFixtures.studioColleague}.
   */
  rbacCast: (part: RbacCastPart) => Promise<StudioColleague>;
  /**
   * The other actors of the notification and forum cases, one account per part
   * per worker, each a learner enrolled in {@link contentCourse} on its own
   * contexts — the {@link rbacCast} pattern: a part is a role, so reuse cannot
   * hand a case a role it did not expect. `poster` is only ever a plain learner
   * (it posts, responds, comments, follows, reports); `moderator` only ever
   * holds the forum `Moderator` role in {@link contentCourse}, granted by the
   * worker author on first use and read back from the moderator's own session.
   * A recipient is never a cast member — take
   * {@link TestFixtures.notificationRecipient}.
   */
  forumCast: (part: ForumCastPart) => Promise<RoundTripLearner>;

  authzCourse: AuthzCourse | undefined;
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
  /**
   * A worker course that never holds a video, started in the past: the course
   * home's effort estimates (TC-00027) are computed for a whole course only when
   * every video in it has a duration, and the suite's authored videos have none,
   * so estimates need a course with no video at all. Built lazily, only by
   * workers that run a spec asking for it.
   */
  videoFreeCourse: AuthoredCourse;
  /**
   * One course per worker set up so certificates can be issued: start in the
   * past, end in the future, certificates shown as soon as earned
   * (`certificates_display_behavior: early_no_info` — `PUT course_details`
   * ignores `self_paced`, PLAT-006), an `honor` mode, an active Studio
   * certificate, student-generated certificates on, a grading policy of one
   * assignment type at 100 %, one graded section with a single-choice problem,
   * and the `data_researcher` role for the worker author. Specs share it **by
   * learner**: each test provisions its own ({@link TestFixtures.certificateLearner}),
   * so allowlist and invalidation state never crosses tests.
   */
  certificateCourse: CertificateCourse;
}

/** What {@link WorkerFixtures.workerAuthor} holds. */
export interface WorkerAuthor {
  readonly identity: LearnerIdentity;
  /** Storage state (LMS + Studio session) the worker's contexts load. */
  readonly stateFile: string;
}

/** What {@link TestFixtures.adminConsole} hands a spec. */
export interface AdminConsoleFixture {
  /** The console's origin, as the installation advertises it. */
  readonly origin: string;
  /** The console shell: tabs, the Assign Role button, the scope preset. */
  readonly console: AdminConsolePage;
  /** The Team Members tab's table, search and filters. */
  readonly teamMembers: TeamMembersTable;
  /** One account's audit view: its roles, their permissions, and removal. */
  readonly userAudit: UserAuditPage;
  /** The two-step Assign Role wizard. */
  readonly assignRole: AssignRoleWizard;
  /** The Roles and Permissions tab: the static matrix of role against permission. */
  readonly matrix: PermissionsMatrix;
  /**
   * The same audit view bound to another browser — a second actor looking at
   * **its own** roles, which is the only way to see how the console treats the
   * viewer's own admin row.
   */
  readonly auditFor: (page: Page) => UserAuditPage;
  /** The console shell bound to another browser, for a second actor's view of it. */
  readonly consoleFor: (page: Page) => AdminConsolePage;
}

/** Runs one unit of admin work on a fresh LMS Django session, under the admin lock. */
export type AdminLmsRunner = <T>(work: (session: APIRequestContext) => Promise<T>) => Promise<T>;

/** What {@link WorkerFixtures.authzCourse} hands a spec: a course under AuthZ. */
export interface AuthzCourse extends AuthoredCourse {
  /** How this target migrates roles when a waffle override is saved. */
  readonly mode: MigrationMode;
  /** The probe's evidence, for a failure message that explains itself. */
  readonly modeEvidence: string;
}

/** What {@link WorkerFixtures.authoredCourse} hands a spec. */
export interface AuthoredCourse extends CourseIdentity {
  /** The course's Studio URL (redirects to the authoring MFE where applicable). */
  readonly studioUrl: string;
}

/** What {@link TestFixtures.gradedProblemWithWrongAnswer} hands a spec. */
export interface GradedProblemSetup {
  readonly section: AuthoredSection;
  /** The graded subsection (carries the due date). */
  readonly subsectionKey: string;
  readonly problem: AuthoredProblem;
  /** The due date set on the subsection (ISO). */
  readonly due: string;
  /** The learner who answered wrong; its `progress` is the learner-side oracle. */
  readonly learner: RoundTripLearner;
}

/** What {@link WorkerFixtures.certificateCourse} hands a spec. */
export interface CertificateCourse extends AuthoredCourse {
  /** The one graded subsection (100 % of the grade). */
  readonly subsectionKey: string;
  /** Its single-choice problem, with the answers that pass and fail. */
  readonly problem: AuthoredProblem;
  /** Whether a certificate-bearing (`honor`) mode could be added — needs the staff session. */
  readonly certificateBearingMode: boolean;
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

/** The named lock serialising the certificate auto-generation switch (`named-lock.ts`). */
const CERTIFICATE_SWITCH_LOCK = 'certificate-auto-generation';

/** What {@link TestFixtures.chromeCase} hands a spec. */
export interface ChromeCase {
  read(): Promise<PageChrome>;
  expectKnownDefects(context: Omit<ChromeDefectContext, 'viewportWidth'>): void;
  requireSupportUrl(chrome: ChromeConfig, configured: boolean): void;
}

/** What {@link TestFixtures.enrolledCourse} hands a spec. */
export type EnrolledCourse = CourseLearner;

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
/** End date of the certificate course: far enough out never to matter. */
export const CERTIFICATE_COURSE_END = '2100-01-01T00:00:00Z';

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
/**
 * Runs `work` on an **LMS Django session** for the admin, under the cross-worker
 * admin lock.
 *
 * It reuses **the run's one admin session**, `.auth/staff.json`, the same state
 * the `setup` project captured and the account-creator grant reads. That
 * matters: the Django admin needs a session cookie, a sign-in per call exhausts
 * the login rate limit, and every sign-in ends the admin's other sessions
 * (`PREVENT_CONCURRENT_LOGINS`) — so a second admin state file would have this
 * path and the grant path evicting each other, paying a login each time. A
 * caller that finds the session dead signs in once and republishes it here, so
 * the cost is one login per eviction for the whole suite.
 */
async function withAdminLmsSession<T>(
  playwright: PlaywrightWorkerArgs['playwright'],
  config: AppConfig,
  credentials: { emailOrUsername: string; password: string },
  work: (session: APIRequestContext) => Promise<T>,
): Promise<T> {
  const stateFile = authStateFile('staff');
  const isDeadSession = (error: unknown): boolean =>
    error instanceof ApiError &&
    // "did not render" is an admin page that came back as the login redirect;
    // "redirected to sign-in" is the Studio half of the same session having
    // decayed, which a `StudioSessionExpiredError` reports.
    /did not render|redirected to sign-in|HTTP 40[13]/.test(error.message);

  return withAdminSession(async () => {
    const run = async (signIn: boolean): Promise<T> => {
      const reuse = !signIn && isUsableStateFile(stateFile);
      const session = await playwright.request.newContext(reuse ? { storageState: stateFile } : {});
      try {
        if (!reuse) {
          await loginSession(session, config, credentials);
          // Both halves, like `setup` writes them: the account-creator grant
          // reads this same state and drives a **Studio** admin form, so
          // publishing an LMS-only session would send that path back to a fresh
          // sign-in — and every sign-in evicts the other's session.
          await establishStudioSession(session, config);
          persistStorageState(await session.storageState(), stateFile);
        }
        return await work(session);
      } finally {
        await session.dispose();
      }
    };
    try {
      return await run(false);
    } catch (error) {
      if (!isDeadSession(error)) throw error;
      return await run(true);
    }
  });
}

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
  options: { readonly mode?: string; readonly identity?: Partial<LearnerIdentity> } = {},
): Promise<RoundTripLearner> {
  const request = await playwright.request.newContext();
  const identity = await provisionLearnerSession(request, config, options.identity);
  await enrollInCourseViaApi(request, config, courseKey, { mode: options.mode });
  const context = await browser.newContext();
  await context.addCookies((await request.storageState()).cookies);
  const page = await context.newPage();
  const unitPage = new UnitPage(page, config);
  return {
    identity,
    courseKey,
    request,
    context,
    page,
    unitPage,
    courseOutlinePage: new CourseOutlinePage(page, config),
    courseToolsPage: new CourseToolsPage(page, config),
    dashboardPage: new DashboardPage(page, config),
    progressPage: new ProgressPage(page, config),
    teamsPage: new TeamsPage(page, config),
    notificationTray: new NotificationTray(page, config),
    notificationPreferences: new NotificationPreferencesPage(page, config),
    discussions: new DiscussionsPage(page, config),
    sidebarDiscussions: new DiscussionsPage(page, config, unitPage.discussionsFrame),
    outline: () => fetchCourseOutline(request, config, courseKey, identity.username),
    sequence: (sequentialId) => fetchSequenceMetadata(request, config, sequentialId),
    navigation: () => fetchCourseNavigation(request, config, courseKey),
    prime: (sequentialId) => primeCoursewareForLearner(request, config, sequentialId),
  };
}

/** Sets a new recipient's notification preferences and cadences. */
async function applyNotificationOptions(
  request: APIRequestContext,
  config: AppConfig,
  options: NotificationRecipientOptions,
): Promise<void> {
  for (const preference of options.preferences ?? []) {
    await setNotificationPreference(request, config, preference);
  }
  for (const cadence of options.cadences ?? []) {
    await setEmailCadence(request, config, cadence);
  }
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
 * have been evicted from the shared cache (Redis `allkeys-lru` under CI memory
 * pressure, or a cache flush) — not by a concurrent login: CMS runs with
 * `PREVENT_CONCURRENT_LOGINS` off, so neither a sibling fixture's SSO handshake
 * nor a browser Studio login ends this context's Studio session. The write then
 * 302s to sign-in — a JWT read like `fetchXBlockOutline` survives, but the
 * session-only write cannot. The SSO handshake rebuilds the Studio session off
 * this context's login JWT (the JWT authorizes the `cms-sso` OAuth flow), so it
 * recovers an evicted session on its own **as long as the JWT is still valid**.
 *
 * The handshake runs **only after a write has actually 302'd**, never up front.
 * Measured (Epic 10): a Studio session that is live for `/xblock/` writes can
 * still have a *stale LMS half* — a sibling fixture provisioning a learner
 * leaves it so — and the SSO handshake then does not no-op on it but replaces
 * the working Studio session with a dead one, so the very write it was meant to
 * protect 302s (content-bootstrap's "hiding a subsection" flaked exactly this
 * way on both releases). No cheap Studio GET distinguishes the two states on an
 * API context (measured: the JWT-tolerant legacy reads answer 200 either way),
 * so the write itself is the probe: build, and on the typed 302 rebuild the
 * session and retry once.
 *
 * The one case the handshake cannot heal is a **lapsed JWT** (a worker run past
 * the ~1 h clock): there is then nothing to authorize it, and no clean context
 * to sign into here. That is pre-empted upstream — the `storageState` fixture
 * refreshes the state file before this context is built once the stored JWT is
 * stale — so if it is still hit, the session is genuinely gone: surface it as
 * {@link StudioSessionExpiredError} (the write path's typed "re-auth on a clean
 * context and retry" signal) rather than a bare handshake error, so a retry's
 * heal is reached and the failure reads correctly.
 */
async function buildWithAuthorWriteSession<T>(
  request: APIRequestContext,
  config: AppConfig,
  build: () => Promise<T>,
): Promise<T> {
  try {
    return await build();
  } catch (error) {
    if (!(error instanceof StudioSessionExpiredError)) throw error;
  }
  // The first write 302'd: the Studio session is gone (cache eviction). A dead
  // session dies on its first write, so nothing was created — rebuild off the
  // JWT and retry the whole build once.
  try {
    await establishStudioSession(request, config);
  } catch (error) {
    throw new StudioSessionExpiredError('Establishing the author write session', {
      url: `${studioOrigin(config)}/login/`,
      status: error instanceof ApiError ? error.status : 0,
    });
  }
  return build();
}

/** A library slug unique to this run and `scope` (a worker slot or a test id): lowercase, `[a-z0-9-]`. */
function librarySlug(scope: string): string {
  return `e2e-${getRunId()}-${scope}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

/**
 * Gate for the taxonomy fixtures: managing a taxonomy (import, assign org,
 * delete) is staff-only, so the coverage skips without a declared `taxonomies`
 * capability or a configured admin account — the `certificateGenerationEnabled`
 * shape. Returns the org the taxonomy is assigned to (the worker's content org).
 */
function requireTaxonomyAdmin(config: AppConfig): string {
  base.skip(
    !config.capabilities.has('taxonomies'),
    'Content tagging is not declared for this installation (taxonomies).',
  );
  base.skip(
    config.credentials.admin === undefined || !isUsableStateFile(authStateFile('staff')),
    'Taxonomy management needs the administrator: importing and assigning a taxonomy is ' +
      'staff-only. Set ADMIN_USERNAME and ADMIN_PASSWORD (a superuser).',
  );
  return config.org ?? DEFAULT_COURSE_ORG;
}

/**
 * Tears a library down where the platform allows it: `DELETE <lib>/` is 500
 * for any library that ever held a container (`LIB-001`), so that answer is
 * recorded on the test as a note and the library is left in place. The note
 * carries the response body, because the classification is by status alone —
 * an unrelated 500 on this endpoint lands here too, and has to stay readable.
 */
async function deleteLibraryBestEffort(
  request: APIRequestContext,
  config: AppConfig,
  libraryKey: string,
  testInfo: TestInfo,
): Promise<void> {
  await deleteLibrary(request, config, libraryKey).catch((error: unknown) => {
    if (!(error instanceof LibraryDeleteRestrictedError)) throw error;
    testInfo.annotations.push({
      type: 'note',
      description:
        `${libraryKey} could not be deleted (LIB-001); left in place. ` +
        `Platform answered: ${error.body.slice(0, 300)}`,
    });
  });
}

/**
 * A {@link RoundTripLearner} provisioned on first call and disposed at test end
 * — the body of the `…LearnerLater` fixtures (see
 * {@link TestFixtures.roundTripLearnerLater} for why library round trips defer it).
 */
async function deferredLearner(
  playwright: PlaywrightWorkerArgs['playwright'],
  browser: Browser,
  config: AppConfig,
  courseKey: string,
  use: (get: () => Promise<RoundTripLearner>) => Promise<void>,
): Promise<void> {
  let learner: RoundTripLearner | undefined;
  const get = async (): Promise<RoundTripLearner> => {
    learner ??= await provisionRoundTripLearner(playwright, browser, config, courseKey);
    return learner;
  };
  try {
    await use(get);
  } finally {
    if (learner !== undefined) await disposeRoundTripLearner(learner);
  }
}

/**
 * Creates the seeded library (a text/problem/video/pdf component, a unit, a
 * subsection, a section and a collection) or, when a retried worker finds its
 * predecessor's library under the same slug, re-derives the seeded items from
 * the API so the fixture hands out the same shape either way.
 */
async function provisionLibrary(
  request: APIRequestContext,
  config: AppConfig,
  org: string,
  slug: string,
): Promise<SeededLibrary> {
  // No leading dash in the label: the search cases type it into Meilisearch.
  const label = `E2E library ${getRunId()} ${slug.split('-').pop() ?? ''}`;
  const pick = <T>(map: Readonly<Record<string, T>>, key: string): T => {
    const entry = map[key];
    if (entry === undefined) throw new Error(`The seeded library has no "${key}".`);
    return entry;
  };
  const shape = (authored: AuthoredLibrary): SeededLibrary => ({
    org,
    library: authored.library,
    libraryKey: authored.libraryKey,
    blocks: {
      text: pick(authored.blocks, 'text'),
      problem: pick(authored.blocks, 'problem'),
      video: pick(authored.blocks, 'video'),
      pdf: pick(authored.blocks, 'pdf'),
    },
    units: { unit: pick(authored.units, 'unit') },
    subsections: { subsection: pick(authored.subsections, 'subsection') },
    sections: { section: pick(authored.sections, 'section') },
    collections: { collection: pick(authored.collections, 'collection') },
  });
  try {
    return shape(
      await authorLibrary(request, config, {
        org,
        slug,
        title: label,
        allowPublicRead: true,
        blocks: {
          text: { type: 'html', displayName: `${label} text`, content: `${label} text body` },
          problem: { type: 'problem', displayName: `${label} problem` },
          video: { type: 'video', displayName: `${label} video` },
          pdf: {
            type: 'pdf',
            displayName: `${label} pdf`,
            content: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          },
        },
        units: { unit: { displayName: `${label} unit`, blocks: ['text', 'problem'] } },
        subsections: { subsection: { displayName: `${label} subsection`, units: ['unit'] } },
        sections: { section: { displayName: `${label} section`, subsections: ['subsection'] } },
        collections: { collection: { title: `${label} collection`, items: ['text'] } },
      }),
    );
  } catch (error) {
    if (!(error instanceof LibraryExistsError)) throw error;
  }
  const libraryKey = libraryKeyFor(org, slug);
  const library = await fetchLibrary(request, config, libraryKey);
  const blocks = (await listLibraryBlocks(request, config, libraryKey)).results;
  const byType = (type: string) => {
    const block = blocks.find((b) => b.block_type === type);
    if (block === undefined) {
      throw new Error(`The seeded library ${libraryKey} exists but has no ${type} block.`);
    }
    return block;
  };
  const text = byType('html');
  const hierarchy = await fetchBlockHierarchy(request, config, text.id);
  const one = <T extends { id: string; display_name: string }>(
    list: readonly T[],
    what: string,
  ) => {
    const [entry] = list;
    if (entry === undefined) {
      throw new Error(`The seeded library ${libraryKey} exists but has no ${what}.`);
    }
    return entry;
  };
  const unit = one(hierarchy.units, 'unit');
  const subsection = one(hierarchy.subsections, 'subsection');
  const section = one(hierarchy.sections, 'section');
  const container = (
    entry: { id: string; display_name: string },
    type: 'unit' | 'subsection' | 'section',
  ) => ({
    ...text,
    id: entry.id,
    display_name: entry.display_name,
    container_type: type,
    container_type_code: type,
  });
  const collection = one(
    (await listCollections(request, config, libraryKey)).results.map((c) => ({
      ...c,
      id: String(c.id),
      display_name: c.title,
    })),
    'collection',
  );
  return {
    org,
    library,
    libraryKey,
    blocks: { text, problem: byType('problem'), video: byType('video'), pdf: byType('pdf') },
    units: { unit: container(unit, 'unit') },
    subsections: { subsection: container(subsection, 'subsection') },
    sections: { section: container(section, 'section') },
    collections: {
      collection: { ...collection, id: Number(collection.id) },
    },
  };
}

/** A section label unique to this test and run, safe to match as the test's own data. */
function sectionLabel(testInfo: { testId: string; retry: number }, ordinal: number): string {
  return `E2E ${getRunId()} ${testInfo.testId.slice(-6)}R${testInfo.retry} S${ordinal}`;
}

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

  catalogHomePage: pageObjectFixture(CatalogHomePage),

  siteHeader: async ({ page }, use) => {
    await use(new HeaderBlock(page));
  },

  siteFooter: async ({ page }, use) => {
    await use(new FooterBlock(page));
  },

  signedOutVisitor: async ({ browser }, use) => {
    const context = await browser.newContext();
    const visitorPage = await context.newPage();
    await use({
      page: visitorPage,
      header: new HeaderBlock(visitorPage),
      footer: new FooterBlock(visitorPage),
    });
    await context.close();
  },

  chromeCase: async ({ page, request, config, siteHeader }, use, testInfo) => {
    await use({
      read: () => readPageChrome(page, siteHeader, request, config),
      expectKnownDefects: (context) => {
        const defects = knownChromeDefects(
          { ...context, viewportWidth: page.viewportSize()?.width ?? 0 },
          testIdsFromAnnotations(testInfo.annotations),
        );
        for (const defect of defects) testInfo.fail(true, defect.reason);
      },
      requireSupportUrl: (chrome, configured) => {
        testInfo.skip(
          (chrome.supportUrl !== undefined) !== configured,
          configured
            ? 'The target configures no SUPPORT_URL, so its headers offer no Help link.'
            : 'The target configures a SUPPORT_URL, so the no-Help-link case does not apply.',
        );
      },
    });
  },

  publicChrome: async ({ catalogHomePage, chromeCase }, use) => {
    await catalogHomePage.goto();
    const pageChrome = await chromeCase.read();
    chromeCase.expectKnownDefects({
      generations: [pageChrome.generation],
      signedIn: false,
      scenario: 'navigation',
    });
    await use(pageChrome);
  },

  courseAboutPage: pageObjectFixture(CourseAboutPage),

  unitPage: pageObjectFixture(UnitPage),

  courseOutlinePage: pageObjectFixture(CourseOutlinePage),

  progressPage: pageObjectFixture(ProgressPage),

  courseToolsPage: pageObjectFixture(CourseToolsPage),

  profilePage: pageObjectFixture(ProfilePage),

  profileLearner: async ({ request, config, courseLearner }, use) => {
    await updateAccount(request, config, courseLearner.identity.username, {
      year_of_birth: ADULT_YEAR_OF_BIRTH,
    });
    await use(courseLearner);
  },

  teamsCourse: async ({ request, config, contentCourse }, use) => {
    const topicId = 'e2e-teams';
    const settings = (await fetchAdvancedSettings(
      request,
      config,
      contentCourse.courseKey,
    )) as Record<
      string,
      {
        readonly value?: {
          readonly enabled?: boolean;
          readonly team_sets?: readonly { id?: string }[];
        };
      }
    >;
    const current = settings.teams_configuration?.value;
    if (!current?.enabled || !current.team_sets?.some((set) => set.id === topicId)) {
      await buildWithAuthorWriteSession(request, config, () =>
        updateAdvancedSettings(request, config, contentCourse.courseKey, {
          teams_configuration: {
            enabled: true,
            team_sets: [
              {
                id: topicId,
                name: 'E2E teams',
                description: 'Teams the end-to-end suite creates',
                type: 'open',
              },
            ],
          },
        }),
      );
    }
    await use({ ...contentCourse, topicId });
  },

  adminDashboardPage: async ({ adminPage, config }, use) => {
    await use(new DashboardPage(adminPage, config));
  },

  courseEmailEnabled: async ({ config, adminLms, contentCourse }, use) => {
    await adminLms((session) => enableCourseEmail(session, config, contentCourse.courseKey));
    await use();
  },

  profileViewer: async ({ playwright, config }, use) => {
    const viewer = await playwright.request.newContext();
    try {
      const identity = await provisionLearnerSession(viewer, config);
      await use({ request: viewer, username: identity.username });
    } finally {
      await viewer.dispose();
    }
  },

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

  courseIntroVideoId: async ({ courseDetail }, use) => {
    const uri = courseDetail.courseVideoUri ?? '';
    const id = /(?:youtu\.be\/|[?&]v=|\/embed\/)([\w-]{6,})/.exec(uri)?.[1];
    base.skip(id === undefined, `The configured course has no YouTube intro video ("${uri}").`);
    await use(id as string);
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
            await use({ identity: learnerIdentityFor(username), stateFile });
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
    // Refresh the persisted worker-author session before the `page`/`request`
    // contexts load it, in two cases — both because a context built from a stale
    // state file cannot be healed in place (`APIRequestContext` exposes no cookie
    // mutation), so a lapsed session there fails every session-authed write until
    // the file is rewritten:
    //
    //   * `retry > 0` — the previous attempt may have failed because the
    //     memory-constrained CI evicted the session from its shared cache mid-run
    //     and the file still holds the dead one; and
    //   * the stored login JWT has lapsed (or is within the refresh margin) —
    //     a worker whose Studio run outlives the ~1 h JWT. While the JWT is live a
    //     decayed session behind it needs no refresh here (the SSO handshake in
    //     `buildWithAuthorWriteSession` rebuilds it off the JWT); once the JWT
    //     itself lapses there is nothing left to authorize that handshake, and the
    //     author-write fixtures (`ownSection`, `authorSection`) would otherwise
    //     throw at setup. `storedSessionNeedsRefresh` reads the file to decide.
    //
    // A fresh sign-in on a clean context (a login is refused on a jar that still
    // holds session cookies) restores it for both contexts. The JWT gate spends a
    // login only about once an hour per worker — nowhere near the 30 / 5 min LMS
    // login limit — so a healthy sub-hour run still pays nothing. API-side
    // counterpart to `studioAuthorSession`'s in-test browser recovery.
    if (
      workerAuthor !== undefined &&
      (testInfo.retry > 0 || storedSessionNeedsRefresh(workerAuthor.stateFile))
    ) {
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
              // Beta testers may see content up to a year before its release
              // (the instructor dashboard's beta-tester case); Epic 8's fixed
              // 2100 release dates stay out of reach.
              days_early_for_beta: 365,
            });
            // Report generation on the instructor dashboard needs the course
            // `data_researcher` role, which the creator does not get by default.
            // The grant goes through the v2 instructor API, which only exists
            // where the dashboard MFE does (verawood onward) — a worker seed is not
            // protected by the test-level capability gate, so guard it here.
            if (config.capabilities.has('instructor-dashboard')) {
              await ensureDataResearcher(request, config, courseKey);
            }
          },
        ),
      );
    },
    // Three extra Studio/LMS writes on top of the create.
    { scope: 'worker', timeout: TIMEOUTS.studioSetup * 2 },
  ],

  certificateCourse: [
    async ({ playwright, workerAuthor }, use, workerInfo) => {
      const config = getConfig();
      const identity = newCourseIdentity(
        config,
        getRunId(),
        `W${workerInfo.parallelIndex}K`,
        'certificates',
      );
      let seeded:
        Pick<CertificateCourse, 'subsectionKey' | 'problem' | 'certificateBearingMode'> | undefined;
      const course = await provisionWorkerCourse(
        playwright,
        workerAuthor,
        identity,
        async (request, courseKey) => {
          // Every write is idempotent, so a restarted worker re-seeds harmlessly.
          await updateCourseDetails(request, config, courseKey, {
            start_date: CONTENT_COURSE_START,
            end_date: CERTIFICATE_COURSE_END,
            certificates_display_behavior: 'early_no_info',
          });
          await updateGradingPolicy(request, config, courseKey, {
            graders: [
              { type: 'Homework', min_count: 1, drop_count: 0, short_label: 'HW', weight: 100 },
            ],
            grade_cutoffs: { Pass: 0.5 },
            grace_period: null,
            minimum_grade_credit: 0.8,
          });
          if (config.capabilities.has('instructor-dashboard')) {
            await ensureDataResearcher(request, config, courseKey);
          }
          // A certificate-bearing mode needs the staff session; without one the
          // course is still seeded and `certificateGenerationEnabled` skips.
          // (`ensureCertificateBearingMode` answers whether it *added* a mode;
          // either way the mode exists once it returns.)
          let certificateBearingMode = false;
          const staffState = authStateFile('staff');
          if (config.credentials.admin !== undefined && isUsableStateFile(staffState)) {
            const staff = await playwright.request.newContext({ storageState: staffState });
            try {
              await ensureCertificateBearingMode(staff, config, courseKey);
              certificateBearingMode = true;
            } finally {
              await staff.dispose();
            }
          }
          // Studio never refuses a duplicate certificate, so a re-seed must check
          // before creating rather than rely on an error.
          const existing = await fetchCertificateConfiguration(request, config, courseKey);
          if (existing.certificates.length === 0) {
            await createCertificate(request, config, courseKey, {
              name: `E2E certificate ${getRunId()}`,
              signatories: [
                { name: 'E2E Signatory', title: 'Instructor', organization: identity.org },
              ],
            });
          }
          await setCertificateActive(request, config, courseKey, true);
          await setCourseCertificateGeneration(request, config, courseKey, true);
          const section = await buildSection(
            request,
            config,
            courseKey,
            `E2E certificate ${getRunId()} W${workerInfo.parallelIndex}`,
            {
              subsections: [
                { gradedAs: 'Homework', units: [{ blocks: ['multiplechoiceresponse'] }] },
              ],
              publish: true,
            },
          );
          seeded = { ...firstProblem(section), certificateBearingMode };
        },
      );
      if (seeded === undefined) {
        throw new Error(`The certificate course ${identity.courseKey} was not seeded.`);
      }
      await use({ ...course, ...seeded });
    },
    // Around ten Studio/LMS writes on top of the create.
    { scope: 'worker', timeout: TIMEOUTS.studioSetup * 3 },
  ],

  videoFreeCourse: [
    async ({ playwright, workerAuthor }, use, workerInfo) => {
      const config = getConfig();
      const identity = newCourseIdentity(
        config,
        getRunId(),
        `W${workerInfo.parallelIndex}E`,
        'video-free',
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

  seededUploadAgreements: [
    async ({ playwright }, use) => {
      const config = getConfig();
      const admin = config.credentials.admin;
      if (!config.capabilities.has('upload-agreements') || admin === undefined) {
        await use({ gating: {}, types: [] });
        return;
      }
      const probe = await playwright.request.newContext();
      let gating;
      try {
        gating = (await fetchAuthoringMfeConfig(probe, config)).agreementGating;
      } finally {
        await probe.dispose();
      }
      const types = agreementTypesIn(gating);
      if (types.length === 0) {
        await use({ gating, types });
        return;
      }

      // Seed a UserAgreement row per type through the LMS admin (idempotent), on a
      // fresh LMS session under the admin lock (PREVENT_CONCURRENT_LOGINS). Once
      // per worker rather than per test: the rows are global, and an admin
      // sign-in per test would trip the LMS login rate limit (30 / 5 min).
      await withAdminSession(async () => {
        const session = await playwright.request.newContext();
        try {
          await loginSession(session, config, {
            emailOrUsername: admin.username,
            password: admin.password,
          });
          for (const type of types) {
            await ensureAgreement(session, config, {
              type,
              name: `E2E ${type}`,
              summary: `E2E agreement ${type}`,
              url: `${config.baseUrls.lms}/e2e-agreement/${type}`,
            });
          }
        } finally {
          await session.dispose();
        }
      });
      await use({ gating, types });
    },
    { scope: 'worker', timeout: TIMEOUTS.studioSetup },
  ],

  authzMigrationMode: [
    async ({ playwright }, use, workerInfo) => {
      const config = getConfig();
      const admin = config.credentials.admin;
      if (!config.capabilities.has('rbac') || admin === undefined) {
        await use(undefined);
        return;
      }
      // The probe organization holds no courses, so forcing the flag on for it
      // changes nobody's access; a target that migrates by itself still records
      // a run (with nothing in it), which is the whole signal.
      const org = `E2EAUTHZ${getRunId()}W${workerInfo.parallelIndex}`.toUpperCase();
      const probe = await withAdminLmsSession(
        playwright,
        config,
        { emailOrUsername: admin.username, password: admin.password },
        (session) => probeMigrationMode(session, config, org),
      );
      await use(probe);
    },
    { scope: 'worker', timeout: TIMEOUTS.studioSetup },
  ],

  rbacCast: [
    async ({ playwright, browser }, use) => {
      const config = getConfig();
      const cast = new Map<RbacCastPart, StudioColleague>();
      const made: StudioColleague[] = [];

      await use(async (part) => {
        const existing = cast.get(part);
        if (existing !== undefined) return existing;

        const request = await playwright.request.newContext();
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
        const context = await browser.newContext();
        await context.addCookies((await request.storageState()).cookies);
        const castPage = await context.newPage();
        const member: StudioColleague = {
          identity,
          request,
          context,
          page: castPage,
          libraryPage: new LibraryPage(castPage, config),
          unitPage: new StudioUnitPage(castPage, config),
          libraryPicker: new LibraryPickerDialog(castPage, config),
          studioHomePage: new StudioHomePage(castPage, config),
        };
        cast.set(part, member);
        made.push(member);
        return member;
      });

      for (const member of made) {
        await member.context.close();
        await member.request.dispose();
      }
    },
    { scope: 'worker', timeout: TIMEOUTS.studioSetup },
  ],

  forumCast: [
    async ({ playwright, browser, contentCourse, workerAuthor }, use) => {
      const config = getConfig();
      const cast = new Map<ForumCastPart, Promise<RoundTripLearner>>();
      const made: RoundTripLearner[] = [];

      const provision = async (part: ForumCastPart): Promise<RoundTripLearner> => {
        const member = await provisionRoundTripLearner(
          playwright,
          browser,
          config,
          contentCourse.courseKey,
        );
        made.push(member);
        if (part === 'moderator') {
          // The course's instructor grants the forum role (v2 team API, which
          // accepts the author's JWT); the moderator's own reading confirms it,
          // because the role list itself is closed to a course instructor (403).
          const author = await playwright.request.newContext({
            storageState: workerAuthor?.stateFile,
          });
          try {
            await grantCourseTeamRole(
              author,
              config,
              contentCourse.courseKey,
              [member.identity.email],
              'Moderator',
            );
          } finally {
            await author.dispose();
          }
          const forum = await fetchDiscussionCourse(
            member.request,
            config,
            contentCourse.courseKey,
          );
          if (!forum.has_moderation_privileges) {
            throw new Error(
              `The Moderator grant to ${member.identity.username} in ${contentCourse.courseKey} ` +
                `did not take: its forum roles are ${JSON.stringify(forum.user_roles)}.`,
            );
          }
        }
        return member;
      };

      await use((part) => {
        let member = cast.get(part);
        if (member === undefined) {
          member = provision(part);
          cast.set(part, member);
        }
        return member;
      });

      for (const member of made) {
        await disposeRoundTripLearner(member);
      }
    },
    { scope: 'worker', timeout: TIMEOUTS.studioSetup },
  ],

  authzCourse: [
    async ({ playwright, workerAuthor, authzMigrationMode }, use, workerInfo) => {
      const config = getConfig();
      const admin = config.credentials.admin;
      if (workerAuthor === undefined || authzMigrationMode === undefined || admin === undefined) {
        await use(undefined);
        return;
      }
      const identity = newCourseIdentity(
        config,
        getRunId(),
        `W${workerInfo.parallelIndex}Z`,
        'authz',
      );
      const course = await provisionWorkerCourse(playwright, workerAuthor, identity);
      const note = `e2e ${getRunId()} authz course`;

      const withAdminLms = async (work: (session: APIRequestContext) => Promise<void>) =>
        withAdminLmsSession(
          playwright,
          config,
          { emailOrUsername: admin.username, password: admin.password },
          work,
        );

      await withAdminLms(async (session) => {
        // Clear first **only if there is something to clear**: a previous attempt
        // in this slot may have left the override on, because worker teardown
        // does not always run. Writing a neutralizing row unconditionally would
        // land it in the same second as the enabling row, and the platform picks
        // the previous record by timestamp — with both in the same second it can
        // conclude nothing changed and skip the migration.
        const states = await fetchWaffleFlagStates(session, config);
        const stale = [...states.courseOverrides.on, ...states.courseOverrides.off].includes(
          course.courseKey,
        );
        if (stale) {
          await disableAuthzForCourse(session, config, course.courseKey, {
            mode: authzMigrationMode.mode,
            note: `${note} preflight`,
          });
        }
        await enableAuthzForCourse(session, config, course.courseKey, {
          mode: authzMigrationMode.mode,
          note,
        });
        if (authzMigrationMode.mode === 'manual') {
          // Nothing migrated the legacy team, and a flag-on course with no authz
          // roles refuses everyone — including the author who created it. Grant
          // the role the author's legacy `instructor` row would have become.
          await assignRole(session, config, {
            role: 'course_admin',
            scopes: [course.courseKey],
            users: [workerAuthor.identity.username],
          });
        }
      });

      await use({
        ...course,
        mode: authzMigrationMode.mode,
        modeEvidence: authzMigrationMode.evidence,
      });

      // Neutralize the override. Where the target migrates by itself this is
      // also the rollback, so the course goes back to legacy roles.
      //
      // Best-effort, and it says so when it fails: the course is unique to this
      // run, so a leftover override strands only a course nothing else uses, and
      // failing the worker here would report a teardown problem as a test
      // failure. Playwright also does not always reach worker teardown, which is
      // why setup clears the override before enabling it.
      try {
        await withAdminLms(async (session) => {
          await disableAuthzForCourse(session, config, course.courseKey, {
            mode: authzMigrationMode.mode,
            note: `${note} teardown`,
          });
        });
      } catch (error) {
        console.warn(
          `[authzCourse] could not turn AuthZ off again for ${course.courseKey}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    { scope: 'worker', timeout: TIMEOUTS.studioSetup * 2 },
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

  authoringSidebar: pageObjectFixture(AuthoringSidebar),

  tagDrawer: pageObjectFixture(TagDrawer),
  // Not a bare `pageObjectFixture`: on a gated installation the authoring MFE
  // disables the whole Files page — toolbar, view toggle, table and every row —
  // until the author has accepted the outstanding upload agreements, which shows
  // up as an unactionable click rather than anything agreement-shaped. Taking the
  // acceptance here means no Files spec can forget it.
  filesPage: async ({ page, config, acceptedUploadAgreements }, use) => {
    void acceptedUploadAgreements;
    await use(new FilesPage(page, config));
  },
  textbooksPage: pageObjectFixture(TextbooksPage),
  updatesPage: pageObjectFixture(UpdatesPage),

  studioVideoEditor: pageObjectFixture(StudioVideoEditor),

  studioTextEditor: pageObjectFixture(StudioTextEditor),

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

  certificateAvailableDateField: async (
    { request, config, authoredCourse, certificateSwitch },
    use,
  ) => {
    // Studio offers the fields for an instructor-paced course only while
    // automatic certificate generation is on, which the switch fixture holds.
    await certificateSwitch.turnOn();
    const offered = await pollUntil(
      async () =>
        (await fetchCourseSettingsFlags(request, config, authoredCourse.courseKey))
          .canShowCertificateAvailableDateField,
      (shown) => shown,
      TIMEOUTS.contentPublish,
    );
    if (!offered.satisfied) {
      throw new Error(
        'Schedule & Details still does not offer the "Certificates available date" fields with ' +
          'certificates.auto_certificate_generation on (can_show_certificate_available_date_field).',
      );
    }
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

  adminApi: async ({ playwright, config }, use) => {
    const staffState = authStateFile('staff');
    base.skip(
      config.credentials.admin === undefined || !isUsableStateFile(staffState),
      'This case needs the administrator: set ADMIN_USERNAME and ADMIN_PASSWORD (a superuser).',
    );
    // Held under the admin lock for the whole test: another worker signing in as
    // the admin would evict this session (PREVENT_CONCURRENT_LOGINS).
    await withAdminSession(async () => {
      const admin = await playwright.request.newContext({ storageState: staffState });
      try {
        await establishStudioSession(admin, config);
        await use(admin);
      } finally {
        await admin.dispose();
      }
    });
  },

  adminLms: async ({ playwright, config }, use) => {
    const admin = config.credentials.admin;
    base.skip(
      admin === undefined,
      'This coverage writes through the Django admin, which needs a superuser session. Set ' +
        'ADMIN_USERNAME and ADMIN_PASSWORD.',
    );
    const credentials = {
      emailOrUsername: (admin as NonNullable<typeof admin>).username,
      password: (admin as NonNullable<typeof admin>).password,
    };
    await use(async (work) => withAdminLmsSession(playwright, config, credentials, work));
  },

  adminConsole: async ({ page, config, request }, use) => {
    const mfe = await fetchAuthoringMfeConfig(request, config);
    if (mfe.adminConsoleUrl === undefined) {
      throw new Error(
        'The `rbac` capability is declared but this installation advertises no ADMIN_CONSOLE_URL ' +
          'in its authoring MFE config, so the Roles and Permissions console is not served. ' +
          'Deploy the admin-console MFE or stop declaring `rbac`.',
      );
    }
    const origin = mfe.adminConsoleUrl;
    await use({
      origin,
      console: new AdminConsolePage(page, config, origin),
      teamMembers: new TeamMembersTable(page),
      userAudit: new UserAuditPage(page, origin),
      assignRole: new AssignRoleWizard(page, origin),
      matrix: new PermissionsMatrix(page),
      auditFor: (other: Page) => new UserAuditPage(other, origin),
      consoleFor: (other: Page) => new AdminConsolePage(other, config, origin),
    });
  },

  automaticMigrationTarget: async ({ authzTarget }, use) => {
    base.skip(
      authzTarget.mode !== 'automatic',
      'These cases describe a target that migrates AuthZ roles when a waffle override is saved ' +
        `(${authzTarget.modeEvidence}). This one leaves migration to an operator, so there is no ` +
        'migration run to read; set ENABLE_AUTOMATIC_AUTHZ_COURSE_AUTHORING_MIGRATION to cover it.',
    );
    await use();
  },

  manualMigrationTarget: async ({ authzTarget }, use) => {
    base.skip(
      authzTarget.mode === 'automatic',
      'This target migrates AuthZ roles by itself when a waffle override is saved ' +
        `(${authzTarget.modeEvidence}), so the stock default these cases describe does not ` +
        'apply here; the migrating path has its own coverage.',
    );
    await use();
  },

  authzTarget: async ({ authzCourse }, use) => {
    base.skip(
      authzCourse === undefined,
      'AuthZ coverage needs the `rbac` capability and an admin account: the waffle override that ' +
        'puts a course under openedx-authz is a Django-admin write.',
    );
    await use(authzCourse as AuthzCourse);
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
    await use(
      await buildWithAuthorWriteSession(request, config, () =>
        buildSection(
          request,
          config,
          contentCourse.courseKey,
          sectionLabel(testInfo, 0),
          DEFAULT_SECTION_SHAPE,
        ),
      ),
    );
  },

  authorSection: async ({ request, config, contentCourse }, use, testInfo) => {
    let ordinal = 0;
    await use(async (shape = DEFAULT_SECTION_SHAPE, label) => {
      ordinal += 1;
      return buildWithAuthorWriteSession(request, config, () =>
        buildSection(
          request,
          config,
          contentCourse.courseKey,
          label ?? sectionLabel(testInfo, ordinal),
          shape,
        ),
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

  resyncStudioAuthor: async ({ page, config, workerAuthor }, use) => {
    const resync = async (): Promise<void> => {
      // No cheap pre-check here, deliberately: a Studio **read** can answer on a
      // session whose **write** path then 302s to sign-in (measured — a
      // `fetchStudioHome` probe passed and the next `POST /course/` was
      // redirected), so "the API answered" does not mean "the session this
      // fixture repairs is live". The navigation below is the check.
      // A real navigation to Studio Home re-completes the cms-sso handshake on
      // the browser's (and so `page.request`'s) shared cookie jar, healing the
      // session the library's v2 writes rotated — without the API `/login/`
      // handshake that corrupts a stale-LMS session.
      const live = await establishStudioBrowserSession(page, config);
      if (!live) {
        // The session had genuinely decayed (a prior test's learner left the
        // LMS half stale, or an eviction): a single UI sign-in refreshes both
        // halves. Uses the worker author's own identity so it never depends on
        // the (equally stale) API session.
        if (workerAuthor === undefined) {
          throw new Error(
            'resyncStudioAuthor found a decayed Studio session but no worker author to sign ' +
              'back in as: it needs the studio-author project (workerAuthor).',
          );
        }
        const username = workerAuthor.identity.username;
        await signInToStudioThroughUi(page, config, {
          emailOrUsername: username,
          password: DEFAULT_PASSWORD,
        });
      }
      if (workerAuthor) {
        persistStorageState(await page.context().storageState(), workerAuthor.stateFile);
      }
    };
    await use(resync);
  },

  roundTripLearnerLater: async ({ playwright, browser, config, contentCourse }, use) => {
    await deferredLearner(playwright, browser, config, contentCourse.courseKey, use);
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

  notificationRecipient: async ({ playwright, browser, config, contentCourse }, use) => {
    const made: RoundTripLearner[] = [];
    try {
      await use(async (options = {}) => {
        const learner = await provisionRoundTripLearner(
          playwright,
          browser,
          config,
          contentCourse.courseKey,
        );
        made.push(learner);
        await applyNotificationOptions(learner.request, config, options);
        return learner;
      });
    } finally {
      for (const learner of made) {
        await disposeRoundTripLearner(learner);
      }
    }
  },

  inboxLearner: async ({ playwright, config }, use) => {
    const provider = await resolveMailProvider(config);
    const request = await playwright.request.newContext();
    try {
      const inbox = await provider.createInbox({ config, request });
      try {
        const identity = await provisionLearnerSession(request, config, { email: inbox.address });
        await use({ identity, request, inbox });
      } finally {
        await inbox.dispose(request);
      }
    } finally {
      await request.dispose();
    }
  },

  mailboxLearner: async ({ playwright, browser, config, contentCourse }, use) => {
    const provider = await resolveMailProvider(config);
    const made: MailboxLearner[] = [];
    try {
      await use(async (options = {}) => {
        const setup = await playwright.request.newContext();
        let inbox: Inbox;
        try {
          inbox = await provider.createInbox({ config, request: setup });
        } finally {
          await setup.dispose();
        }
        const learner = await provisionRoundTripLearner(
          playwright,
          browser,
          config,
          contentCourse.courseKey,
          { identity: { email: inbox.address } },
        );
        const member = { ...learner, inbox };
        made.push(member);
        await applyNotificationOptions(learner.request, config, options);
        return member;
      });
    } finally {
      for (const member of made) {
        await member.inbox.dispose(member.request);
        await disposeRoundTripLearner(member);
      }
    }
  },

  notificationTray: async ({ page, config }, use) => {
    await use(new NotificationTray(page, config));
  },

  // The forum fixtures act as the worker author on `page.request`, after
  // `studioAuthorSession`: specs drive the author's browser too, and the same
  // user on a second (`request`) context is evicted by the browser's session
  // work (CONVENTIONS "Authoring-to-learner round trips") — measured here as a
  // 302 on the section build.
  forumCourse: async ({ page, config, contentCourse, studioAuthorSession }, use) => {
    void studioAuthorSession;
    const { courseKey } = contentCourse;
    const outcome = await pollUntil(
      async () =>
        (await listDiscussionTopics(page.request, config, courseKey)).map((topic) => topic.id),
      (ids) => ids.includes(GENERAL_TOPIC_ID),
      TIMEOUTS.contentPublish,
    );
    if (!outcome.satisfied) {
      throw new Error(
        `The forum of ${courseKey} lists no "${GENERAL_TOPIC_ID}" topic after ` +
          `${outcome.elapsedMs} ms (topics: ${JSON.stringify(outcome.last)}). Is the course on ` +
          'the openedx discussion provider?',
      );
    }
    await use(contentCourse);
  },

  forumUnit: async ({ page, config, forumCourse }, use, testInfo) => {
    const request = page.request;
    const { courseKey } = forumCourse;
    const section = await buildWithAuthorWriteSession(request, config, () =>
      buildSection(request, config, courseKey, sectionLabel(testInfo, 90), {
        subsections: [{ units: [{ blocks: ['html'] }] }],
        publish: true,
      }),
    );
    const unit = section.units[0]!;
    // Publishing gives the unit an in-context topic, listed once the sync task runs.
    const outcome = await pollUntil(
      () => listDiscussionTopics(request, config, courseKey),
      (topics) => topics.some((topic) => topic.usage_key === unit.usageKey),
      TIMEOUTS.contentPublish,
    );
    const topic = outcome.last.find((candidate) => candidate.usage_key === unit.usageKey);
    if (topic === undefined) {
      throw new Error(
        `Unit ${unit.usageKey} got no discussion topic within ${outcome.elapsedMs} ms of ` +
          'being published.',
      );
    }
    await use({
      courseKey,
      section,
      sequentialId: unit.sequentialUsageKey,
      unitId: unit.usageKey,
      topicId: topic.id,
    });
  },

  oraUnit: async ({ page, config, contentCourse, studioAuthorSession }, use, testInfo) => {
    void studioAuthorSession;
    const request = page.request;
    const { courseKey } = contentCourse;
    const label = sectionLabel(testInfo, 91);
    const displayName = `${label} ORA`;
    const { unit, oraUsageKey } = await buildWithAuthorWriteSession(request, config, async () => {
      const section = await buildSection(request, config, courseKey, label, {
        subsections: [{ units: [{ blocks: [] }] }],
      });
      const built = section.units[0]!;
      return {
        unit: built,
        oraUsageKey: await authorStaffGradedOra(request, config, built.usageKey, displayName),
      };
    });
    await use({
      courseKey,
      sequentialId: unit.sequentialUsageKey,
      unitId: unit.usageKey,
      oraUsageKey,
      displayName,
    });
  },

  videoFreeSection: async (
    { page, config, videoFreeCourse, studioAuthorSession },
    use,
    testInfo,
  ) => {
    void studioAuthorSession;
    // Built on the author's browser session: creating the worker course can
    // leave a separate request context without a live Studio session, and the
    // browser session is the one `studioAuthorSession` keeps alive.
    let ordinal = 0;
    await use(async (shape) => {
      ordinal += 1;
      return buildWithAuthorWriteSession(page.request, config, () =>
        buildSection(
          page.request,
          config,
          videoFreeCourse.courseKey,
          sectionLabel(testInfo, ordinal),
          shape,
        ),
      );
    });
  },

  videoFreeCourseLearner: async ({ playwright, browser, config, videoFreeCourse }, use) => {
    const learner = await provisionRoundTripLearner(
      playwright,
      browser,
      config,
      videoFreeCourse.courseKey,
    );
    try {
      await use(learner);
    } finally {
      await disposeRoundTripLearner(learner);
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

  instructorCourseInfo: pageObjectFixture(InstructorCourseInfoPage),
  instructorEnrollments: pageObjectFixture(InstructorEnrollmentsPage),
  instructorGrading: pageObjectFixture(InstructorGradingPage),
  instructorDateExtensions: pageObjectFixture(InstructorDateExtensionsPage),
  instructorDataDownloads: pageObjectFixture(InstructorDataDownloadsPage),
  instructorCertificates: pageObjectFixture(InstructorCertificatesPage),

  certificateGenerationEnabled: async ({ page, playwright, config, certificateCourse }, use) => {
    const admin = config.credentials.admin;
    base.skip(
      admin === undefined || !certificateCourse.certificateBearingMode,
      'Certificates need the administrator: the platform-wide certificate switch lives in ' +
        'the Django admin and the honor course mode needs a staff session. Set ' +
        'ADMIN_USERNAME and ADMIN_PASSWORD (a superuser).',
    );
    // The switch is platform-wide and usually already on after the first test of a
    // run: read it as the author first (a JWT read), and only when it is off pay
    // for an admin sign-in — every credential login counts against the per-account
    // rate limit and evicts the admin's other LMS session.
    if (
      !(await fetchCertificateGenerationEnabled(page.request, config, certificateCourse.courseKey))
    ) {
      // A Django-admin write needs the admin's *session* cookie: sign in afresh on a
      // throwaway context, under the admin lock (PREVENT_CONCURRENT_LOGINS).
      await withAdminSession(async () => {
        const session = await playwright.request.newContext();
        try {
          await loginSession(session, config, {
            emailOrUsername: (admin as NonNullable<typeof admin>).username,
            password: (admin as NonNullable<typeof admin>).password,
          });
          await ensureCertificateGenerationEnabled(session, config, certificateCourse.courseKey);
        } finally {
          await session.dispose();
        }
      });
    }
    await use();
  },

  certificateLearner: async (
    { playwright, browser, config, certificateCourse, certificateGenerationEnabled },
    use,
  ) => {
    // Depends on the skip above: without an admin there is no honor mode to
    // enroll into, and the spec must skip rather than fail here.
    void certificateGenerationEnabled;
    // Held shared for the whole test: the auto-generation switch is global, and
    // a case that turns it on (`certificateAutoGeneration`) must not do so while
    // this learner's certificate is expected to wait for a request.
    await withSharedLock(CERTIFICATE_SWITCH_LOCK, { waitMs: TIMEOUTS.sharedLockWait }, async () => {
      const learner = await provisionRoundTripLearner(
        playwright,
        browser,
        config,
        certificateCourse.courseKey,
        { mode: 'honor' },
      );
      try {
        await use(learner);
      } finally {
        await disposeRoundTripLearner(learner);
      }
    });
  },

  certificateSwitch: async ({ config, adminLms }, use) => {
    const setSwitch = (active: boolean) =>
      adminLms((session) =>
        setWaffleSwitch(session, config, AUTO_CERTIFICATE_GENERATION_SWITCH, active),
      );
    await withExclusiveLock(
      CERTIFICATE_SWITCH_LOCK,
      { waitMs: TIMEOUTS.sharedLockWait },
      async () => {
        // Start from the platform default whatever an earlier, interrupted run left.
        await setSwitch(false);
        try {
          await use({ turnOn: () => setSwitch(true) });
        } finally {
          await setSwitch(false);
        }
      },
    );
  },

  certificateAutoGeneration: async (
    {
      playwright,
      browser,
      config,
      certificateCourse,
      certificateGenerationEnabled,
      certificateSwitch,
    },
    use,
  ) => {
    void certificateGenerationEnabled;
    const learner = await provisionRoundTripLearner(
      playwright,
      browser,
      config,
      certificateCourse.courseKey,
      { mode: 'honor' },
    );
    try {
      await use({ learner, turnOn: certificateSwitch.turnOn });
    } finally {
      await disposeRoundTripLearner(learner);
    }
  },

  gradedProblemWithWrongAnswer: async (
    { page, config, contentCourse, roundTripLearner, studioAuthorSession },
    use,
    testInfo,
  ) => {
    void studioAuthorSession;
    // Same user in browser and API → `page.request` (a separate `request` context
    // is evicted by the browser's own Studio session work; see
    // tests/studio/home/course-lifecycle.spec.ts).
    const author = page.request;
    const section = await buildSection(
      author,
      config,
      contentCourse.courseKey,
      sectionLabel(testInfo, 1),
      {
        subsections: [{ gradedAs: 'Homework', units: [{ blocks: ['multiplechoiceresponse'] }] }],
        publish: true,
      },
    );
    const { subsectionKey, problem } = firstProblem(section);
    // A due date a week out: what the extension case extends, harmless otherwise.
    const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await updateXBlock(author, config, subsectionKey, { metadata: { due } });
    await roundTripLearner.prime(subsectionKey);
    await submitProblem(
      roundTripLearner.request,
      config,
      section.courseKey,
      problem,
      problem.incorrect,
    );
    await use({ section, subsectionKey, problem, due, learner: roundTripLearner });
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

  authoringCourseLearnerLater: async ({ playwright, browser, config, authoringCourse }, use) => {
    await deferredLearner(playwright, browser, config, authoringCourse.courseKey, use);
  },

  authoringCourseLearners: async ({ playwright, browser, config, authoringCourse }, use) => {
    const learners = await Promise.all([
      provisionRoundTripLearner(playwright, browser, config, authoringCourse.courseKey),
      provisionRoundTripLearner(playwright, browser, config, authoringCourse.courseKey),
    ]);
    try {
      await use([learners[0], learners[1]]);
    } finally {
      await Promise.all(learners.map(disposeRoundTripLearner));
    }
  },

  // --- Content libraries (Epic 10) ------------------------------------------------

  libraryPage: pageObjectFixture(LibraryPage),

  libraryContainerPage: pageObjectFixture(LibraryContainerPage),

  createLibraryPage: pageObjectFixture(CreateLibraryPage),

  libraryPicker: pageObjectFixture(LibraryPickerDialog),

  previewChangesDialog: pageObjectFixture(PreviewChangesDialog),

  courseLibrariesPage: pageObjectFixture(CourseLibrariesPage),

  legacyMigrationPage: pageObjectFixture(LegacyMigrationPage),

  seededLibrary: async ({ page, config, studioAuthorSession }, use, testInfo) => {
    void studioAuthorSession;
    // On the test's own `page.request`, never a side context: a side context
    // either shares (and rotates) this session or signs in a second account that
    // evicts it. The spec re-syncs once through `resyncStudioAuthor` before its
    // course writes — CONVENTIONS.md "Library round trips" has the measurements.
    const org = config.org ?? DEFAULT_COURSE_ORG;
    const slug = librarySlug(
      `w${testInfo.testId.replace(/[^\w]/g, '').slice(-6)}r${testInfo.retry}`,
    );
    const library = await provisionLibrary(page.request, config, org, slug);
    try {
      await use(library);
    } finally {
      await deleteLibraryBestEffort(page.request, config, library.libraryKey, testInfo);
    }
  },

  authoringLibrary: async ({ page, config, studioAuthorSession }, use, testInfo) => {
    void studioAuthorSession;
    // Same user in browser and API → `page.request` (course-lifecycle.spec.ts).
    const request = page.request;
    const org = config.org ?? DEFAULT_COURSE_ORG;
    const slug = librarySlug(
      `a${testInfo.testId.replace(/[^\w]/g, '').slice(-6)}r${testInfo.retry}`,
    );
    let library: ContentLibrary;
    try {
      library = await createLibrary(request, config, {
        org,
        slug,
        title: `E2E library ${getRunId()} ${testInfo.testId.slice(-6)}`,
      });
    } catch (error) {
      if (!(error instanceof LibraryExistsError)) throw error;
      library = await fetchLibrary(request, config, libraryKeyFor(org, slug));
    }
    try {
      await use(library);
    } finally {
      await deleteLibraryBestEffort(request, config, library.id, testInfo);
    }
  },

  workerTaxonomy: async ({ playwright, config }, use, testInfo) => {
    const org = requireTaxonomyAdmin(config);
    const seeded = await withAdminSession(async () => {
      const admin = await playwright.request.newContext({ storageState: authStateFile('staff') });
      try {
        await establishStudioSession(admin, config);
        return await seedTaxonomy(admin, config, {
          name: `E2E ${getRunId()} W${testInfo.workerIndex}`,
          org,
        });
      } finally {
        await admin.dispose();
      }
    });
    await use({ taxonomy: seeded, org });
  },

  taxonomyAdmin: async ({ browser, config }, use) => {
    const org = requireTaxonomyAdmin(config);
    const admin = config.credentials.admin as NonNullable<typeof config.credentials.admin>;
    // A fresh browser signed in through the UI, held under the admin lock for the
    // whole test (like `adminPage`): another worker's admin sign-in would end this
    // session (PREVENT_CONCURRENT_LOGINS). The page's own API context shares the
    // session, so the content-tagging oracles and cleanup run on `page.request`.
    await withAdminSession(async () => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await signInToStudioThroughUi(page, config, {
          emailOrUsername: admin.username,
          password: admin.password,
        });
        await use({
          list: new TaxonomyListPage(page, config),
          detail: new TaxonomyDetailPage(page, config),
          page,
          request: page.request,
          org,
        });
      } finally {
        await context.close();
      }
    });
  },

  uploadAgreements: async ({ config, seededUploadAgreements }, use) => {
    base.skip(
      !config.capabilities.has('upload-agreements') || config.credentials.admin === undefined,
      'Upload agreements are not declared for this installation, or no administrator is ' +
        'configured (the agreement rows are seeded through the LMS Django admin).',
    );
    base.skip(
      seededUploadAgreements.types.length === 0,
      'No AGREEMENT_GATING is configured on this installation.',
    );
    await use(seededUploadAgreements);
  },

  acceptedUploadAgreements: async ({ page, config, seededUploadAgreements }, use) => {
    // Every gated type, accepted for this test's author with its own session. The
    // rows already exist (the worker seeded them), so an acceptance that fails is
    // a real failure and is left to throw: swallowing it only resurfaces later as
    // an inexplicably disabled Files page.
    for (const type of seededUploadAgreements.types) {
      await acceptAgreement(page.request, config, type);
    }
    await use();
  },

  authoringTaxonomy: async ({ playwright, config }, use, testInfo) => {
    const org = requireTaxonomyAdmin(config);
    const name = `E2E ${getRunId()} ${testInfo.testId.slice(-6)}R${testInfo.retry}`;
    let taxonomy: Taxonomy | undefined;
    await withAdminSession(async () => {
      const admin = await playwright.request.newContext({ storageState: authStateFile('staff') });
      try {
        await establishStudioSession(admin, config);
        taxonomy = await importTaxonomy(admin, config, {
          name,
          description: 'E2E suite taxonomy',
          file: taxonomyImportFile(),
        });
        await setTaxonomyOrgs(admin, config, taxonomy.id, [org]);
      } finally {
        await admin.dispose();
      }
    });
    try {
      await use({ taxonomy: taxonomy as Taxonomy, org });
    } finally {
      const created = taxonomy;
      if (created !== undefined) {
        await withAdminSession(async () => {
          const admin = await playwright.request.newContext({
            storageState: authStateFile('staff'),
          });
          try {
            await establishStudioSession(admin, config);
            await deleteTaxonomy(admin, config, created.id);
          } catch {
            // Best-effort teardown: a run-unique name means a leftover never
            // collides, and a later run reuses it by name.
          } finally {
            await admin.dispose();
          }
        });
      }
    }
  },

  legacyLibrary: async (
    { page, config, studioAuthorSession, resyncStudioAuthor },
    use,
    testInfo,
  ) => {
    void studioAuthorSession;
    base.skip(
      !config.capabilities.has('content-libraries-v1'),
      'Legacy (v1) content libraries are not declared for this installation (content-libraries-v1).',
    );
    const request = page.request;
    // The legacy `/library/` writes below are session-authed like `/xblock/`;
    // re-sync through the browser first (CONVENTIONS.md "Library round trips").
    await resyncStudioAuthor();
    const home = await fetchStudioHome(request, config);
    if (!home.librariesV1Enabled) {
      throw new Error(
        'content-libraries-v1 is declared but Studio reports legacy libraries disabled ' +
          '(libraries_v1_enabled: false). Remove the capability or enable legacy libraries.',
      );
    }
    const org = config.org ?? DEFAULT_COURSE_ORG;
    const number = `L${getRunId()}${testInfo.testId.replace(/[^\w]/g, '').slice(-6)}R${testInfo.retry}`;
    const displayName = `E2E legacy ${getRunId()} ${testInfo.testId.slice(-6)}`;
    const libraryKey = await createLegacyLibrary(request, config, { org, number, displayName });
    const blockNames = [`${displayName} text`, `${displayName} problem`] as const;
    await addLegacyLibraryBlock(request, config, libraryKey, 'html', blockNames[0]);
    await addLegacyLibraryBlock(request, config, libraryKey, 'problem', blockNames[1]);
    await use({ libraryKey, displayName, blockNames });
  },

  studioColleague: async ({ playwright, browser, page, config }, use) => {
    const made: StudioColleague[] = [];
    await use(async (options = {}) => {
      const request = await playwright.request.newContext();
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
      if (options.libraryAccess !== undefined) {
        // The worker author (the library's admin) adds the colleague; the
        // author's own session rides `page.request`.
        await addLibraryTeamMember(
          page.request,
          config,
          options.libraryAccess.libraryKey,
          identity.email,
          options.libraryAccess.level,
        );
      }
      const context = await browser.newContext();
      await context.addCookies((await request.storageState()).cookies);
      const colleaguePage = await context.newPage();
      const colleague: StudioColleague = {
        identity,
        request,
        context,
        page: colleaguePage,
        libraryPage: new LibraryPage(colleaguePage, config),
        unitPage: new StudioUnitPage(colleaguePage, config),
        libraryPicker: new LibraryPickerDialog(colleaguePage, config),
        studioHomePage: new StudioHomePage(colleaguePage, config),
      };
      made.push(colleague);
      return colleague;
    });
    for (const colleague of made) {
      await colleague.context.close();
      await colleague.request.dispose();
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

  videoUnit: async ({ courseOutline }, use) => {
    const unit = unitsWithHtml5Video(courseOutline)[0];
    base.skip(
      unit === undefined,
      'The configured course has no video with an HTML5 source: a YouTube-only video ' +
        'plays in a cross-origin iframe the suite cannot drive.',
    );
    await use(unit as CourseUnit);
  },

  stubVideoSources: async ({ page }, use) => {
    await use((units) => stubVideoSources(page, units));
  },
});

export { expect };
