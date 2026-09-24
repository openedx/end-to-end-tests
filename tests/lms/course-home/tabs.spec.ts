import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { fetchCourseMetadata, setCourseAppEnabled } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { AUTHORED_COURSE_HOME_TAGS } from './helpers';

/**
 * The course-home tabs (TC-00024): the tabs a learner is offered are the ones
 * the course metadata API lists for them, each linking where the API says, and
 * a tab the author turns on (the wiki) is added. Tab titles are localized, so
 * tabs are compared by `tab_id` and URL.
 */
test.describe('Course home tabs', { tag: ['@regression', ...AUTHORED_COURSE_HOME_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'offers the course, progress, dates and discussion tabs, linked as the API lists them',
    { tag: '@discussions', annotation: testId('TC-00024') },
    async ({ config, roundTripLearner }) => {
      const { request, courseKey, courseOutlinePage } = roundTripLearner;
      const metadata = await fetchCourseMetadata(request, config, courseKey);
      const tabIds = metadata.tabs.map((tab) => tab.tab_id);
      for (const expected of ['courseware', 'progress', 'dates', 'discussion']) {
        expect(tabIds).toContain(expected);
      }

      await courseOutlinePage.gotoHome(courseKey);
      await courseOutlinePage.dismissTourDialog();
      expect(await courseOutlinePage.tabUrls()).toEqual(
        metadata.tabs.map((tab) => new URL(tab.url, config.baseUrls.lms).toString()),
      );
    },
  );

  test(
    'adds the wiki tab once the author turns the wiki on',
    { tag: '@wiki', annotation: testId('TC-00024') },
    async ({ page, config, contentCourse, studioAuthorSession, roundTripLearner }) => {
      void studioAuthorSession;
      const { courseKey } = contentCourse;
      const { request, courseOutlinePage } = roundTripLearner;
      const wikiTab = async () =>
        (await fetchCourseMetadata(request, config, courseKey)).tabs.find(
          (tab) => tab.tab_id === 'wiki',
        );

      await setCourseAppEnabled(page.request, config, courseKey, 'wiki', true);
      try {
        await expect.poll(wikiTab, { timeout: TIMEOUTS.contentPublish }).toBeDefined();
        const tab = (await wikiTab())!;
        await courseOutlinePage.gotoHome(courseKey);
        await courseOutlinePage.dismissTourDialog();
        expect(await courseOutlinePage.tabUrls()).toContain(
          new URL(tab.url, config.baseUrls.lms).toString(),
        );
      } finally {
        await setCourseAppEnabled(page.request, config, courseKey, 'wiki', false);
      }
      await expect.poll(wikiTab, { timeout: TIMEOUTS.contentPublish }).toBeUndefined();
    },
  );
});
