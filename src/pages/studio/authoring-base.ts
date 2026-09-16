import type { Page } from '@playwright/test';

import type { AppConfig } from '../../config';
import { studioOrigin } from '../../api';

/**
 * The authoring-MFE base for a course, e.g. `${APPS}/authoring/course/<key>`,
 * derived from the one Studio URL that redirects there (the course outline) so
 * nothing hard-codes the release-varying mount path (`/authoring` on `main`,
 * `/course-authoring` on `redwood`).
 *
 * Needed by the MFE pages Studio does **not** redirect to (Pages & Resources,
 * Custom Pages): the Settings pages just `goto` their Studio URL and follow the
 * redirect, but these have no Studio alias, so their page objects build the URL
 * from this base. `waitUntil: 'commit'` returns as soon as the 302 chain settles
 * on the apps origin, without waiting for the outline MFE to finish loading.
 */
export async function authoringCourseBaseUrl(
  page: Page,
  config: AppConfig,
  courseKey: string,
): Promise<string> {
  const appsOrigin = new URL(config.baseUrls.apps).origin;
  await page.goto(`${studioOrigin(config)}/course/${courseKey}`, { waitUntil: 'commit' });
  await page.waitForURL((url) => url.origin === appsOrigin && url.pathname.includes('/course/'));
  return page.url().replace(/#.*$/, '').replace(/\/+$/, '');
}

/**
 * The authoring MFE's mount base derived from the Studio-home redirect rather
 * than a course — for the taxonomy pages, whose only actor is the admin (who owns
 * no course). Studio `/home` redirects to the MFE home on the apps origin; this
 * returns everything up to that mount (e.g. `${APPS}/authoring`).
 */
export async function authoringMfeBaseFromHome(page: Page, config: AppConfig): Promise<string> {
  const appsOrigin = new URL(config.baseUrls.apps).origin;
  await page.goto(`${studioOrigin(config)}/home`, { waitUntil: 'commit' });
  await page.waitForURL((url) => url.origin === appsOrigin && url.pathname.endsWith('/home'));
  return page
    .url()
    .replace(/#.*$/, '')
    .replace(/\/home\/?$/, '');
}
