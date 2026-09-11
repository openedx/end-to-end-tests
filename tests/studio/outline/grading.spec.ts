import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, fetchXBlockOutline } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { firstUnitKey, learnerSees, only } from './outline-helpers';

/**
 * Configuring a subsection as graded (TC-00157) and confirming it counts toward
 * the course grade on the learner side; the assignment types come from the
 * course's grading policy, which the learner's progress reflects (TC-00156's
 * read-through — editing the policy itself is Epic 7's TC-00284–290).
 *
 * The author sets "Grade as" in the outline's Configure dialog; the author-side
 * outcome is `xblock/outline` (`graded`, `format`), and the round trip is the
 * learner's progress API listing the subsection under that assignment type.
 */
test.describe(
  'Course outline grading',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    // Round trips poll the learner under TIMEOUTS.contentPublish (longer than the
    // default per-test budget), so the block-structure task's delay under load
    // does not trip the test timeout.
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'marks a subsection graded and it counts on the learner progress page',
      { annotation: [testId('TC-00157'), testId('TC-00156')] },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        outlineConfigureDialog,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        // A subsection with a graded-capable problem, published so the learner sees it.
        const section = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          `E2E grade ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['multiplechoiceresponse'] }] }], publish: true },
        );
        const subsectionKey = only(section.subsections, 'subsection').usageKey;
        const unitKey = firstUnitKey(section);
        const assignmentType = 'Homework';

        await learnerSees(roundTripLearner, unitKey);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await outlineConfigureDialog.open(
          studioCourseOutlinePage.subsection(unitKey),
          'subsection',
        );
        await outlineConfigureDialog.setGradedAs(assignmentType);
        await outlineConfigureDialog.save();

        // Author side: the subsection is graded under the chosen assignment type.
        expect(await fetchXBlockOutline(page.request, config, subsectionKey)).toMatchObject({
          graded: true,
          format: assignmentType,
        });

        // Learner side: the progress API lists the subsection as a graded
        // assignment of that type.
        await expect
          .poll(
            async () => {
              const progress = await fetchLearnerProgress(roundTripLearner, config);
              return progress
                .flatMap((s) => s.subsections)
                .find((sub) => sub.block_key === subsectionKey);
            },
            { timeout: TIMEOUTS.contentPublish },
          )
          .toMatchObject({ assignment_type: assignmentType, has_graded_assignment: true });
      },
    );
  },
);

interface ProgressSubsection {
  readonly block_key: string;
  readonly assignment_type: string;
  readonly has_graded_assignment: boolean;
}

async function fetchLearnerProgress(
  learner: { request: APIRequestContext; courseKey: string },
  config: { baseUrls: { lms: string } },
): Promise<{ subsections: ProgressSubsection[] }[]> {
  const response = await learner.request.get(
    `${config.baseUrls.lms}/api/course_home/v1/progress/${learner.courseKey}`,
  );
  const body = (await response.json()) as {
    section_scores?: { subsections: ProgressSubsection[] }[];
  };
  return body.section_scores ?? [];
}
