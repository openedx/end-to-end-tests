import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { fetchCoursewareCourse, publishXBlock, setCourseAppEnabled } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { waitForLearnerBlock } from '../../../src/steps';

/**
 * The calculator tool (TC-00039): once the author turns the calculator on
 * (Studio's side is TC-00239), a learner's unit pages offer it, and it
 * evaluates an expression through the LMS. The expression is the test's own
 * data; the LMS's answer is what the calculator must show.
 */
test(
  'evaluates an expression on a unit page once the author turns it on',
  {
    tag: ['@regression', '@studio', '@author', '@mfe-learning'],
    annotation: testId('TC-00039'),
  },
  async ({ request, config, studio, contentCourse, ownSection, roundTripLearner }) => {
    test.setTimeout(TIMEOUTS.contentTest);
    void studio;
    const unit = ownSection.units[0]!;
    await publishXBlock(request, config, unit.usageKey);
    await setCourseAppEnabled(request, config, contentCourse.courseKey, 'calculator', true);

    const learner = roundTripLearner;
    expect((await waitForLearnerBlock(learner.outline, unit.usageKey)).satisfied).toBe(true);
    await expect
      .poll(
        async () =>
          (await fetchCoursewareCourse(learner.request, config, learner.courseKey)).show_calculator,
      )
      .toBe(true);

    await learner.prime(unit.sequentialUsageKey);
    await learner.unitPage.goto(learner.courseKey, unit.sequentialUsageKey, unit.usageKey);
    const answer = await learner.unitPage.calculate('2*(3+4)');
    expect(Number(answer)).toBe(14);
    await expect(learner.unitPage.calculatorResult).toHaveValue(answer);
  },
);
