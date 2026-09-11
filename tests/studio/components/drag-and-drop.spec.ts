import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  createXBlock,
  fetchContainer,
  publishXBlock,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { buildUnit } from './component-helpers';

/**
 * The Drag and Drop v2 component (TC-00220).
 *
 * The unit page offers the type as an add-component tile (asserted, so a target
 * that declares `@drag-and-drop-v2` without it fails), the block is created, and
 * the learner's Blocks API lists it once published.
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
      'adds a drag-and-drop component a learner can see',
      { annotation: testId('TC-00220') },
      async ({ page, config, authoringCourse, studioAuthorSession, authoringCourseLearner }) => {
        void studioAuthorSession;
        const unitKey = await buildUnit(page.request, config, authoringCourse.courseKey, {
          label: 'dnd',
        });

        // The type is offered as a tile.
        const types = availableComponentTypes(await fetchContainer(page.request, config, unitKey));
        expect(types).toContain('drag-and-drop-v2');

        const blockKey = await createXBlock(page.request, config, {
          parentLocator: unitKey,
          category: 'drag-and-drop-v2',
          displayName: 'E2E DnD',
        });
        await publishXBlock(page.request, config, unitKey);

        await expect
          .poll(
            async () =>
              (await authoringCourseLearner.outline()).blocks[blockKey]?.type ??
              (await authoringCourseLearner.outline()).units
                .find((u) => u.id === unitKey)
                ?.childTypes.join(','),
            { timeout: TIMEOUTS.contentPublish },
          )
          .toContain('drag-and-drop-v2');
      },
    );
  },
);
