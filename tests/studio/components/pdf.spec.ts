import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { advancedComponentTypes, fetchContainer } from '../../../src/api';
import { issue, testId } from '../../../src/reporting';
import { addComponentAndSeeAsLearner, emptyUnit } from './component-helpers';

/**
 * The PDF component in the LMS (TC-00511). `TC-00512` (a PDF from a content
 * library) is a `fixme` gated on the deferred libraries work.
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

    // TC-00512: a PDF block from a content library needs the deferred v2 libraries
    // work (Epic 10). Declared `fixme` against the intended behaviour.
    test.fixme(
      'views a PDF block from a library (deferred to libraries)',
      {
        annotation: [
          testId('TC-00512'),
          issue('https://github.com/openedx/end-to-end-tests/issues/39'),
        ],
      },
      () => {
        // Intentionally empty until v2 libraries are covered.
      },
    );
  },
);
