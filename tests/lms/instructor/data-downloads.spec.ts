import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig, type InstructorReportType } from '../../../src/config';
import { downloadReport, listReports } from '../../../src/api';
import { waitForReport } from '../../../src/steps';
import { checkA11y } from '../../../src/a11y';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_A11Y_BASELINE, INSTRUCTOR_TAGS, csvHeader } from './helpers';
import type { InstructorDataDownloadsPage } from '../../../src/pages/lms/instructor/data-downloads.page';

/**
 * Data downloads (TC-00526–TC-00535): every report the tab can generate is
 * queued from its button, appears in the downloads list once its task finishes,
 * and downloads with the right media type. File *contents* are checked only as
 * far as a header row with a known column identifier (not UI copy); the sheet
 * puts deeper content checks out of scope.
 *
 * Completion is the conjunction the plan's §1.3 measured: the task has left the
 * in-flight list **and** a download of that type dated after the request is
 * listed — `generate` hands back no task id (`INSTR-002`).
 */
interface ReportCase {
  readonly id: string;
  readonly type: InstructorReportType;
  readonly title: string;
  /** Media type prefix of the download. */
  readonly media: 'text/csv' | 'application/zip';
  /** A column identifier the CSV header must carry, when the header is stable. */
  readonly column?: RegExp;
}

const REPORTS: readonly ReportCase[] = [
  {
    id: 'TC-00526',
    type: 'anonymized_student_ids',
    title: 'anonymized student IDs',
    media: 'text/csv',
    column: /id/i,
  },
  {
    id: 'TC-00527',
    type: 'enrolled_students',
    title: 'enrolled students',
    media: 'text/csv',
    column: /username/i,
  },
  {
    id: 'TC-00528',
    type: 'pending_enrollments',
    title: 'pending enrollments',
    media: 'text/csv',
    column: /email/i,
  },
  { id: 'TC-00531', type: 'grade', title: 'grades', media: 'text/csv', column: /username|email/i },
  {
    id: 'TC-00532',
    type: 'problem_grade',
    title: 'problem grades',
    media: 'text/csv',
    column: /username|email/i,
  },
  { id: 'TC-00533', type: 'ora2_summary', title: 'ORA summary', media: 'text/csv' },
  { id: 'TC-00534', type: 'ora2_data', title: 'ORA data', media: 'text/csv' },
  {
    id: 'TC-00535',
    type: 'ora2_submission_files',
    title: 'ORA submission files',
    media: 'application/zip',
  },
];

/**
 * The certificates group tab is only rendered where platform-wide certificate
 * generation is on, so this case is gated on `@certificates` and turns the
 * switch on itself (`platformCertificates`), rather than relying on an earlier
 * test of the run having done it.
 */
const CERTIFICATES_REPORT: ReportCase = {
  id: 'TC-00530',
  type: 'issued_certificates',
  title: 'issued certificates',
  media: 'text/csv',
};

/**
 * Generates `report` from its button, waits for the download to be listed, and
 * checks its media type, its CSV header (when known) and its row in the table.
 */
async function expectReportDownloaded(
  request: APIRequestContext,
  config: AppConfig,
  instructorDataDownloads: InstructorDataDownloadsPage,
  courseKey: string,
  report: ReportCase,
): Promise<void> {
  await instructorDataDownloads.gotoTab(courseKey);

  const before = await listReports(request, config, courseKey);
  const queued = await instructorDataDownloads.generate(report.type);
  expect(queued.status()).toBe(200);

  const outcome = await waitForReport(request, config, courseKey, report.type, before);
  expect(
    outcome.report,
    `no ${report.type} report within ${outcome.elapsedMs} ms; tasks: ${JSON.stringify(outcome.tasks)}; same type: ${JSON.stringify(outcome.sameType)}`,
  ).toBeDefined();
  const download = outcome.report as NonNullable<typeof outcome.report>;
  expect(download.report_type).toBe(report.type);

  const file = await downloadReport(request, config, download);
  expect(file.headers()['content-type']).toContain(report.media);
  if (report.column) expect(await csvHeader(file)).toMatch(report.column);

  // The table lists the new file (its name is the platform's, matched as a value).
  await instructorDataDownloads.gotoTab(courseKey);
  await expect(instructorDataDownloads.rowFor(download.report_name)).toBeVisible();
  await expect(instructorDataDownloads.downloadButtonFor(download.report_name)).toBeVisible();
}

test.describe(
  'Instructor dashboard data downloads',
  { tag: ['@regression', ...INSTRUCTOR_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    for (const report of REPORTS) {
      test(
        `generates and downloads the ${report.title} report`,
        { annotation: testId(report.id) },
        async ({ page, config, contentCourse, instructorDataDownloads, studioAuthorSession }) => {
          void studioAuthorSession;
          await expectReportDownloaded(
            page.request,
            config,
            instructorDataDownloads,
            contentCourse.courseKey,
            report,
          );
        },
      );
    }

    test(
      `generates and downloads the ${CERTIFICATES_REPORT.title} report`,
      { tag: '@certificates', annotation: testId(CERTIFICATES_REPORT.id) },
      async ({
        page,
        config,
        contentCourse,
        instructorDataDownloads,
        studioAuthorSession,
        platformCertificates,
      }) => {
        void studioAuthorSession;
        const courseKey = contentCourse.courseKey;
        await platformCertificates.ensureEnabled(courseKey);
        await expectReportDownloaded(
          page.request,
          config,
          instructorDataDownloads,
          courseKey,
          CERTIFICATES_REPORT,
        );
      },
    );

    test(
      'generates and downloads the problem responses report for a problem',
      { annotation: testId('TC-00529') },
      async ({
        page,
        config,
        contentCourse,
        instructorDataDownloads,
        gradedProblemWithWrongAnswer,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const courseKey = contentCourse.courseKey;
        const { problem, learner, section } = gradedProblemWithWrongAnswer;
        // The report reads the *collected* block structure, rebuilt on the
        // publish task's delay; queued before that lands, the task fails with
        // `UsageKeyNotInBlockStructure` and — with no task id to follow
        // (`INSTR-002`) — leaves no trace (`INSTR-007`). Wait until the learner's
        // Blocks API serves the unit, which comes from the same structure.
        const unitKey = section.units[0]?.usageKey ?? '';
        await expect
          .poll(async () => (await learner.outline()).units.some((unit) => unit.id === unitKey), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBe(true);
        await instructorDataDownloads.gotoTab(courseKey);

        const before = await listReports(page.request, config, courseKey);
        const queued = await instructorDataDownloads.generate('problem_responses', {
          problemLocation: problem.usageKey,
        });
        expect(queued.status()).toBe(200);
        const outcome = await waitForReport(
          page.request,
          config,
          courseKey,
          'problem_responses',
          before,
        );
        expect(
          outcome.report,
          `no problem_responses report within ${outcome.elapsedMs} ms; tasks: ${JSON.stringify(outcome.tasks)}; same type: ${JSON.stringify(outcome.sameType)}`,
        ).toBeDefined();

        const file = await downloadReport(
          page.request,
          config,
          outcome.report as NonNullable<typeof outcome.report>,
        );
        expect(file.headers()['content-type']).toContain('text/csv');
        // The learner who answered is a row of the export (their username is our data).
        expect(await file.text()).toContain(learner.identity.username);

        await checkA11y(page, {
          label: 'instructor-data-downloads',
          additionalBaseline: INSTRUCTOR_A11Y_BASELINE,
        });
      },
    );
  },
);
