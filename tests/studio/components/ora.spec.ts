import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  buildSection,
  fetchContainer,
  listOraSubmissions,
  staffAssessOra,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { expectRenderedForLearner } from './component-helpers';

/**
 * The Open Response Assessment component (TC-00221).
 *
 * The unit page offers `openassessment` as an add-component tile (asserted). The
 * author adds one from that tile's template picker — the first template the
 * platform lists, chosen by its boilerplate name — and publishes the unit from
 * its Publish button; the learner is served the block and the unit renders it.
 *
 * A second case takes the component through its use: authored from the
 * "Staff Assessment Only" template, a learner writes and submits a response in
 * the unit, the course's staff (the author) grade it, and the learner's grade
 * step completes. The staff grader's own record of the submission decides each
 * step; the grade itself is given through the block's handler, since the staff
 * grading app is another MFE's surface.
 */

/** The `boilerplate_name` of edx-ora2's "Staff Assessment Only" template. */
const STAFF_ONLY_TEMPLATE = 'staff-assessment';

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

    test(
      'a learner submits a response and course staff grade it',
      { annotation: testId('TC-00221') },
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
        const learner = authoringCourseLearner;
        const section = await buildSection(
          page.request,
          config,
          courseKey,
          `E2E ora response ${testInfo.testId.slice(-6)}R${testInfo.retry}`,
          { subsections: [{ units: [{ blocks: [] }] }] },
        );
        const unit = section.units[0]!;

        const container = await fetchContainer(page.request, config, unit.usageKey);
        const types = availableComponentTypes(container);
        expect(
          container.component_templates
            .find((tile) => tile.type === 'openassessment')
            ?.templates.map((template) => template.boilerplate_name),
        ).toContain(STAFF_ONLY_TEMPLATE);
        await studioUnitPage.goto(unit.usageKey);
        const blockKey = await studioUnitPage.addComponentFromTemplate(
          types.indexOf('openassessment'),
          STAFF_ONLY_TEMPLATE,
        );
        await studioUnitPage.publish();
        const location = {
          courseKey,
          unitKey: unit.usageKey,
          sequentialKey: unit.sequentialUsageKey,
          blockKey,
        };
        await expectRenderedForLearner(learner, location, 'openassessment');

        // The learner writes a response in the unit and submits it.
        const ora = learner.unitPage.oraBlock(blockKey);
        const submitted = await ora.respond(`E2E response ${testInfo.testId.slice(-6)}`);
        // `[true, …]` when the block accepted the submission.
        expect(((await submitted.json()) as readonly unknown[])[0]).toBe(true);
        const submission = async () =>
          (await listOraSubmissions(page.request, config, blockKey)).find(
            (candidate) => candidate.username === learner.identity.username,
          );
        await expect.poll(async () => (await submission())?.gradeStatus).toBe('ungraded');

        // Course staff grade it, and the learner's grade step completes.
        await staffAssessOra(
          page.request,
          config,
          courseKey,
          blockKey,
          (await submission())!.submissionUUID,
        );
        await expect.poll(async () => (await submission())?.gradeStatus).toBe('graded');
        await learner.unitPage.goto(courseKey, unit.sequentialUsageKey, unit.usageKey);
        await expect(ora.gradeComplete).toBeVisible();
      },
    );
  },
);
