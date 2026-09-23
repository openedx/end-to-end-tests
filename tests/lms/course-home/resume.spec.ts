import { expect, test } from '../../../src/fixtures';
import { fetchCourseHomeOutline, fetchResumePoint, recordCompletion } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Resume (TC-00028): the course home's Resume button takes the learner to the
 * block they completed most recently. The completion is recorded through the
 * learner's own completion API, so the resume point is exactly the block the
 * test chose; the button, its target and the unit it opens are then read from
 * the course home the learner sees.
 */
test(
  'resumes at the most recently completed block',
  { tag: ['@smoke', '@authenticated', '@mfe-learning'], annotation: testId('TC-00028') },
  async ({ page, request, config, courseOutlinePage, courseOutline, enrolledCourse }) => {
    const { courseKey, identity } = enrolledCourse;
    // Not the first unit, which a fresh learner "resumes" at anyway.
    const unit = courseOutline.units.find(
      (candidate) => candidate !== courseOutline.units[0] && candidate.childIds.length > 0,
    );
    expect(unit, 'the course has a second unit with content').toBeDefined();
    const blockId = unit!.childIds[0]!;

    await recordCompletion(request, config, identity.username, courseKey, blockId);
    expect(await fetchResumePoint(request, config, courseKey)).toMatchObject({
      block_id: blockId,
      unit_id: unit!.id,
    });
    const outline = await fetchCourseHomeOutline(request, config, courseKey);
    expect(outline.resume_course.has_visited_course).toBe(true);

    await courseOutlinePage.goto(courseKey);
    await courseOutlinePage.dismissTourDialog();
    await expect(courseOutlinePage.resumeLink).toHaveAttribute('href', outline.resume_course.url);

    await courseOutlinePage.resume();
    expect(new URL(page.url()).pathname).toContain(unit!.id);
  },
);
