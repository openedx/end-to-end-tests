import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { availableComponentTypes, buildSection, fetchContainer } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { expectRenderedForLearner } from './component-helpers';

/**
 * The Open Response Assessment component (TC-00221).
 *
 * The unit page offers `openassessment` as an add-component tile (asserted). The
 * author adds one from that tile's template picker — the first template the
 * platform lists, chosen by its boilerplate name — and publishes the unit from
 * its Publish button; the learner is served the block and the unit renders it.
 */
test.describe(
  'Studio ORA component',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning', '@ora'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'adds an Open Response Assessment from its tile and a learner sees it',
      { tag: '@smoke', annotation: testId('TC-00221') },
      async (
        {
          page,
          config,
          authoringCourse,
          studioAuthorSession,
          studioUnitPage,
          authoringCourseLearner,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        const { courseKey } = authoringCourse;
        const section = await buildSection(
          page.request,
          config,
          courseKey,
          `E2E ora ${testInfo.testId.slice(-6)}R${testInfo.retry}`,
          { subsections: [{ units: [{ blocks: [] }] }] },
        );
        const unit = section.units[0]!;

        const container = await fetchContainer(page.request, config, unit.usageKey);
        const types = availableComponentTypes(container);
        expect(types).toContain('openassessment');
        const template = container.component_templates.find(
          (tile) => tile.type === 'openassessment',
        )?.templates[0];
        expect(template, 'the Open Response tile offers a template').toBeDefined();

        await studioUnitPage.goto(unit.usageKey);
        const blockKey = await studioUnitPage.addComponentFromTemplate(
          types.indexOf('openassessment'),
          template!.boilerplate_name ?? template!.category,
        );
        expect(blockKey).toContain('type@openassessment+');
        await studioUnitPage.publish();

        await expectRenderedForLearner(
          authoringCourseLearner,
          { courseKey, unitKey: unit.usageKey, sequentialKey: unit.sequentialUsageKey, blockKey },
          'openassessment',
        );
      },
    );
  },
);
