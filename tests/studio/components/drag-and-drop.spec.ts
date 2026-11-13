import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { availableComponentTypes, buildSection, fetchContainer } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { expectRenderedForLearner } from './component-helpers';

/**
 * The Drag and Drop v2 component (TC-00220).
 *
 * The unit page offers the type as an add-component tile (asserted, so a target
 * that declares `@drag-and-drop-v2` without it fails). The author adds it from
 * that tile — a single-template tile, so the click creates the block with the
 * platform's sample problem — and publishes the unit from its Publish button;
 * the learner is served the block and the unit renders it.
 */
test.describe(
  'Studio drag-and-drop component',
  {
    tag: [
      '@regression',
      '@studio',
      '@author',
      '@mfe-authoring',
      '@mfe-learning',
      '@drag-and-drop-v2',
    ],
  },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'adds a drag-and-drop component from its tile and a learner sees it',
      { annotation: testId('TC-00220') },
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
          `E2E dnd ${testInfo.testId.slice(-6)}R${testInfo.retry}`,
          { subsections: [{ units: [{ blocks: [] }] }] },
        );
        const unit = section.units[0]!;

        // The type is offered as a tile, and adding it from there creates the block.
        const types = availableComponentTypes(
          await fetchContainer(page.request, config, unit.usageKey),
        );
        expect(types).toContain('drag-and-drop-v2');
        await studioUnitPage.goto(unit.usageKey);
        const blockKey = await studioUnitPage.addComponentFromTile(
          types.indexOf('drag-and-drop-v2'),
        );
        expect(blockKey).toContain('type@drag-and-drop-v2+');
        await studioUnitPage.publish();

        await expectRenderedForLearner(
          authoringCourseLearner,
          { courseKey, unitKey: unit.usageKey, sequentialKey: unit.sequentialUsageKey, blockKey },
          'drag-and-drop-v2',
        );
      },
    );
  },
);
