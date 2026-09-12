import { checkA11y } from '../../../src/a11y';
import {
  createCustomPage,
  deleteCustomPage,
  fetchCourseMetadata,
  fetchCustomPages,
  setCustomPageName,
} from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Custom Pages (authoring MFE), on the worker's own course.
 *
 * The drag-reorder is the thing under test; the pages are seeded and cleaned up
 * through the tabs API (creating one is not what TC-00237 covers). Two pages are
 * given distinct names so their order can be read the same way from Studio's tabs
 * API and from the LMS course-home tabs. The card at index 0 is dragged past its
 * neighbour with the keyboard sensor, and both APIs must show the new order.
 */
test.describe('Custom Pages', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  const NAME_A = 'E2E Custom Page A';
  const NAME_B = 'E2E Custom Page B';

  test(
    'reorders custom pages by drag and drop',
    { tag: '@regression', annotation: testId('TC-00237') },
    async ({ page, config, authoredCourse, customPagesPage, studioAuthorSession }) => {
      void studioAuthorSession;
      const { courseKey } = authoredCourse;

      // Drive the API off the browser context's own session (`page.request`): the
      // page-creation writes are legacy session-auth (no JWT fallback), and
      // `studioAuthorSession`'s cms-sso handshake ends the author's other Studio
      // session under `PREVENT_CONCURRENT_LOGINS` — a standalone `request` fixture's.
      // See `tests/studio/home/course-lifecycle.spec.ts` and the
      // `studio-browser-session-decays` findings.
      const api = page.request;

      // Clean slate, then two named pages in a known order [A, B].
      const existing = await fetchCustomPages(api, config, courseKey);
      await Promise.all(existing.map((p) => deleteCustomPage(api, config, p.id)));
      const idA = await createCustomPage(api, config, courseKey);
      await setCustomPageName(api, config, idA, NAME_A);
      const idB = await createCustomPage(api, config, courseKey);
      await setCustomPageName(api, config, idB, NAME_B);

      const apiOrder = async () =>
        (await fetchCustomPages(api, config, courseKey)).map((p) => p.name);
      const lmsOrder = async () =>
        (await fetchCourseMetadata(api, config, courseKey)).tabs
          .filter((tab) => tab.tab_id.startsWith('static_tab'))
          .map((tab) => tab.title);

      try {
        expect(await apiOrder()).toEqual([NAME_A, NAME_B]);

        await customPagesPage.goto(courseKey);
        expect(await customPagesPage.titles()).toEqual([NAME_A, NAME_B]);

        // Drag the first card past the second: the order flips to [B, A].
        await customPagesPage.dragCardDown(courseKey, 0);

        await expect.poll(apiOrder).toEqual([NAME_B, NAME_A]);
        // The learner-facing course-home tabs show the same order.
        await expect.poll(lmsOrder).toEqual([NAME_B, NAME_A]);

        // `STUDIO-008` (see `.private/findings.md`): the authoring MFE renders the
        // draggable custom-page list as a `<ul>` whose direct children are the
        // sortable `<div>`s, a serious `list` violation in the MFE's own markup.
        // Tolerated on this screen only; remove when STUDIO-008 lands upstream.
        await checkA11y(page, { label: 'studio-custom-pages', additionalBaseline: ['list'] });
      } finally {
        const remaining = await fetchCustomPages(api, config, courseKey);
        await Promise.all(
          remaining.map((p) => deleteCustomPage(api, config, p.id).catch(() => {})),
        );
      }
    },
  );
});
