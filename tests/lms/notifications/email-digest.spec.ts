import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { GENERAL_TOPIC_ID, createComment, createThread, type EmailCadence } from '../../../src/api';
import { knownGap, testId } from '../../../src/reporting';
import { waitForMail } from '../../../src/steps';
import { NOTIFICATION_TAGS, uniqueTitle } from './helpers';

/**
 * Daily and weekly digests (TC-00478, TC-00480), written to the intended
 * behaviour and held: the platform sends a digest from a Celery task scheduled
 * for a clock time (`NOTIFICATION_DAILY_DIGEST_DELIVERY_*`, 17:00 UTC by
 * default; weekly on a set weekday), and the `send_email_digest` command that
 * used to trigger one is a no-op since verawood. A run therefore cannot make a
 * digest arrive while it waits.
 */
const DIGEST_GAP = knownGap(
  'Digest e-mails are sent by a Celery task scheduled for the configured clock time ' +
    '(NOTIFICATION_DAILY/WEEKLY_DIGEST_DELIVERY_*); send_email_digest is a no-op since ' +
    'verawood, so a run cannot trigger delivery.',
);

test.describe(
  'Notification digests',
  { tag: ['@regression', '@email-inbox', '@discussions', ...NOTIFICATION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    for (const { id, cadence } of [
      { id: 'TC-00478', cadence: 'Daily' },
      { id: 'TC-00480', cadence: 'Weekly' },
    ] as const satisfies readonly { id: string; cadence: EmailCadence }[]) {
      test.fixme(
        `a ${cadence.toLowerCase()} digest summarises the learner's notifications`,
        { annotation: [testId(id), DIGEST_GAP] },
        async ({ config, forumCourse, forumCast, mailboxLearner }) => {
          const learner = await mailboxLearner({
            cadences: [{ app: 'discussion', type: 'grouped_notification', cadence }],
          });
          const poster = await forumCast('poster');
          const titles: string[] = [];
          for (const kind of ['first', 'second']) {
            const thread = await createThread(learner.request, config, {
              courseKey: forumCourse.courseKey,
              topicId: GENERAL_TOPIC_ID,
              type: 'discussion',
              title: uniqueTitle(`digest-${kind}`),
              body: 'A post for the digest.',
            });
            titles.push(thread.title);
            await createComment(poster.request, config, {
              threadId: thread.id,
              body: 'A response.',
            });
          }
          const { found } = await waitForMail(learner.inbox, learner.request, (message) =>
            titles.every((title) => message.html.includes(title)),
          );
          expect(found).toBeDefined();
        },
      );
    }
  },
);
