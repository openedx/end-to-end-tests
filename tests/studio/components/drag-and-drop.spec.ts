import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  buildSection,
  fetchContainer,
  fetchDragAndDropState,
} from '../../../src/api';
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
 *
 * The learner then works the problem with the pointer: an item dragged onto the
 * zone it belongs to stays there, and one dragged onto a wrong zone goes back
 * to the bank. The block's own record of the learner (`student_view_user_state`)
 * decides, not the feedback pop-up's copy.
 */

/**
 * The sample problem's data (xblock-drag-and-drop-v2 `default_data`): item 0
 * belongs in the zone `top`, item 1 in `middle`. These ids are the block's
 * content, not platform copy.
 */
const SAMPLE = { topItem: 0, middleItem: 1, topZone: 'top', bottomZone: 'bottom' } as const;

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
      'adds a drag-and-drop component from its tile and a learner drags its items',
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

        const learner = authoringCourseLearner;
        const problem = learner.unitPage.dragAndDropBlock(blockKey);
        const dropped = async (itemId: number, zoneUid: string) =>
          ((await (await problem.drop(itemId, zoneUid)).json()) as { correct: boolean }).correct;

        // Onto its own zone: accepted, and the item now sits in that zone.
        expect(await dropped(SAMPLE.topItem, SAMPLE.topZone)).toBe(true);
        await expect(problem.placedItem(SAMPLE.topItem, SAMPLE.topZone)).toBeVisible();

        // Onto a wrong zone: refused, and the item is not left there.
        expect(await dropped(SAMPLE.middleItem, SAMPLE.bottomZone)).toBe(false);
        await expect(problem.placedItem(SAMPLE.middleItem, SAMPLE.bottomZone)).toHaveCount(0);

        // The platform recorded exactly the accepted drop, and scored it.
        const state = await fetchDragAndDropState(learner.request, config, courseKey, blockKey);
        expect(state.items).toEqual({
          [String(SAMPLE.topItem)]: { zone: SAMPLE.topZone, correct: true },
        });
        expect(state.grade).toBeGreaterThan(0);
        expect(state.finished).toBe(false);
      },
    );
  },
);
