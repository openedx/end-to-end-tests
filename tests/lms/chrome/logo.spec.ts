import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Logo sizing across the LMS (TC-00060): from the signed-out landing page, to
 * the learner dashboard, the course home and an in-course page, the header logo
 * and the footer's "Powered by" logo keep one size.
 *
 * This compares the install with itself, so it holds under any provider's theme
 * and never becomes a pixel baseline (ADR-0002). Where the four pages are
 * rendered by different frontend generations, the sizes are known to disagree
 * (`BASE-004`), and `chromeCase` marks the test an expected failure there.
 */
const TOLERANCE_PX = 1;

test(
  'keeps the header and footer logos one size across the LMS',
  { tag: ['@regression', '@authenticated'], annotation: testId('TC-00060') },
  async ({
    siteHeader,
    siteFooter,
    signedOutVisitor,
    chromeCase,
    dashboardPage,
    courseOutlinePage,
    unitPage,
    courseOutline,
    enrolledCourse,
    config,
  }) => {
    const { courseKey } = enrolledCourse;
    const unit = courseOutline.units[0]!;

    await signedOutVisitor.page.goto(`${config.baseUrls.lms}/`);
    const readings = [
      {
        page: 'landing (signed out)',
        generation: await signedOutVisitor.header.generation(),
        header: await signedOutVisitor.header.logoHeight(),
        poweredBy: (await signedOutVisitor.footer.imageHeights()).at(-1),
      },
    ];
    const opens = [
      { page: 'dashboard', open: () => dashboardPage.goto() },
      {
        page: 'course home',
        open: async () => {
          await courseOutlinePage.goto(courseKey);
          await courseOutlinePage.dismissTourDialog();
        },
      },
      { page: 'in-course', open: () => unitPage.goto(courseKey, unit.sequentialId, unit.id) },
    ];
    for (const { page, open } of opens) {
      await open();
      readings.push({
        page,
        generation: await siteHeader.generation(),
        header: await siteHeader.logoHeight(),
        poweredBy: (await siteFooter.imageHeights()).at(-1),
      });
    }

    chromeCase.expectKnownDefects({
      generations: readings.map((reading) => reading.generation),
      signedIn: true,
      scenario: 'logo-consistency',
    });
    const spread = (values: readonly (number | undefined)[]) =>
      Math.max(...values.map(Number)) - Math.min(...values.map(Number));
    expect(spread(readings.map((r) => r.header)), JSON.stringify(readings)).toBeLessThanOrEqual(
      TOLERANCE_PX,
    );
    expect(spread(readings.map((r) => r.poweredBy)), JSON.stringify(readings)).toBeLessThanOrEqual(
      TOLERANCE_PX,
    );
  },
);
