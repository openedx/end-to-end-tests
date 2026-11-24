import { checkA11y } from '../../../src/a11y';
import {
  buildSection,
  fetchCourseQuality,
  fetchCourseValidation,
  updateCourseDetails,
  type CourseValidation,
} from '../../../src/api';
import { LAUNCH_CHECKLIST_ITEMS, TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * The Launch and Best-practices checklists (authoring MFE), on the worker's own
 * course.
 *
 * The MFE computes each item's complete/incomplete state from the course's
 * validation / quality API; the test reads the same API and asserts the drawn
 * state agrees with it. Comparing the UI against the very endpoint it renders is
 * robust to the platform's own timing (the validation read can lag a Studio
 * write, but the UI reads the same lagging value, so the two still agree).
 *
 * The item validators below are the platform's, kept to the version-stable
 * Launch rules. The empty worker course carries no gradable content, so the
 * quality-derived Best-practices states depend on the deployed MFE's own
 * (release-varying) thresholds — that case asserts the section's shape and its
 * data source. The last case authors the content TC-00307 names (a unit with a
 * video, a problem and a text component) in a course of its own and reads the
 * items that content checks off. The video-duration item, and the case's final
 * step (replacing the video with ones over ten minutes long), are not driven: a
 * video's length comes from the video pipeline's records, and the suite uploads
 * no video.
 */

const END_DATE = '2041-01-01T00:00:00Z';

/** Whether the Launch checklist marks each item complete, per the validation API. */
const LAUNCH_COMPLETE: Record<
  (typeof LAUNCH_CHECKLIST_ITEMS)[number],
  (v: CourseValidation) => boolean
> = {
  welcomeMessage: (v) => v.updates.has_update,
  gradingPolicy: (v) =>
    v.grades.has_grading_policy && Number(v.grades.sum_of_weights.toPrecision(2)) === 1,
  certificate: (v) => v.certificates.is_activated && v.certificates.has_certificate,
  courseDates: (v) => [v.dates.has_start_date, v.dates.has_end_date].every(Boolean),
  assignmentDeadlines: (v) =>
    v.assignments.total_number > 0 &&
    [v.dates.has_start_date, v.dates.has_end_date].every(Boolean) &&
    v.assignments.assignments_with_dates_before_start.length === 0 &&
    v.assignments.assignments_with_dates_after_end.length === 0,
  proctoringEmail: (v) => v.proctoring?.has_proctoring_escalation_email ?? false,
};

