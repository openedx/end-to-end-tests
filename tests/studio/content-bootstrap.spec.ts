import { expect, test } from '../../src/fixtures';
import { TIMEOUTS } from '../../src/config';
import {
  courseUsageKey,
  fetchCourseMetadata,
  fetchXBlockOutline,
  publishXBlock,
  updateXBlock,
  COURSE_BLOCKS_PATH,
} from '../../src/api';
import { only } from './outline/outline-helpers';

/**
 * The content layer's own contract (Epic 8, §5 step 1): the xblock client, the
 * section builder, the worker content courses and the learner context work end
 * to end **with no UI**, so a broken publish path or learner session is reported
 * here rather than as a confusing failure in an outline spec. No BTR case maps
 * to these except the `PLAT-007` record at the end.
 */
test.describe(
  'Authoring content bootstrap',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring'] },
  () => {
    test('the worker has a content course and a future course, distinct from the settings course', async ({
      studio,
      authoredCourse,
      contentCourse,
      futureCourse,
      request,
      config,
    }) => {
      void studio;
      expect(
        new Set([authoredCourse.courseKey, contentCourse.courseKey, futureCourse.courseKey]).size,
      ).toBe(3);

      // The content course was seeded so learners can reach it; the future course
      // was left at the platform default, which is a start date years away.
      const content = await fetchXBlockOutline(
        request,
        config,
        courseUsageKey(contentCourse.courseKey),
      );
      const future = await fetchXBlockOutline(
        request,
        config,
        courseUsageKey(futureCourse.courseKey),
      );
      expect(Date.parse(content.start as string)).toBeLessThan(Date.now());
      expect(Date.parse(future.start as string)).toBeGreaterThan(Date.now());
    });

    test('a section built through the API reaches the learner once its unit is published', async ({
      studio,
      request,
      config,
      ownSection,
      roundTripLearner,
    }) => {
      void studio;
      const unit = only(ownSection.units);

      // Structure is published as it is created; the unit and its components are
      // drafts until published — so the learner sees the section and subsection
      // but nothing below.
      const before = await fetchXBlockOutline(request, config, unit.usageKey);
      expect(before.published).toBe(false);
      await expect
        .poll(async () => (await roundTripLearner.outline()).sequentialIds, {
          timeout: TIMEOUTS.contentPublish,
        })
        .toContain(only(ownSection.subsections).usageKey);
      expect((await roundTripLearner.outline()).units.map((u) => u.id)).not.toContain(
        unit.usageKey,
      );

      await publishXBlock(request, config, unit.usageKey);

      const after = await fetchXBlockOutline(request, config, unit.usageKey);
      expect(after.published).toBe(true);
      expect(after.has_changes).toBe(false);
      expect(after.visibility_state).toBe('live');

      // The learner's reading: the unit and every component authored in it.
      await expect
        .poll(
          async () =>
            (await roundTripLearner.outline()).units.find((u) => u.id === unit.usageKey)?.childIds,
          { timeout: TIMEOUTS.contentPublish },
        )
        .toEqual(unit.blocks.map((block) => block.usageKey));
      const learnerUnit = (await roundTripLearner.outline()).units.find(
        (u) => u.id === unit.usageKey,
      );
      expect(learnerUnit?.childTypes).toEqual(['html', 'problem']);

      // And the subsection is served to them, ungated.
      const sequence = await roundTripLearner.sequence(unit.sequentialUsageKey);
      expect(sequence?.gated_content.gated).toBe(false);
      expect(sequence?.items.map((item) => item.id)).toEqual([unit.usageKey]);
    });

    test('hiding a subsection removes it from the learner and un-hiding restores it', async ({
      studio,
      request,
      config,
      ownSection,
      roundTripLearner,
    }) => {
      void studio;
      const subsection = only(ownSection.subsections);
      await publishXBlock(request, config, only(ownSection.units).usageKey);
      await expect
        .poll(async () => (await roundTripLearner.outline()).sequentialIds, {
          timeout: TIMEOUTS.contentPublish,
        })
        .toContain(subsection.usageKey);

      await updateXBlock(request, config, subsection.usageKey, {
        metadata: { visible_to_staff_only: true },
      });
      // The author's control reading: Studio still has the subsection, marked
      // staff-only — it is hidden, not deleted. (The LMS Blocks API omits it even
      // with `all_blocks=true` for a course author, so the Studio outline, not the
      // Blocks API, is the author-side proof it survives.)
      expect(
        (await fetchXBlockOutline(request, config, subsection.usageKey)).visibility_state,
      ).toBe('staff_only');
      await expect
        .poll(async () => (await roundTripLearner.outline()).sequentialIds, {
          timeout: TIMEOUTS.contentPublish,
        })
        .not.toContain(subsection.usageKey);
      expect(await roundTripLearner.sequence(subsection.usageKey)).toBeUndefined();

      await updateXBlock(request, config, subsection.usageKey, {
        metadata: { visible_to_staff_only: null },
      });
      await expect
        .poll(async () => (await roundTripLearner.outline()).sequentialIds, {
          timeout: TIMEOUTS.contentPublish,
        })
        .toContain(subsection.usageKey);
    });

    test('a learner enrolled in the future course is told it has not started', async ({
      studio,
      futureCourseLearner,
      config,
    }) => {
      void studio;
      const metadata = await fetchCourseMetadata(
        futureCourseLearner.request,
        config,
        futureCourseLearner.courseKey,
      );
      expect(metadata.course_access.has_access).toBe(false);
      expect(metadata.course_access.error_code).toBe('course_not_started');
      expect(await futureCourseLearner.navigation()).toBeUndefined();
    });

    // PLAT-007: the Blocks API answers a learner on a not-yet-started course with
    // HTTP 500 (`Field self_paced does not exist`) where every neighbouring
    // endpoint answers 403. Written against the intended behaviour and declared
    // `fixme` so no fixtures are set up for it until the platform is fixed.
    test.fixme('the Blocks API refuses, rather than crashes on, a learner whose course has not started (PLAT-007)', async ({
      studio,
      futureCourseLearner,
      config,
    }) => {
      void studio;
      const response = await futureCourseLearner.request.get(
        `${config.baseUrls.lms}${COURSE_BLOCKS_PATH}?course_id=${encodeURIComponent(
          futureCourseLearner.courseKey,
        )}&username=${futureCourseLearner.identity.username}&depth=all`,
      );
      expect(response.status()).toBeLessThan(500);
    });
  },
);
