import { checkA11y } from '../../../src/a11y';
import {
  ApiError,
  enrollInCourseViaApi,
  fetchCourseDetail,
  fetchCourseDetails,
  fetchCourseMetadata,
  isEnrolled,
  listStudioCourses,
  updateCourseDetails,
  type CourseDetails,
} from '../../../src/api';
import { getRunId } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { toDateTimeFields } from '../../../src/pages/studio/settings/schedule-details.page';
import { testId } from '../../../src/reporting';

/**
 * Schedule & Details (authoring MFE), on the worker's own course.
 *
 * The MFE drives every change; Studio's `course_details` and the LMS course,
 * enrollment and course-home APIs decide whether it took. Each test resets the
 * fields it is about through the API first, so the tests are independent of
 * one another and of what an earlier run left on the course. Dates are UTC
 * throughout: the page reads and writes UTC, and the APIs answer in `Z` time.
 */

/** The factory's course start; also what every test restores. */
const DEFAULT_START = '2040-01-01T00:00:00Z';

/** Fixed instants, far enough from "now" that a slow run cannot cross them. */
const PAST = new Date('2020-01-15T00:00:00Z');
const PAST_END = new Date('2020-06-01T00:00:00Z');
const FUTURE = new Date('2039-06-01T00:00:00Z');
const FAR_FUTURE = new Date('2041-01-01T00:00:00Z');

/**
 * Course start for the enrollment cases, later than every enrollment instant they
 * use. Schedule & Details enforces "the course start date must be later than the
 * enrollment start date", so a course that starts in the past cannot carry a
 * future enrollment window — enrollment opening before the course starts is the
 * ordinary case, and this keeps the constraint satisfied while the window moves.
 */
const ENROLLMENT_COURSE_START = '2045-01-01T00:00:00Z';

/** `now` shifted by `hours`, truncated to the minute the page can express. */
function hoursFromNow(hours: number): Date {
  const instant = new Date(Date.now() + hours * 3_600_000);
  instant.setUTCSeconds(0, 0);
  return instant;
}

const iso = (instant: Date) => instant.toISOString().replace('.000Z', 'Z');

/**
 * Every field the schedule tests touch, back to the factory's state. Each test
 * writes this first so it is independent of what an earlier test — including one
 * that failed before its own cleanup — left on the worker-shared course.
 */
const SCHEDULE_BASELINE: Partial<CourseDetails> = {
  self_paced: false,
  start_date: DEFAULT_START,
  end_date: null,
  enrollment_start: null,
  enrollment_end: null,
  effort: null,
  intro_video: null,
  certificate_available_date: null,
};

