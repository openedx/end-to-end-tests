import { expect, test } from '../../../src/fixtures';
import { NOTIFICATION_PREFERENCES_SELECTORS, TIMEOUTS } from '../../../src/config';
import {
  NOTIFICATION_APPS,
  fetchNotificationPreferences,
  grantCourseTeamRole,
  type NotificationApp,
} from '../../../src/api';
import { checkA11y } from '../../../src/a11y';
import { testId } from '../../../src/reporting';
import { NOTIFICATION_PREFERENCES_A11Y_BASELINE, NOTIFICATION_TAGS, trayHostUrl } from './helpers';

/**
 * The notification preference centre (TC-00472, TC-00473): where it is
 * reached from, and which preferences it offers a learner, course staff and a
 * forum moderator. The notification e-mail's "Notification settings" link, the
 * third route of 472, is covered with the e-mail cases (`@email-inbox`).
 *
 * The preferences offered are the API's (`v3/configurations/`): the sheet
 * lists six for a plain learner, but ora2 7.x added "ORA reminders", so the
 * centre is compared with the API's own list per app rather than with a
 * constant, and the role cases assert the role-gated type appearing in both.
 */
test.describe(
  'Notification preference centre',
  { tag: ['@regression', '@mfe-account', ...NOTIFICATION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'is reached from Account Settings and from the tray gear',
      { annotation: testId('TC-00472') },
      async ({ config, notificationRecipient }) => {
        const learner = await notificationRecipient();

        // Account Settings carries the section.
        await learner.notificationPreferences.goto();
        await expect(learner.notificationPreferences.section).toBeVisible();
        await checkA11y(learner.page, {
          label: 'notification-preferences',
          include: NOTIFICATION_PREFERENCES_SELECTORS.section,
          additionalBaseline: NOTIFICATION_PREFERENCES_A11Y_BASELINE,
        });

        // The tray gear opens it in a new tab.
        await learner.page.goto(trayHostUrl(config));
        await learner.notificationTray.open();
        await expect(learner.notificationTray.gearLink).toHaveAttribute(
          'href',
          learner.notificationPreferences.url(),
        );
        const [opened] = await Promise.all([
          learner.context.waitForEvent('page'),
          learner.notificationTray.gearLink.click(),
        ]);
        await opened.waitForLoadState();
        expect(opened.url()).toBe(learner.notificationPreferences.url());
        await expect(opened.locator(NOTIFICATION_PREFERENCES_SELECTORS.section)).toBeVisible();
        await opened.close();
      },
    );

    test(
      'offers role-specific preferences to course staff and forum moderators',
      { annotation: testId('TC-00473'), tag: '@discussions' },
      async ({ page, config, contentCourse, notificationRecipient, studioAuthorSession }) => {
        void studioAuthorSession;
        const learner = await notificationRecipient();
        const offered = async () => {
          const preferences = await fetchNotificationPreferences(learner.request, config);
          return Object.fromEntries(
            NOTIFICATION_APPS.map((app) => [
              app,
              Object.keys(preferences.data[app].notification_types).sort(),
            ]),
          ) as Record<NotificationApp, string[]>;
        };
        // The centre renders one web switch per preference the API offers.
        const expectCentreToMatch = async (api: Record<NotificationApp, string[]>) => {
          await learner.notificationPreferences.goto();
          for (const app of NOTIFICATION_APPS) {
            await expect(learner.notificationPreferences.webToggles(app)).toHaveCount(
              api[app].length,
            );
          }
        };

        const plain = await offered();
        expect(plain.discussion).not.toContain('content_reported');
        expect(plain.grading).not.toContain('ora_staff_notifications');
        await expectCentreToMatch(plain);

        // Course staff are offered submissions awaiting staff grading.
        await grantCourseTeamRole(
          page.request,
          config,
          contentCourse.courseKey,
          [learner.identity.email],
          'staff',
        );
        const staff = await offered();
        expect(staff.grading).toEqual([...plain.grading, 'ora_staff_notifications'].sort());
        await expectCentreToMatch(staff);
        await expect(
          learner.notificationPreferences.toggle('ora_staff_notifications', 'web'),
        ).toBeVisible();

        // Forum moderators are offered reported content.
        await grantCourseTeamRole(
          page.request,
          config,
          contentCourse.courseKey,
          [learner.identity.email],
          'Moderator',
        );
        const moderator = await offered();
        expect(moderator.discussion).toEqual([...plain.discussion, 'content_reported'].sort());
        await expectCentreToMatch(moderator);
        await expect(
          learner.notificationPreferences.toggle('content_reported', 'web'),
        ).toBeVisible();
      },
    );
  },
);
