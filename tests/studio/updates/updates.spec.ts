import { fetchCourseUpdates, fetchHandouts } from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Course updates and handouts (BTR TC-00245–00247): posting a dated update,
 * editing the handouts and the editor's formatting. The UI drives the inline
 * TinyMCE; the Studio updates and handouts APIs decide the saved HTML.
 *
 * Gated on `@studio @author @mfe-authoring`.
 */
test.describe(
  'Course updates',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'posts a new update',
      { annotation: testId('TC-00245') },
      async ({ page, config, authoringCourse, updatesPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const key = authoringCourse.courseKey;
        const text = `E2E update ${test.info().testId.slice(-6)}`;
        await updatesPage.goto(key);
        await updatesPage.newUpdate(text);

        await expect
          .poll(() =>
            fetchCourseUpdates(page.request, config, key).then((u) => u.map((x) => x.content)),
          )
          .toEqual(expect.arrayContaining([expect.stringContaining(text)]));
      },
    );

    test(
      'edits the course handouts',
      { annotation: testId('TC-00246') },
      async ({ page, config, authoringCourse, updatesPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const key = authoringCourse.courseKey;
        const text = `E2E handout ${test.info().testId.slice(-6)}`;
        await updatesPage.goto(key);
        await updatesPage.editHandouts(text);

        await expect.poll(() => fetchHandouts(page.request, config, key)).toContain(text);
      },
    );

    test(
      'applies formatting from the editor',
      { annotation: testId('TC-00247') },
      async ({ page, config, authoringCourse, updatesPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const key = authoringCourse.courseKey;
        const text = `E2E bold ${test.info().testId.slice(-6)}`;
        await updatesPage.goto(key);
        await updatesPage.newBoldUpdate(text);

        const contents = (await fetchCourseUpdates(page.request, config, key)).map(
          (u) => u.content,
        );
        const ours = contents.find((c) => c.includes(text));
        expect(ours).toBeDefined();
        expect(ours ?? '').toMatch(/<(strong|b)>/i);
      },
    );
  },
);
