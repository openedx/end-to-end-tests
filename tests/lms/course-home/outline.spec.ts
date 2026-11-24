import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { catalogSearchTermFor, locateCourseInCatalog } from '../../../src/steps';

/**
 * Course home: the outline a learner lands on, and its expand/collapse control.
 *
 * The control is a single button whose label alternates between "Expand all" and
 * "Collapse all", so the assertions are on the sections' own `aria-expanded`
 * state — the semantics the label describes, in a form that survives translation.
 */
test.describe('Course home outline', () => {
  test(
    'expands and collapses every section',
    {
      tag: ['@smoke', '@authenticated', '@mfe-learning'],
      annotation: testId('TC-00025'),
    },
    async ({ page, courseOutlinePage, courseOutline, enrolledCourse }) => {
      await courseOutlinePage.goto(enrolledCourse.courseKey);
      // The first-visit modal's backdrop swallows clicks meant for the outline.
      await courseOutlinePage.dismissTourDialog();

      // One collapsible per chapter, and a way into the course.
      await expect(courseOutlinePage.sectionTriggers).toHaveCount(courseOutline.chapterIds.length);
      await expect(courseOutlinePage.startResumeCard).toBeVisible();

      // Sections start closed, so one press of the control opens every one of them
      // and a second closes them again.
      await expect(courseOutlinePage.expandedSectionTriggers).toHaveCount(0);

      await courseOutlinePage.toggleAllSections();
      await expect(courseOutlinePage.expandedSectionTriggers).toHaveCount(
        courseOutline.chapterIds.length,
      );

      await courseOutlinePage.toggleAllSections();
      await expect(courseOutlinePage.expandedSectionTriggers).toHaveCount(0);

      // Tolerated for this screen only: the outline's own section headers nest
      // focusable content inside a `role="button"` element (finding recorded
      // outside this repo). The test below asserts the untolerated gate.
      await checkA11y(page, {
        label: 'course-home',
        additionalBaseline: ['nested-interactive'],
      });
    },
  );

  test(
    'is reached from the dashboard and from the catalog',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning'],
      annotation: testId('TC-00025'),
    },
    async ({
      page,
      config,
      dashboardPage,
      catalogPage,
      courseAboutPage,
      courseOutlinePage,
      courseOutline,
      courseDetail,
      enrolledCourse,
    }) => {
      const { courseKey } = enrolledCourse;
      const onOutline = async () => {
        await expect(courseOutlinePage.sectionTriggers).toHaveCount(
          courseOutline.chapterIds.length,
        );
        expect(new URL(page.url()).pathname).toContain(`/course/${courseKey}`);
      };

      // From the dashboard: the course name on the card leads to the outline.
      await dashboardPage.goto();
      await dashboardPage.courseCardTitle(courseKey).click();
      await onOutline();

      // From the catalog: the card of a course the learner is enrolled in opens
      // its About page, whose way into the course leads to the same outline.
      await locateCourseInCatalog(
        catalogPage,
        config,
        courseKey,
        catalogSearchTermFor(courseDetail),
      );
      await catalogPage.openCourseAbout(courseKey);
      await courseAboutPage.coursewareLink(courseKey).click();
      await onOutline();
    },
  );

  test(
    'a11y: the outline meets WCAG 2.2 AA',
    { tag: ['@smoke', '@authenticated', '@mfe-learning'] },
    async ({ page, courseOutlinePage, enrolledCourse }) => {
      // Each of the six section headers is a `role="button"` element containing
      // focusable content, which axe flags as `nested-interactive` (serious): a
      // keyboard or screen-reader user meets a control whose inner controls cannot
      // be reached predictably. An MFE fix, so it is tracked outside this repo; the
      // test above tolerates the rule for this screen only, and this one asserts the
      // state we want. Expected to fail until the MFE is fixed; an unexpected pass
      // is the signal to drop the marker and the tolerance above.
      test.fail(true, 'Course-home section headers nest focusable content in a role="button".');

      await courseOutlinePage.goto(enrolledCourse.courseKey);
      await courseOutlinePage.dismissTourDialog();

      await checkA11y(page, { label: 'course-home-untolerated' });
    },
  );
});
