import { existsSync } from 'node:fs';

import { test as base, expect } from '@playwright/test';

import { provisionLearnerSession } from '../accounts';
import { authStateFile } from '../auth';
import {
  ensureCourse,
  newCourseIdentity,
  studioOrigin,
  type CourseIdentity,
  unitsContaining,
  assertCourseAccessible,
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
}

/**
 * Fixtures shared by every test a worker runs. Worker scope is what keeps the
 * per-run Studio course count down: there is no course-deletion API, so a course
 * per *test* would leave dozens behind on a persistent target.
 */
export interface WorkerFixtures {
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

  authoredCourse: [
    async ({ playwright }, use, workerInfo) => {
      const config = getConfig();
      const authorState = authStateFile('author');
      if (!existsSync(authorState)) {
        throw new Error(
          `authoredCourse needs the author session (${authorState}), which only the ` +
            '"studio-author" project provides. Run Studio specs in that project.',
        );
      }

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
