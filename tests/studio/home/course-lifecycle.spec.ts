import { checkA11y } from '../../../src/a11y';
import {
  courseExists,
  courseKeyFor,
  listStudioCourses,
  rerunCourse,
  updateCourseDetails,
  waitForRerun,
  type CourseIdentity,
} from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { StudioHomePage } from '../../../src/pages/studio/home/studio-home.page';
import { testId } from '../../../src/reporting';

/** A course end well in the past, so the platform files the course as archived. */
const PAST_END = '2020-01-01T00:00:00Z';

/** Matches a "View live" href that targets the course on the LMS. */
const liveUrl = (courseKey: string) => new RegExp(`/courses/${courseKey.replace(/[+:]/g, '\\$&')}`);

/**
 * The course lifecycle from Studio Home: re-run, View live, and archival.
 *
 * "Re-run course" is a global-staff action — Studio offers it on the course
 * card only to global staff, so a course author's card menu has View live alone
 * — so TC-00251 drives it as the administrator, on `adminPage`: the card's
 * "Re-run course", then the authoring MFE's re-run form. Archival (TC-00253)
 * needs a course of the author's own to end, so it re-runs the worker course
 * through the same `POST /course/` the form makes (setup, not the case), and the
 * MFE is where its archival is observed. Each test spends one re-run course
 * (§2.4 course budget).
 */
test.describe('Course lifecycle', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  // The re-run copy runs on the CMS worker under `TIMEOUTS.courseRerun`, longer
  // than the default test budget.
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    're-runs a course from its Studio Home card into a new run',
    { tag: '@regression', annotation: testId('TC-00251') },
    async ({ config, authoredCourse, studioAuthorSession, adminPage }, testInfo) => {
      void studioAuthorSession;
      // The administrator's own browser session; its API calls ride the same
      // session (`adminPage.request`). Re-run keeps org + number, takes a new run.
      const admin = adminPage.request;
      const run = `rerunui${testInfo.retry}`;
      const destKey = courseKeyFor(authoredCourse.org, authoredCourse.number, run);
      const home = new StudioHomePage(adminPage, config);

      await home.goto();
      await home.search(authoredCourse.number);
      const created = await home.rerunFromCard(authoredCourse.courseKey, run);
      expect(created.status, created.body).toBe(200);

      // The copy runs on the CMS worker; then the new run exists and Studio Home
      // lists it beside its source.
      await waitForRerun(admin, config, destKey);
      expect(await courseExists(admin, config, destKey)).toBe(true);
      await home.goto();
      await home.search(authoredCourse.number);
      await expect.poll(() => home.renderedCourseKeys()).toContain(destKey);
    },
  );

  test(
    'archives a re-run once it has ended',
    { tag: '@regression', annotation: testId('TC-00253') },
    async ({ page, config, authoredCourse, studioHomePage, studioAuthorSession }) => {
      void studioAuthorSession;

      // Drive the API off the browser context's own session (`page.request`), not a
      // standalone `request` fixture. The re-run is a legacy `POST /course/` that
      // authenticates by the Studio Django session cookie (no JWT fallback), and
      // `studioAuthorSession`'s cms-sso handshake logs the author into Studio in the
      // browser — which, under `PREVENT_CONCURRENT_LOGINS`, ends the author's other
      // Studio session, i.e. a separate `request` context's. Sharing the browser's
      // session is the one that survives (settings writes over DRF would ride the JWT,
      // but the re-run cannot). See `studio-browser-session-decays` findings.
      const api = page.request;

      // A re-run is a new **run** of the worker course — same org+number, a new run
      // (re-running into a new number is refused for the author). The copy runs on
      // the CMS worker, so wait for it to leave the home API's in-process actions.
      const destination: CourseIdentity = {
        org: authoredCourse.org,
        number: authoredCourse.number,
        run: 'rerun',
        displayName: `${authoredCourse.displayName} rerun`,
        courseKey: courseKeyFor(authoredCourse.org, authoredCourse.number, 'rerun'),
      };
      const destKey = await rerunCourse(api, config, authoredCourse.courseKey, destination);
      expect(destKey).toBe(destination.courseKey);
      await waitForRerun(api, config, destKey);

      // The re-run destination exists and appears in Studio Home.
      expect(await courseExists(api, config, destKey)).toBe(true);
      await studioHomePage.goto();
      await studioHomePage.search(authoredCourse.number);
      await expect.poll(() => studioHomePage.renderedCourseKeys()).toContain(destKey);

      await checkA11y(page, { label: 'studio-home' });

      // TC-00253: end it in the past → the platform files it as archived, and both
      // the archived-only query and the Archived filter list it (while the default
      // active view no longer does).
      await updateCourseDetails(api, config, destKey, { end_date: PAST_END });
      await expect
        .poll(async () =>
          (
            await listStudioCourses(api, config, {
              search: authoredCourse.number,
              archivedOnly: true,
            })
          ).courses.map((course) => course.courseKey),
        )
        .toContain(destKey);

      await studioHomePage.filterBy('archived');
      await expect.poll(() => studioHomePage.renderedCourseKeys()).toContain(destKey);
    },
  );

  test(
    'a course card offers the View live action to the live course',
    { tag: '@regression', annotation: [testId('TC-00252'), testId('TC-00258')] },
    async ({ page, config, authoredCourse, studioHomePage, studioAuthorSession }) => {
      void studioAuthorSession;
      await studioHomePage.goto();
      await studioHomePage.search(authoredCourse.number);

      // TC-00258: the card's three-dot menu opens and offers course actions.
      await studioHomePage.openCardMenu(authoredCourse.courseKey);
      await expect(studioHomePage.cardViewLiveLink).toBeVisible();

      // TC-00252: "View live" targets the course on the LMS.
      await expect(studioHomePage.cardViewLiveLink).toHaveAttribute(
        'href',
        liveUrl(authoredCourse.courseKey),
      );
      // …and following it lands on that course in the learning MFE. (The worker
      // course has no published content, so what renders there is not this
      // case's; TC-00171 and TC-00197 assert a live unit rendering.)
      const href = await studioHomePage.cardViewLiveLink.getAttribute('href');
      await page.goto(href ?? '');
      await expect(page).toHaveURL((url) =>
        url.href.startsWith(`${config.mfeUrls.learning}/course/${authoredCourse.courseKey}`),
      );
    },
  );
});
