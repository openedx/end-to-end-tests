import type { Page } from '@playwright/test';

import type { AccountCredentials } from '../accounts';
import { studioOrigin, type CourseIdentity } from '../api';
import type { AppConfig } from '../config';
import { STUDIO_HOME_SELECTORS } from '../config';
import { signIn } from './auth';
import type { StudioHomePage } from '../pages/studio/home/studio-home.page';
import type { StudioCourseOutlinePage } from '../pages/studio/course-outline.page';
import type { CourseCreatorAdminPage } from '../pages/studio/admin/course-creator-admin.page';

/** What creating a course through the UI produced, for the spec to judge. */
export interface StudioCourseCreation {
  /** Studio's answer to the form's `POST /course/`. */
  readonly response: { status: number; body: string };
  /** The course key Studio reported, or `undefined` when it refused. */
  readonly courseKey?: string;
}

/**
 * Creates a course the way an author does on Studio Home: open the form, fill it
 * in, press Create, and follow the MFE to the new course's outline.
 *
 * Returns rather than asserts: when Studio refuses (`ErrMsg` in a 200 body, or a
 * 403), there is no navigation to wait for and the spec decides what that means,
 * so the outline wait only runs on a reported key.
 */
export async function createCourseThroughStudioHome(
  studioHomePage: StudioHomePage,
  outlinePage: StudioCourseOutlinePage,
  identity: CourseIdentity,
): Promise<StudioCourseCreation> {
  await studioHomePage.goto();
  await studioHomePage.openNewCourseForm();
  await studioHomePage.fillNewCourseForm(identity);
  const response = await studioHomePage.submitNewCourseForm();

  let courseKey: string | undefined;
  try {
    const body = JSON.parse(response.body) as { course_key?: string };
    courseKey = typeof body.course_key === 'string' ? body.course_key : undefined;
  } catch {
    courseKey = undefined;
  }
  if (courseKey !== undefined) {
    await outlinePage.waitForCourse(courseKey);
  }
  return { response, courseKey };
}

/**
 * Grants course-creator status through the Studio Django admin **UI**, as the
 * BTR script for TC-00310 has the administrator do it: find the user's row, open
 * it, set State to `granted`, save. (`grantCourseCreator` in `src/api/` is the
 * same operation over HTTP, for fixtures that only need the outcome.)
 */
export async function grantCourseCreatorThroughAdmin(
  adminPage: CourseCreatorAdminPage,
  username: string,
): Promise<void> {
  await adminPage.gotoRowsFor(username);
  await adminPage.openChangeForm(username);
  await adminPage.setStateAndSave('granted');
}

/**
 * Signs a browser page in as `credentials` and drives it through the Studio SSO
 * handshake, leaving it on Studio Home with a browser-usable Studio session.
 *
 * Why a real login and not injected cookies: a session captured over the API
 * (the `staff`/admin storage state) authenticates Studio's *API* through its JWT,
 * but its Django `sessionid` does not drive the interactive Studio SSO — an
 * admin-in-the-browser reaches only the login screen. A freshly registered user
 * (the `author`) has a browser-usable session and needs none of this. So this is
 * the path for the superuser-in-the-browser cases (creating a course under a new
 * organization, and granting course-creator access in the Studio admin), where
 * the UI only offers the control to a superuser.
 *
 * Establishes the Studio session up front so a later `goto` cannot land mid-SSO.
 */
export async function signInToStudioThroughUi(
  page: Page,
  config: AppConfig,
  credentials: AccountCredentials,
): Promise<void> {
  // The page may already hold a session (the studio-author project loads the
  // author's); an authenticated /login just redirects away and the form never
  // shows. Clearing first makes the sign-in deterministic (a no-op on a fresh
  // context, so callers that pass one are unaffected).
  await page.context().clearCookies();
  await signIn(page, config, credentials);
  // First Studio hit completes the OAuth handshake against the fresh session.
  await page.goto(`${studioOrigin(config)}/home/`);
  await page.locator(STUDIO_HOME_SELECTORS.header).waitFor();
}