test.describe('Checklists', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  test(
    'the launch checklist reflects the validation API',
    { tag: '@regression', annotation: testId('TC-00306') },
    async ({ page, config, authoredCourse, checklistsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;

      await checklistsPage.goto(courseKey);

      // The visible Launch items (some are filtered out by pacing / feature).
      const present = await Promise.all(
        LAUNCH_CHECKLIST_ITEMS.map((id) => checklistsPage.hasItem(id)),
      );
      const visible = LAUNCH_CHECKLIST_ITEMS.filter((_, i) => present[i]);
      expect(visible).toContain('courseDates');

      // Each drawn item agrees with the validation API's own verdict.
      const mismatches = async () => {
        const validation = await fetchCourseValidation(api, config, courseKey);
        const rows = await Promise.all(
          visible.map(async (id) => ({
            id,
            rendered: await checklistsPage.isComplete(id),
            api: LAUNCH_COMPLETE[id](validation),
          })),
        );
        return rows.filter((row) => row.rendered !== row.api).map((row) => row.id);
      };
      await expect.poll(mismatches).toEqual([]);

      await checkA11y(page, { label: 'studio-checklists' });

      // A settings change the checklist watches: an end date registers in the
      // validation API, and the drawn checklist stays consistent with it.
      await updateCourseDetails(api, config, courseKey, { end_date: END_DATE });
      await checklistsPage.goto(courseKey);
      await expect
        .poll(async () => ({
          endDate: (await fetchCourseValidation(api, config, courseKey)).dates.has_end_date,
          mismatches: await mismatches(),
        }))
        .toEqual({ endDate: true, mismatches: [] });

      // Leave the worker course as the factory made it.
      await updateCourseDetails(api, config, courseKey, { end_date: null });
    },
  );

  test(
    'the best-practices checklist reflects course quality',
    { tag: '@regression', annotation: testId('TC-00307') },
    async ({ page, config, authoredCourse, checklistsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;

      await checklistsPage.goto(courseKey);

      // The Best-practices checklist is on by default (ENABLE_CHECKLIST_QUALITY),
      // and shows the content-diversity items for an instructor-paced course
      // ("weekly highlights" is self-paced-only, so it is not shown here).
      expect(await checklistsPage.hasItem('diverseSequences')).toBe(true);
      expect(await checklistsPage.hasItem('unitDepth')).toBe(true);
      expect(await checklistsPage.hasItem('weeklyHighlights')).toBe(false);

      // Its data source is the quality API; the empty worker course reads as
      // empty (no sections / subsections / units / videos).
      const quality = await fetchCourseQuality(api, config, courseKey);
      expect({
        sections: quality.sections.total_visible,
        subsections: quality.subsections.total_visible,
        units: quality.units.total_visible,
        videos: quality.videos.total_number,
      }).toEqual({ sections: 0, subsections: 0, units: 0, videos: 0 });

      // With no content, "diverse sequences" and "unit depth" cannot be met —
      // both validators require visible subsections / units — so the MFE draws
      // them incomplete. (Per-item states that need content are Epic 8's.)
      await expect
        .poll(async () => ({
          diverse: await checklistsPage.isComplete('diverseSequences'),
          unit: await checklistsPage.isComplete('unitDepth'),
        }))
        .toEqual({ diverse: false, unit: false });
    },
  );

  test(
    'the best-practices checklist checks off what the course content meets',
    { tag: '@regression', annotation: testId('TC-00307') },
    async ({ page, config, authoringCourse, checklistsPage, studioAuthorSession }) => {
      test.setTimeout(TIMEOUTS.contentTest);
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoringCourse;
      const drawn = async () => ({
        diverse: await checklistsPage.isComplete('diverseSequences'),
        unit: await checklistsPage.isComplete('unitDepth'),
      });

      // A course with no content: no box is checked.
      await checklistsPage.goto(courseKey);
      await expect
        .poll(async () => ({
          ...(await drawn()),
          video: await checklistsPage.isComplete('videoDuration'),
        }))
        .toEqual({ diverse: false, unit: false, video: false });

      // The case's course: one section, one subsection, and one unit holding a
      // video, a problem and a text component.
      await buildSection(api, config, courseKey, `E2E checklist ${test.info().testId.slice(-6)}`, {
        subsections: [{ units: [{ blocks: ['video', 'multiplechoiceresponse', 'html'] }] }],
        publish: true,
      });

      // The quality API counts that content — a unit, a video, and a subsection
      // that mixes block types — and the checklist checks off "diverse
      // sequences" and "unit depth". The page is reloaded inside the poll: it
      // reads the quality data once, when it opens.
      //
      // "Video duration" is not read here. The platform knows a video's length
      // only from the video pipeline's record of an uploaded file, and this
      // video is a YouTube reference with no such record, so the item stays
      // unchecked whatever the video's real length.
      await expect
        .poll(
          async () => {
            const quality = await fetchCourseQuality(api, config, courseKey);
            await checklistsPage.goto(courseKey);
            return {
              videos: quality.videos.total_number,
              units: quality.units.total_visible,
              singleTypeSubsections: quality.subsections.num_with_one_block_type,
              ...(await drawn()),
            };
          },
          { timeout: TIMEOUTS.contentPublish },
        )
        .toEqual({ videos: 1, units: 1, singleTypeSubsections: 0, diverse: true, unit: true });
    },
  );
});
