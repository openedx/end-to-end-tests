import { expect, test } from '../../../src/fixtures';
import { fetchGradingPolicy } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_TAGS } from './helpers';

/**
 * The Grading tab's three read-only entry points (TC-00524): the gradebook
 * MFE, the grading-configuration modal, and Studio's grading settings. Landing
 * *paths* are asserted, never hosts or copy; the configuration itself is the
 * course's grading policy read from Studio.
 */
test.describe(
  'Instructor dashboard grading — links',
  { tag: ['@regression', ...INSTRUCTOR_TAGS] },
  () => {
    test(
      'opens the gradebook, the grading configuration and the Studio grading settings',
      { annotation: testId('TC-00524') },
      async ({ page, config, contentCourse, instructorGrading, studioAuthorSession }) => {
        void studioAuthorSession;
        const courseKey = contentCourse.courseKey;
        await instructorGrading.gotoTab(courseKey);

        await expect(instructorGrading.gradebookLink).toHaveAttribute(
          'href',
          new RegExp(`/gradebook/${courseKey.replace(/\+/g, '\\+')}`),
        );
        const gradebook = await instructorGrading.viewGradebook();
        expect(new URL(gradebook.url()).pathname).toContain(`/gradebook/${courseKey}`);
        if (gradebook !== page) await gradebook.close();

        await instructorGrading.gotoTab(courseKey);
        await instructorGrading.openGradingConfiguration();
        await expect(instructorGrading.dialog).toBeVisible();
        // The configuration the modal dumps is this policy; Studio is the oracle.
        const policy = await fetchGradingPolicy(page.request, config, courseKey);
        expect(policy.graders.length).toBeGreaterThan(0);
        await instructorGrading.closeDialog();

        const studio = await instructorGrading.viewStudioGradingSettings();
        expect(new URL(studio.url()).pathname).toContain(`/course/${courseKey}/settings/grading`);
        if (studio !== page) await studio.close();
      },
    );
  },
);
