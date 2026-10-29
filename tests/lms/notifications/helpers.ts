import type { Page } from '@playwright/test';

import { skipCourseHomeTour } from '../../../src/api';
import type { AppConfig } from '../../../src/config';

/**
 * Every notification spec runs in the `studio-author` project: the worker
 * author is the course's instructor and staff (the actor behind notify-all
 * posts, course updates and ORA grades), and the recipients are learners on
 * their own contexts. Gated on `notifications` (default on; ulmo and earlier
 * opt out) and on `studio`, which the worker author needs.
 */
export const NOTIFICATION_TAGS: string[] = ['@studio', '@author', '@notifications'];

/**
 * Accessibility debt the preference centre (`frontend-app-account`'s
 * `#notifications` section) carries on `main`, reported on every run but not
 * failed until the MFE fixes it:
 *
 * - `label` (critical, `NOTIF-003`): every preference switch
 *   (`input[role="switch"]`) is paired with an **empty** `<label for=…>`, so
 *   none of the fourteen has an accessible name.
 */
export const NOTIFICATION_PREFERENCES_A11Y_BASELINE = ['label'] as const;

/**
 * Where the notification specs open the tray: the learner dashboard, whose
 * header every learner sees first (TC-00476 walks the other surfaces), or —
 * on an installation without one (`NOTIFICATION_TRAY_HOST=course-home`) — the
 * learning MFE's home for `courseKey`, the course the spec's learner is in.
 */
export function trayHostUrl(config: AppConfig, courseKey: string): string {
  return config.notificationTrayHost === 'course-home'
    ? `${config.mfeUrls.learning}/course/${courseKey}/home`
    : `${config.baseUrls.apps}/learner-dashboard/`;
}

/**
 * Opens {@link trayHostUrl} as whoever `page` is signed in as. On the course
 * home a first visit opens the welcome tour over the page, so that user's
 * course-home tour is marked done first.
 */
export async function gotoTrayHost(
  page: Page,
  config: AppConfig,
  courseKey: string,
): Promise<void> {
  if (config.notificationTrayHost === 'course-home') {
    await skipCourseHomeTour(page.request, config);
  }
  await page.goto(trayHostUrl(config, courseKey));
}
