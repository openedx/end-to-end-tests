import { checkA11y } from '../../../src/a11y';
import {
  courseExists,
  downloadCourseExport,
  startCourseExport,
  waitForCourseExport,
  waitForCourseImport,
} from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Course Import (authoring MFE), on the worker's own course.
 *
 * This is the one write path the epic left unverified: the MFE's chunked
 * multipart upload to `/import/<key>`. The test round-trips the worker course's
 * own export back into the same course, so it needs no second course and proves
 * the upload mechanism, not import fidelity (out of scope). The import-status API
 * decides success; the page performs the upload and shows the outcome.
 */
test.describe('Course Import', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  // Export **and** import each run on the CMS worker under `TIMEOUTS.courseTransfer`;
  // the default test budget is shorter than either waiter, so a busy worker
  // (search-index fan-out after every publish) failed the test before the
  // import task was even picked up.
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'imports an OLX tarball back into the course',
    { tag: '@regression', annotation: testId('TC-00309') },
    async ({ page, config, authoredCourse, importPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;

      // Produce a tarball to upload: the course's own export.
      await startCourseExport(api, config, courseKey);
      const { outputPath } = await waitForCourseExport(api, config, courseKey);
      const tarball = await downloadCourseExport(api, config, outputPath);

      // The import task is keyed on the uploaded filename; make it unique per run
      // and keep the `.tar.gz` the dropzone requires.
      const fileName = `e2e-reimport-${Date.now().toString(36)}.tar.gz`;
      await importPage.goto(courseKey);
      await importPage.uploadArchive(fileName, tarball);

      // The CMS worker unpacks it; the status API is the source of truth.
      await waitForCourseImport(api, config, courseKey, fileName);
      expect(await courseExists(api, config, courseKey)).toBe(true);

      // The page reflects the finished import: the "view outline" control appears.
      await expect(importPage.successButton).toBeVisible();

      // `STUDIO-007` (see `.private/findings.md`): the authoring MFE's Import
      // dropzone renders a hidden file `<input>` with no label, a critical
      // `label` violation in the MFE's own chrome. Tolerated on this screen only;
      // remove when STUDIO-007 lands upstream.
      await checkA11y(page, { label: 'studio-import', additionalBaseline: ['label'] });
    },
  );
});
