import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { fetchCourseHomeOutline, publishXBlock } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { AUTHORED_COURSE_HOME_TAGS } from './helpers';

/**
 * Automatic effort estimates (TC-00027): the course home shows, beside each
 * subsection, the time the platform estimates it takes. The platform estimates
 * text by its word count and gives up for the whole course if any video lacks
 * a duration, so the case runs on the worker's video-free course with a text
 * unit of a known length. The outline API's `effort_time` decides; the minutes
 * the course home shows must match it.
 */
const WORDS = 530; // two minutes' reading at the platform's 265 words a minute

test(
  'estimates the effort of a text subsection',
  { tag: ['@regression', ...AUTHORED_COURSE_HOME_TAGS], annotation: testId('TC-00027') },
  async ({ page, config, videoFreeSection, videoFreeCourseLearner }) => {
    test.setTimeout(TIMEOUTS.contentTest);
    const text = Array.from({ length: WORDS }, (_, i) => `word${i}`).join(' ');
    const section = await videoFreeSection({
      subsections: [{ units: [{ blocks: [{ html: `<p>${text}</p>` }] }] }],
    });
    const subsection = section.subsections[0]!;
    await publishXBlock(page.request, config, subsection.units[0]!.usageKey);

    const learner = videoFreeCourseLearner;
    const effort = async () =>
      (await fetchCourseHomeOutline(learner.request, config, learner.courseKey))?.course_blocks
        ?.blocks[subsection.usageKey]?.effort_time ?? null;
    await expect.poll(effort, { timeout: TIMEOUTS.contentPublish }).not.toBeNull();
    const seconds = (await effort())!;
    expect(seconds).toBeGreaterThan(0);

    await learner.courseOutlinePage.goto(learner.courseKey);
    await learner.courseOutlinePage.dismissTourDialog();
    expect(await learner.courseOutlinePage.effortMinutes(subsection.usageKey)).toBe(
      Math.ceil(seconds / 60),
    );
  },
);
