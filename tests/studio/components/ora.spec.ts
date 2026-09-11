import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { availableComponentTypes, fetchContainer } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { addComponentAndSeeAsLearner, emptyUnit } from './component-helpers';

/**
 * The Open Response Assessment component (TC-00221).
 *
 * The unit page offers `openassessment` as an add-component tile (asserted), the
 * block is created, and the learner's Blocks API lists it once published.
 */
test.describe(
  'Studio ORA component',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning', '@ora'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'adds an Open Response Assessment a learner can see',
      { annotation: testId('TC-00221') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        const probeUnit = await emptyUnit(
          page.request,
          config,
          authoringCourse.courseKey,
          'ora-probe',
        );
        const types = availableComponentTypes(
          await fetchContainer(page.request, config, probeUnit),
        );
        expect(types).toContain('openassessment');

        await addComponentAndSeeAsLearner(
          page.request,
          config,
          authoringCourse.courseKey,
          authoringCourseLearner,
          'openassessment',
          'ora',
        );
      },
    );
  },
);
