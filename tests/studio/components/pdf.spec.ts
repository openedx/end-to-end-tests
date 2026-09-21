import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { advancedComponentTypes, fetchContainer } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { addComponentAndSeeAsLearner, emptyUnit } from './component-helpers';

/**
 * The PDF component in the LMS (TC-00511). `TC-00512` (a PDF from a content
 * library) lives in `tests/studio/library/pdf-from-library.spec.ts`.
 *
 * The "Advanced" component picker offers `pdf` (asserted), the block is created,
 * and the learner's Blocks API lists it once published.
 */
test.describe(
  'Studio PDF component',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning', '@pdf-xblock'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'adds a PDF component a learner can see',
      { annotation: testId('TC-00511') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        const probeUnit = await emptyUnit(
          page.request,
          config,
          authoringCourse.courseKey,
          'pdf-probe',
        );
        const advanced = advancedComponentTypes(
          await fetchContainer(page.request, config, probeUnit),
        );
        expect(advanced).toContain('pdf');

        await addComponentAndSeeAsLearner(
          page.request,
          config,
          authoringCourse.courseKey,
          authoringCourseLearner,
          'pdf',
          'pdf',
        );
      },
    );
  },
);
