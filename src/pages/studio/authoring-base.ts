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
 * on the authoring MFE's origin, without waiting for the outline MFE to finish loading.
 */
export async function authoringCourseBaseUrl(
  page: Page,
  config: AppConfig,
  courseKey: string,
): Promise<string> {
  const authoringOrigin = new URL(config.mfeUrls.authoring).origin;
  await page.goto(`${studioOrigin(config)}/course/${courseKey}`, { waitUntil: 'commit' });
  await page.waitForURL(
    (url) => url.origin === authoringOrigin && url.pathname.includes('/course/'),
  );
  return page.url().replace(/#.*$/, '').replace(/\/+$/, '');
}
