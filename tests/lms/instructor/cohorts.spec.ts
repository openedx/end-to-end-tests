import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  buildSection,
  createCohortV1,
  createContentGroups,
  listCohortsV1,
  publishXBlock,
  updateXBlock,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_A11Y_BASELINE, INSTRUCTOR_TAGS, label } from './helpers';

/**
 * Cohort-based content visibility, the instructor's half (TC-00539): in the
 * instructor dashboard's Cohorts tab the instructor turns cohorts on, adds a
 * manual cohort linked to a content group, and adds a learner to it; a unit
 * restricted to that group then appears in the learner's course. The Studio
 * half (the content group, the unit's restriction) is set up through the API —
 * it is TC-00291's subject — and the learner-sidebar half is TC-00058.
 *
 * The dashboard offers "Manual" assignment only once the course has an
 * automatic cohort for learners who are not placed by hand (the rule behind
 * wg-build-test-release#576), so one is created first, through the API.
 * The v1 cohorts API the MFE writes through decides every instructor step; the
 * learner's own course outline decides the visibility.
 */
test.describe('Instructor dashboard: cohorts', { tag: ['@regression', ...INSTRUCTOR_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'a cohort linked to a content group shows its members the restricted unit',
    { tag: '@cohorts', annotation: testId('TC-00539') },
    async (
      {
        page,
        config,
        authoringCourse,
        studioAuthorSession,
        instructorCohorts,
        authoringCourseLearnerLater,
      },
      testInfo,
    ) => {
      void studioAuthorSession;
      const api = page.request;
      const { courseKey } = authoringCourse;
      const name = label('cohort', testInfo.testId);

      // Studio: a content group, and a published unit restricted to it.
      const group = await createContentGroups(api, config, courseKey, [`${name} group`]);
      const groupId = group.groups[0]!.id;
      const section = await buildSection(api, config, courseKey, name, {
        subsections: [{ units: [{ blocks: ['html'] }, { blocks: ['html'] }] }],
      });
      const restricted = section.units[1]!.usageKey;
      await updateXBlock(api, config, restricted, {
        metadata: { group_access: { [group.id]: [groupId] } },
      });
      await publishXBlock(api, config, section.usageKey);

      // Instructor: cohorts on; "Manual" waits for an automatic cohort.
      await instructorCohorts.gotoTab(courseKey);
      expect((await instructorCohorts.enableCohorts()).ok()).toBe(true);
      expect(await instructorCohorts.manualAssignmentEnabled()).toBe(false);
      await createCohortV1(api, config, courseKey, {
        name: `${name} automatic`,
        assignmentType: 'random',
      });
      await instructorCohorts.gotoTab(courseKey);
      const created = await instructorCohorts.addCohort({
        name,
        assignment: 'manual',
        contentGroupId: groupId,
      });
      expect(created.ok()).toBe(true);
      const cohort = (await listCohortsV1(api, config, courseKey)).find((c) => c.name === name);
      expect(cohort).toMatchObject({
        assignment_type: 'manual',
        user_partition_id: group.id,
        group_id: groupId,
      });
      await checkA11y(page, {
        label: 'instructor-cohorts',
        additionalBaseline: [...INSTRUCTOR_A11Y_BASELINE],
      });

      // The learner does not see the restricted unit until they are in the cohort.
      const learner = await authoringCourseLearnerLater();
      await expect
        .poll(
          async () =>
            (await learner.outline()).units.some((u) => u.id === section.units[0]!.usageKey),
          {
            timeout: TIMEOUTS.contentPublish,
          },
        )
        .toBe(true);
      expect((await learner.outline()).units.some((u) => u.id === restricted)).toBe(false);

      await instructorCohorts.showCohort(cohort!.id);
      expect((await instructorCohorts.addLearners([learner.identity.username])).ok()).toBe(true);
      await expect
        .poll(
          async () =>
            (await listCohortsV1(api, config, courseKey)).find((c) => c.id === cohort!.id)
              ?.user_count,
        )
        .toBe(1);
      await expect
        .poll(async () => (await learner.outline()).units.some((u) => u.id === restricted), {
          timeout: TIMEOUTS.contentPublish,
        })
        .toBe(true);
    },
  );
});
