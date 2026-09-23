import { randomUUID } from 'node:crypto';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { createCourseUpdate } from '../../../src/api';
import { waitForNotification } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { NOTIFICATION_TAGS, trayHostUrl } from './helpers';

/**
 * Course-update notifications (TC-00467): the course's staff posts an update in
 * Studio, and it reaches every enrolled learner under the tray's Updates tab.
 *
 * The row carries the update's text but no update id (measured), so it is
 * matched on the test's own unique text. It links to the course's updates page.
 */
test.describe(
  'Notifications for course updates',
  { tag: ['@regression', ...NOTIFICATION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'a course update from staff reaches an enrolled learner',
      { annotation: testId('TC-00467') },
      async ({ page, config, contentCourse, notificationRecipient, studioAuthorSession }) => {
        void studioAuthorSession;
        const recipient = await notificationRecipient();
        const token = `E2E update ${randomUUID().slice(0, 8)}`;
        await createCourseUpdate(page.request, config, contentCourse.courseKey, {
          date: 'January 1, 2026',
          content: `<p>${token}</p>`,
        });

        const { found, rows } = await waitForNotification(
          recipient.request,
          config,
          (row) =>
            row.notification_type === 'course_updates' &&
            row.course_id === contentCourse.courseKey &&
            typeof row.content_context.course_update_content === 'string' &&
            row.content_context.course_update_content.includes(token),
          { app: 'updates' },
        );
        expect(
          found,
          `rows seen: ${JSON.stringify(rows.map((row) => row.notification_type))}`,
        ).toBeDefined();
        expect(new URL(found!.content_url).pathname).toBe(
          `/courses/${contentCourse.courseKey}/course/updates`,
        );

        await recipient.page.goto(trayHostUrl(config));
        await recipient.notificationTray.open('discussion');
        await recipient.notificationTray.openTab('updates');
        await expect(recipient.notificationTray.row(found!.id)).toBeVisible();
      },
    );
  },
);
