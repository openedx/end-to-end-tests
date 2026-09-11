import { expect, test } from '../../../src/fixtures';
import {
  buildSection,
  courseUsageKey,
  fetchCourseIndex,
  fetchXBlockOutline,
  updateXBlock,
} from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Section highlights (TC-00172): turning on the course's highlights-for-messaging
 * flag and giving a section its bullet list of highlights, then reading both back.
 *
 * This is the authoring half only. Highlights drive the weekly "what's coming up"
 * e-mail, which needs the schedules beat and an inbox to observe — Epic 11's
 * problem, out of scope here. The author-side outcome is what Studio stores:
 * `course_index.course_structure.highlights_enabled_for_messaging` for the course
 * flag, and the section's `xblock/outline` `highlights` for its list. Both are the
 * test's own data, so the spec may match the exact strings it wrote.
 */
test.describe(
  'Course outline highlights',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring'] },
  () => {
    test(
      'enables course highlights and stores a section highlight list',
      { annotation: testId('TC-00172') },
      async ({ page, config, authoringCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const api = page.request;
        const courseKey = authoringCourse.courseKey;
        const label = `E2E highlights ${test.info().testId.slice(-6)}`;

        const section = await buildSection(api, config, courseKey, label);

        // Turn on highlights-for-messaging at the course level. The MFE sends this
        // as a course-block write with `publish: republish`.
        await updateXBlock(api, config, courseUsageKey(courseKey), {
          publish: 'republish',
          metadata: { highlights_enabled_for_messaging: true },
        });
        const index = await fetchCourseIndex(api, config, courseKey);
        expect(index.course_structure.highlights_enabled_for_messaging).toBe(true);

        // Give the section its highlight bullets and read them back off the section.
        const highlights = [`${label} highlight one`, `${label} highlight two`];
        await updateXBlock(api, config, section.usageKey, {
          metadata: { highlights },
        });
        const stored = await fetchXBlockOutline(api, config, section.usageKey);
        expect(stored.highlights).toEqual(highlights);
      },
    );
  },
);
