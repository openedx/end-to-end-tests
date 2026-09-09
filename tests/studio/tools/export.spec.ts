import { checkA11y } from '../../../src/a11y';
import { downloadCourseExport, waitForCourseExport } from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Course Export (authoring MFE), on the worker's own course.
 *
 * The MFE's button starts the export; the export-status API is the source of
 * truth for completion and the download path, and the streamed bytes prove a
 * real gzip tarball came back. The page only has to drive the button and, at the
 * end, offer the download.
 */
test.describe('Course Export', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  test(
    'exports the course content as an OLX tarball',
    { tag: '@regression', annotation: testId('TC-00308') },
    async ({ page, request, config, authoredCourse, exportPage, studioAuthorSession }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;

      await exportPage.goto(courseKey);
      expect((await exportPage.startExport(courseKey)).status).toBe(200);

      // The CMS worker builds the tarball asynchronously; the status API says when
      // it is ready and where to fetch it.
      const { outputPath } = await waitForCourseExport(request, config, courseKey);
      const tarball = await downloadCourseExport(request, config, outputPath);
      expect(tarball.length).toBeGreaterThan(0);
      // gzip magic bytes — the download is a real gzip stream, not an error page.
      expect([tarball[0], tarball[1]]).toEqual([0x1f, 0x8b]);

      // The page reflects the finished export: the download control is offered.
      await expect(exportPage.downloadLink).toHaveAttribute('href', /.+/);

      await checkA11y(page, { label: 'studio-export' });
    },
  );
});
