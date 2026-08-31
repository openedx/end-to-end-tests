import { test as base, expect } from '@playwright/test';

import { accountSignIn, provisionLearnerAccount } from '../accounts';
import {
  assertCourseAccessible,
  courseKeySkipReason,
  enrollInCourseViaApi,
  fetchCourseDetail,
  fetchCourseOutline,
  fetchCourseProgress,
  newLearnerIdentity,
  type CourseDetail,
  type CourseOutline,
  type CourseProgress,
  type LearnerIdentity,
} from '../api';
import { getConfig, type AppConfig } from '../config';
import { AccountMenu } from '../pages/lms/auth/account-menu.page';
import { AccountSettingsPage } from '../pages/lms/auth/account-settings.page';
import { CatalogPage } from '../pages/lms/catalog/catalog.page';
import { CourseAboutPage } from '../pages/lms/catalog/course-about.page';
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
  /** Header account menu carrying the sign-out affordance. */
  accountMenu: AccountMenu;
  /** authn MFE `/reset` (forgot-password) page object. */
  forgotPasswordPage: ForgotPasswordPage;
  /** Account settings page object (`frontend-app-account`). */
  accountSettingsPage: AccountSettingsPage;
  /**
   * A fresh, unique-per-run learner identity. Requesting the fixture yields a new
   * identity, so parallel tests never collide (ADR-0002 test-data rules).
   */
  learnerIdentity: LearnerIdentity;
  /** Catalog MFE page object (`frontend-app-catalog`). */
  catalogPage: CatalogPage;
  /** Course About page object. */
  courseAboutPage: CourseAboutPage;
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
  /** Reads the authoritative completion/grade state for the enrolled course. */
  courseProgress: () => Promise<CourseProgress>;
}

/** What {@link TestFixtures.courseLearner} hands a spec. */
export interface CourseLearner {
  readonly courseKey: string;
  readonly identity: LearnerIdentity;
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
export const test = base.extend<TestFixtures>({
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

  accountMenu: async ({ page, config }, use) => {
    await use(new AccountMenu(page, config));
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

  catalogPage: async ({ page, config }, use) => {
    await use(new CatalogPage(page, config));
  },

  courseAboutPage: async ({ page, config }, use) => {
    await use(new CourseAboutPage(page, config));
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
    const identity = await provisionLearnerAccount(request, config);
    await accountSignIn({
      config,
      request,
      credentials: { emailOrUsername: identity.email, password: identity.password },
    });

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
    await use(
      await fetchCourseOutline(
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
});

export { expect };