test.describe('Schedule & Details', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  test(
    'sets the course to instructor-paced',
    { tag: '@regression', annotation: testId('TC-00293') },
    async ({ page, request, config, authoredCourse, scheduleDetailsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      await updateCourseDetails(request, config, courseKey, { self_paced: true });

      await scheduleDetailsPage.goto(courseKey);
      await expect(scheduleDetailsPage.selfPacedRadio).toBeChecked();
      await scheduleDetailsPage.setPacing('instructor');
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(async () => ({
          studio: (await fetchCourseDetails(request, config, courseKey)).self_paced,
          lms: (await fetchCourseDetail(request, config, courseKey)).pacing,
        }))
        .toEqual({ studio: false, lms: 'instructor' });

      // `STUDIO-004` (see `.private/findings.md`): the authoring MFE's own
      // Schedule & Details chrome ships a critical `label` violation — the
      // course-card image drop zone's hidden file input has no label. The serious
      // `link-in-text-block` is the demo overview's own content (the `DEMO-001`
      // theming class) rendered in the TinyMCE preview, not this page's markup.
      // Tolerated on this screen only; remove `label` when STUDIO-004 lands.
      await checkA11y(page, {
        label: 'studio-schedule-details',
        additionalBaseline: ['label', 'link-in-text-block'],
      });
    },
  );

  test(
    'sets the course to self-paced',
    { tag: '@regression', annotation: testId('TC-00294') },
    async ({ request, config, authoredCourse, scheduleDetailsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      await updateCourseDetails(request, config, courseKey, { self_paced: false });

      await scheduleDetailsPage.goto(courseKey);
      await expect(scheduleDetailsPage.instructorPacedRadio).toBeChecked();
      await scheduleDetailsPage.setPacing('self');
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(async () => ({
          studio: (await fetchCourseDetails(request, config, courseKey)).self_paced,
          lms: (await fetchCourseDetail(request, config, courseKey)).pacing,
        }))
        .toEqual({ studio: true, lms: 'self' });

      // Leave the worker course as the factory made it.
      await updateCourseDetails(request, config, courseKey, { self_paced: false });
    },
  );

  test(
    'course start and end dates decide learner access and archival',
    { tag: '@regression', annotation: testId('TC-00295') },
    async ({
      request,
      config,
      authoredCourse,
      scheduleDetailsPage,
      studioAuthorSession,
      newLearner,
    }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      await updateCourseDetails(request, config, courseKey, SCHEDULE_BASELINE);

      // An enrolled learner, kept out only by the schedule.
      const learner = await newLearner();
      await enrollInCourseViaApi(learner.request, config, courseKey);
      expect(
        (await fetchCourseMetadata(learner.request, config, courseKey)).course_access,
      ).toMatchObject({
        has_access: false,
        error_code: 'course_not_started',
      });

      // Start in the past, end in the future: the course is open.
      await scheduleDetailsPage.goto(courseKey);
      await scheduleDetailsPage.setCourseStart(toDateTimeFields(PAST));
      await scheduleDetailsPage.setCourseEnd(toDateTimeFields(FAR_FUTURE));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      await expect
        .poll(async () => {
          const studio = await fetchCourseDetails(request, config, courseKey);
          const lms = await fetchCourseDetail(request, config, courseKey);
          const access = (await fetchCourseMetadata(learner.request, config, courseKey))
            .course_access;
          return {
            studio: [studio.start_date, studio.end_date],
            lms: [lms.start, lms.end],
            hasAccess: access.has_access,
          };
        })
        .toEqual({
          studio: [iso(PAST), iso(FAR_FUTURE)],
          lms: [iso(PAST), iso(FAR_FUTURE)],
          hasAccess: true,
        });

      // Start in the future: the learner is kept out again.
      await scheduleDetailsPage.setCourseStart(toDateTimeFields(FUTURE));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      await expect
        .poll(async () => {
          const lms = await fetchCourseDetail(request, config, courseKey);
          const access = (await fetchCourseMetadata(learner.request, config, courseKey))
            .course_access;
          return { start: lms.start, hasAccess: access.has_access, why: access.error_code };
        })
        .toEqual({ start: iso(FUTURE), hasAccess: false, why: 'course_not_started' });

      // End in the past: the course is archived, and Studio Home files it so.
      await scheduleDetailsPage.setCourseStart(toDateTimeFields(PAST));
      await scheduleDetailsPage.setCourseEnd(toDateTimeFields(PAST_END));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      // The archived list is searched by course *number*, which a re-run of this
      // course (the lifecycle spec's, on the same worker) shares — so assert this
      // course is among the archived, not that it is the only one.
      await expect
        .poll(async () => {
          const lms = await fetchCourseDetail(request, config, courseKey);
          const archived = await listStudioCourses(request, config, {
            search: authoredCourse.number,
            archivedOnly: true,
          });
          return {
            end: lms.end,
            archived: archived.courses.some((course) => course.courseKey === courseKey),
          };
        })
        .toEqual({ end: iso(PAST_END), archived: true });

      await updateCourseDetails(request, config, courseKey, SCHEDULE_BASELINE);
    },
  );

  test(
    'course start and end times are honoured to the minute, in UTC',
    { tag: '@regression', annotation: testId('TC-00296') },
    async ({
      request,
      config,
      authoredCourse,
      scheduleDetailsPage,
      studioAuthorSession,
      newLearner,
    }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      await updateCourseDetails(request, config, courseKey, SCHEDULE_BASELINE);
      const learner = await newLearner();
      await enrollInCourseViaApi(learner.request, config, courseKey);

      // Today, a couple of hours from now: not started yet.
      const laterToday = hoursFromNow(2);
      await scheduleDetailsPage.goto(courseKey);
      await scheduleDetailsPage.setCourseStart(toDateTimeFields(laterToday));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      await expect
        .poll(async () => {
          const lms = await fetchCourseDetail(request, config, courseKey);
          const access = (await fetchCourseMetadata(learner.request, config, courseKey))
            .course_access;
          return { start: lms.start, hasAccess: access.has_access, why: access.error_code };
        })
        .toEqual({ start: iso(laterToday), hasAccess: false, why: 'course_not_started' });

      // A couple of hours ago: started.
      const earlierToday = hoursFromNow(-2);
      await scheduleDetailsPage.setCourseStart(toDateTimeFields(earlierToday));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      await expect
        .poll(async () => {
          const lms = await fetchCourseDetail(request, config, courseKey);
          const access = (await fetchCourseMetadata(learner.request, config, courseKey))
            .course_access;
          return { start: lms.start, hasAccess: access.has_access };
        })
        .toEqual({ start: iso(earlierToday), hasAccess: true });

      // Ended an hour ago: archived.
      const justEnded = hoursFromNow(-1);
      await scheduleDetailsPage.setCourseEnd(toDateTimeFields(justEnded));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      // Archived is searched by number, which a same-worker re-run shares (see the
      // dates case above): assert this course is among the archived, not the only.
      await expect
        .poll(async () => {
          const lms = await fetchCourseDetail(request, config, courseKey);
          const archived = await listStudioCourses(request, config, {
            search: authoredCourse.number,
            archivedOnly: true,
          });
          return {
            end: lms.end,
            archived: archived.courses.some((course) => course.courseKey === courseKey),
          };
        })
        .toEqual({ end: iso(justEnded), archived: true });

      await updateCourseDetails(request, config, courseKey, SCHEDULE_BASELINE);
    },
  );

  test(
    'sets a custom certificates-available date',
    { tag: '@regression', annotation: testId('TC-00297') },
    async ({
      request,
      config,
      authoredCourse,
      scheduleDetailsPage,
      studioAuthorSession,
      certificateAvailableDateField,
    }) => {
      void studioAuthorSession;
      void certificateAvailableDateField;
      const { courseKey } = authoredCourse;
      // Instructor-paced with an end date, which is when the fields apply.
      await updateCourseDetails(request, config, courseKey, {
        ...SCHEDULE_BASELINE,
        start_date: iso(PAST),
        end_date: iso(FUTURE),
        certificate_available_date: null,
      });
      const available = new Date('2039-07-01T12:00:00Z');

      await scheduleDetailsPage.goto(courseKey);
      await scheduleDetailsPage.setCertificateAvailableDate(toDateTimeFields(available));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(
          async () =>
            (await fetchCourseDetails(request, config, courseKey)).certificate_available_date,
        )
        .toBe(iso(available));

      await updateCourseDetails(request, config, courseKey, {
        ...SCHEDULE_BASELINE,
        certificate_available_date: null,
      });
    },
  );

  test(
    'enrollment is allowed only within the enrollment dates',
    { tag: '@regression', annotation: testId('TC-00298') },
    async ({
      request,
      config,
      authoredCourse,
      scheduleDetailsPage,
      studioAuthorSession,
      newLearner,
    }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;

      // Confirm the saved window on Studio's own `course_details` — its source of
      // truth, which updates promptly. The LMS enrollment-details read endpoint
      // (`/api/enrollment/v1/course/`) is intermittently stale for several seconds
      // after a window change, so it is not a reliable read; the enforcement below
      // (the actual enroll attempt) reads the authoritative window and is prompt.
      const windowSaved = (start: Date | null, end: Date | null) =>
        expect
          .poll(async () => {
            const d = await fetchCourseDetails(request, config, courseKey);
            return [d.enrollment_start ?? null, d.enrollment_end ?? null];
          })
          .toEqual([start && iso(start), end && iso(end)]);

      // The window is driven through the MFE for every case. Course start stays far
      // in the future throughout: the page requires it to be later than the
      // enrollment start, and enrolling before a course begins is the ordinary
      // case. The refusals come first and the one successful enrollment last: the
      // platform will not move the enrollment start forward once a learner is
      // enrolled (an enrolled learner cannot be stranded outside the window), so no
      // window change follows the enrollment.
      await updateCourseDetails(request, config, courseKey, {
        ...SCHEDULE_BASELINE,
        start_date: ENROLLMENT_COURSE_START,
      });
      await scheduleDetailsPage.goto(courseKey);

      // Window not yet open: a learner is refused.
      await scheduleDetailsPage.setEnrollmentStart(toDateTimeFields(FUTURE));
      await scheduleDetailsPage.setEnrollmentEnd(toDateTimeFields(FAR_FUTURE));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      await windowSaved(FUTURE, FAR_FUTURE);
      const tooEarly = await newLearner();
      await expect(enrollInCourseViaApi(tooEarly.request, config, courseKey)).rejects.toThrow(
        ApiError,
      );
      expect(await isEnrolled(tooEarly.request, config, courseKey)).toBe(false);

      // Window closed: a learner is refused.
      await scheduleDetailsPage.setEnrollmentStart(toDateTimeFields(PAST));
      await scheduleDetailsPage.setEnrollmentEnd(toDateTimeFields(PAST_END));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      await windowSaved(PAST, PAST_END);
      const tooLate = await newLearner();
      await expect(enrollInCourseViaApi(tooLate.request, config, courseKey)).rejects.toThrow(
        ApiError,
      );
      expect(await isEnrolled(tooLate.request, config, courseKey)).toBe(false);

      // Open window: a learner can enroll. Only the end moves here, so the
      // enrollment start never advances; the enrollment is the test's last action.
      await scheduleDetailsPage.setEnrollmentEnd(toDateTimeFields(FAR_FUTURE));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      await windowSaved(PAST, FAR_FUTURE);
      const inTime = await newLearner();
      await enrollInCourseViaApi(inTime.request, config, courseKey);
      expect(await isEnrolled(inTime.request, config, courseKey)).toBe(true);

      await updateCourseDetails(request, config, courseKey, SCHEDULE_BASELINE);
    },
  );

  test(
    'enrollment start and end times are honoured to the minute, in UTC',
    { tag: '@regression', annotation: testId('TC-00299') },
    async ({
      request,
      config,
      authoredCourse,
      scheduleDetailsPage,
      studioAuthorSession,
      newLearner,
    }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      await updateCourseDetails(request, config, courseKey, {
        ...SCHEDULE_BASELINE,
        start_date: ENROLLMENT_COURSE_START,
      });

      // Confirm the saved window on Studio's own `course_details` — its source of
      // truth, which updates promptly. The LMS enrollment-details read endpoint
      // (`/api/enrollment/v1/course/`) is intermittently stale for several seconds
      // after a window change, so it is not a reliable read; the enforcement below
      // (the actual enroll attempt) reads the authoritative window and is prompt.
      const windowSaved = (start: Date | null, end: Date | null) =>
        expect
          .poll(async () => {
            const d = await fetchCourseDetails(request, config, courseKey);
            return [d.enrollment_start ?? null, d.enrollment_end ?? null];
          })
          .toEqual([start && iso(start), end && iso(end)]);

      // Times are entered and read in UTC (the browser runs in UTC, per the
      // Playwright config), so a time set to the minute round-trips exactly. The
      // refusals come first and the enrollment last, as in TC-00298.
      const opensLater = hoursFromNow(2);
      const openedEarlier = hoursFromNow(-2);
      const closedEarlier = hoursFromNow(-1);
      await scheduleDetailsPage.goto(courseKey);

      // Opens two hours from now: enrollment has not started, so a learner is
      // refused — and the minute-precise start is what the LMS reports.
      await scheduleDetailsPage.setEnrollmentStart(toDateTimeFields(opensLater));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      await windowSaved(opensLater, null);
      const tooEarly = await newLearner();
      await expect(enrollInCourseViaApi(tooEarly.request, config, courseKey)).rejects.toThrow(
        ApiError,
      );

      // Opened two hours ago but closed an hour ago: the window is in the past, so
      // a learner is refused.
      await scheduleDetailsPage.setEnrollmentStart(toDateTimeFields(openedEarlier));
      await scheduleDetailsPage.setEnrollmentEnd(toDateTimeFields(closedEarlier));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      await windowSaved(openedEarlier, closedEarlier);
      const tooLate = await newLearner();
      await expect(enrollInCourseViaApi(tooLate.request, config, courseKey)).rejects.toThrow(
        ApiError,
      );

      // Opened two hours ago and still open: a learner can enroll. Only the end
      // moves here, so the enrollment start never advances after the enrollment.
      await scheduleDetailsPage.setEnrollmentEnd(toDateTimeFields(FAR_FUTURE));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      await windowSaved(openedEarlier, FAR_FUTURE);
      const inTime = await newLearner();
      await enrollInCourseViaApi(inTime.request, config, courseKey);
      expect(await isEnrolled(inTime.request, config, courseKey)).toBe(true);

      await updateCourseDetails(request, config, courseKey, SCHEDULE_BASELINE);
    },
  );

  test(
    'uploads and sets the course card image',
    { tag: '@regression', annotation: testId('TC-00302') },
    async ({ request, config, authoredCourse, scheduleDetailsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      const fileName = `e2e-card-${getRunId()}-${Date.now().toString(36)}.png`;

      await scheduleDetailsPage.goto(courseKey);
      const upload = await scheduleDetailsPage.uploadCourseImage({
        name: fileName,
        mimeType: 'image/png',
        buffer: ONE_PIXEL_PNG,
      });
      expect(upload.status).toBeLessThan(300);
      await expect(scheduleDetailsPage.courseImagePath).toHaveValue(
        new RegExp(fileName.replace(/[.-]/g, '\\$&')),
      );
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(async () => {
          const studio = await fetchCourseDetails(request, config, courseKey);
          const lms = await fetchCourseDetail(request, config, courseKey);
          return {
            name: studio.course_image_name,
            lmsHasIt: (lms.courseImageUri ?? '').includes(fileName),
          };
        })
        .toEqual({ name: fileName, lmsHasIt: true });
    },
  );

  test(
    'adds a YouTube introduction video',
    { tag: '@regression', annotation: testId('TC-00303') },
    async ({ request, config, authoredCourse, scheduleDetailsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      await updateCourseDetails(request, config, courseKey, SCHEDULE_BASELINE);
      // Any well-formed YouTube ID: the page embeds it, the platform stores it.
      const videoId = 'aqz-KE-bpKQ';

      await scheduleDetailsPage.goto(courseKey);
      await scheduleDetailsPage.setIntroVideoId(videoId);
      // The page previews the video it will save (the rendering is the point here).
      await expect(scheduleDetailsPage.introVideoFrame).toHaveAttribute('src', new RegExp(videoId));
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(async () => {
          const studio = await fetchCourseDetails(request, config, courseKey);
          const lms = await fetchCourseDetail(request, config, courseKey);
          return {
            studio: studio.intro_video,
            lmsHasIt: (lms.courseVideoUri ?? '').includes(videoId),
          };
        })
        .toEqual({ studio: videoId, lmsHasIt: true });
    },
  );

  test(
    'sets the estimated hours of effort',
    { tag: '@regression', annotation: testId('TC-00304') },
    async ({ request, config, authoredCourse, scheduleDetailsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      await updateCourseDetails(request, config, courseKey, SCHEDULE_BASELINE);

      await scheduleDetailsPage.goto(courseKey);
      await scheduleDetailsPage.setEffort('3:30');
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(async () => ({
          studio: (await fetchCourseDetails(request, config, courseKey)).effort,
          lms: (await fetchCourseDetail(request, config, courseKey)).effort,
        }))
        .toEqual({ studio: '3:30', lms: '3:30' });
    },
  );

  // The prerequisite dropdown offers only courses the author already has, and
  // the worker owns exactly one (§2.4 course budget: the settings specs never
  // create a second). Driving the control needs another course of the author's
  // — the lifecycle spec's re-run course, once that exists — plus a learner who
  // has not completed it to observe `course_access.error_code`
  // (`prerequisites_not_met`) on the LMS. Lift when that course is available.
  test.fixme(
    'a prerequisite course blocks learners until they complete it',
    { tag: '@regression', annotation: testId('TC-00305') },
    async ({
      request,
      config,
      authoredCourse,
      scheduleDetailsPage,
      studioAuthorSession,
      newLearner,
    }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;
      await scheduleDetailsPage.goto(courseKey);
      await scheduleDetailsPage.choosePrerequisite(1);
      expect((await scheduleDetailsPage.save(courseKey)).status).toBe(200);
      const details = await fetchCourseDetails(request, config, courseKey);
      expect(details.pre_requisite_courses).toHaveLength(1);

      const learner = await newLearner();
      await enrollInCourseViaApi(learner.request, config, courseKey);
      await expect
        .poll(
          async () => (await fetchCourseMetadata(learner.request, config, courseKey)).course_access,
        )
        .toMatchObject({ has_access: false, error_code: 'prerequisites_not_met' });
    },
  );
});

/** The smallest valid PNG: one transparent pixel. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
