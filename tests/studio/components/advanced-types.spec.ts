import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { advancedComponentTypes, fetchContainer } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { addComponentAndSeeAsLearner, emptyUnit } from './component-helpers';

/**
 * Advanced problem/component types (part of TC-00212): the core advanced XBlocks
 * (poll, survey, word cloud) ungated, and the separately-capability-gated ones
 * (LTI, edx-sga, SCORM). Each block is created and the learner's Blocks API lists
 * it once published. The core types are also asserted to appear in the unit
 * page's "Advanced" picker; the plugin types are proven by their block
 * installing, which is what their capability declares.
 */
test.describe(
  'Studio advanced component types',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'adds the core advanced components (poll, survey, word cloud)',
      { annotation: testId('TC-00212') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        const probeUnit = await emptyUnit(
          page.request,
          config,
          authoringCourse.courseKey,
          'adv-probe',
        );
        const advanced = advancedComponentTypes(
          await fetchContainer(page.request, config, probeUnit),
        );

        for (const category of ['poll', 'survey', 'word_cloud']) {
          expect(advanced, `Advanced picker offers ${category}`).toContain(category);
          await addComponentAndSeeAsLearner(
            page.request,
            config,
            authoringCourse.courseKey,
            authoringCourseLearner,
            category,
            category,
          );
        }
      },
    );

    test(
      'adds an LTI consumer component',
      { tag: '@lti', annotation: testId('TC-00212') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        const probeUnit = await emptyUnit(
          page.request,
          config,
          authoringCourse.courseKey,
          'lti-probe',
        );
        expect(
          advancedComponentTypes(await fetchContainer(page.request, config, probeUnit)),
        ).toContain('lti_consumer');
        await addComponentAndSeeAsLearner(
          page.request,
          config,
          authoringCourse.courseKey,
          authoringCourseLearner,
          'lti_consumer',
          'lti',
        );
      },
    );

    test(
      'adds a Staff Graded Assignment (edx-sga) component',
      { tag: '@edx-sga', annotation: testId('TC-00212') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        await addComponentAndSeeAsLearner(
          page.request,
          config,
          authoringCourse.courseKey,
          authoringCourseLearner,
          'edx_sga',
          'sga',
        );
      },
    );

    test(
      'adds a SCORM component',
      { tag: '@scorm', annotation: testId('TC-00212') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        await addComponentAndSeeAsLearner(
          page.request,
          config,
          authoringCourse.courseKey,
          authoringCourseLearner,
          'scorm',
          'scorm',
        );
      },
    );
  },
);
