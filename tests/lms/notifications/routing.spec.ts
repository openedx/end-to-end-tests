import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  GENERAL_TOPIC_ID,
  createComment,
  createCourseUpdate,
  createThread,
  deleteThread,
  listOraSubmissions,
  staffAssessOra,
  submitOraResponse,
} from '../../../src/api';
import { aboutOra, aboutThread, waitForNotification } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { NOTIFICATION_TAGS, trayHostUrl, uniqueTitle } from './helpers';

/**
 * Click-through routing (TC-00470, from the tray): each kind of notification
 * opens where its activity happened — a forum notification on the post, a
 * course update on the course's updates page, a grade on the ORA's unit, and
 * a staff ORA notification in the ORA staff grader. A row opens its link in a
 * new tab, so the case reads that tab's URL; the row's `href` is the
 * notification's `content_url`. The e-mail half of 470 is with the e-mail
 * cases (`@email-inbox`).
 */
test.describe(
  'Notification click-through',
  { tag: ['@regression', '@discussions', '@ora', ...NOTIFICATION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      "a learner's notifications open the post, the course updates and the graded unit",
      { annotation: testId('TC-00470') },
      async ({
        page,
        config,
        forumCourse,
        forumCast,
        oraUnit,
        notificationRecipient,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const courseKey = forumCourse.courseKey;
        const learner = await notificationRecipient();
        const poster = await forumCast('poster');

        const thread = await createThread(learner.request, config, {
          courseKey,
          topicId: GENERAL_TOPIC_ID,
          type: 'discussion',
          title: uniqueTitle('routing'),
          body: 'A post that will get a response.',
        });
        try {
          await createComment(poster.request, config, { threadId: thread.id, body: 'A response.' });
          const token = uniqueTitle('update');
          await createCourseUpdate(page.request, config, courseKey, {
            date: 'January 1, 2026',
            content: `<p>${token}</p>`,
          });
          await submitOraResponse(
            learner.request,
            config,
            courseKey,
            oraUnit.oraUsageKey,
            'An essay.',
          );
          const submission = (
            await listOraSubmissions(page.request, config, oraUnit.oraUsageKey)
          ).find((candidate) => candidate.username === learner.identity.username);
          expect(submission).toBeDefined();
          await staffAssessOra(
            page.request,
            config,
            courseKey,
            oraUnit.oraUsageKey,
            submission!.submissionUUID,
          );

          const response = await waitForNotification(
            learner.request,
            config,
            aboutThread('new_response', thread.id),
          );
          const update = await waitForNotification(
            learner.request,
            config,
            (row) =>
              row.notification_type === 'course_updates' &&
              row.content_context.course_update_content === token,
          );
          const grade = await waitForNotification(
            learner.request,
            config,
            aboutOra('ora_grade_assigned', oraUnit.oraUsageKey),
          );
          expect(response.found).toBeDefined();
          expect(update.found).toBeDefined();
          expect(grade.found).toBeDefined();

          const { notificationTray: tray } = learner;
          await learner.page.goto(trayHostUrl(config));

          await tray.open('discussion');
          const post = await tray.openRow(response.found!.id);
          expect(post.opened.url()).toBe(response.found!.content_url);
          await post.opened.close();

          await tray.openTab('updates');
          const updates = await tray.openRow(update.found!.id);
          expect(new URL(updates.opened.url()).pathname).toBe(
            `/courses/${courseKey}/course/updates`,
          );
          await updates.opened.close();

          // The grade's `jump_to` link resolves to the learning MFE's unit.
          await tray.openTab('grading');
          const unit = await tray.openRow(grade.found!.id);
          expect(unit.opened.url()).toBe(
            learner.unitPage.url(courseKey, oraUnit.sequentialId, oraUnit.unitId),
          );
          await unit.opened.close();
        } finally {
          await deleteThread(learner.request, config, thread.id);
        }
      },
    );

    test(
      "staff's submission notification opens the ORA staff grader",
      { annotation: testId('TC-00470') },
      async ({
        page,
        config,
        oraUnit,
        notificationRecipient,
        notificationTray,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const learner = await notificationRecipient();
        await submitOraResponse(
          learner.request,
          config,
          oraUnit.courseKey,
          oraUnit.oraUsageKey,
          'An essay.',
        );
        const { found } = await waitForNotification(
          page.request,
          config,
          aboutOra('ora_staff_notifications', oraUnit.oraUsageKey),
          { app: 'grading' },
        );
        expect(found).toBeDefined();

        await page.goto(trayHostUrl(config));
        await notificationTray.open('discussion');
        await notificationTray.openTab('grading');
        const grader = await notificationTray.openRow(found!.id);
        expect(grader.opened.url()).toBe(found!.content_url);
        expect(new URL(grader.opened.url()).pathname).toBe(`/ora-grading/${oraUnit.oraUsageKey}`);
        await grader.opened.close();
      },
    );
  },
);
