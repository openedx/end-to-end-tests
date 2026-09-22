import type { Page } from '@playwright/test';

import { fetchCourseMetadata, fetchTextbooks } from '../../../src/api';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import { checkA11y } from '../../../src/a11y';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Course PDF textbooks (BTR TC-00242–00244): add a textbook with a chapter,
 * delete a chapter, delete the textbook. The UI drives the form and cards; the
 * textbooks API and the course's tab list (a textbook adds a tab titled after
 * it) decide the outcome. Reads use the author's session (staff sees the tab).
 *
 * Gated on `@studio @author @mfe-authoring`.
 */
const CHAPTER_URL = '/static/e2e-textbook.pdf';

/** The course tab titles the LMS reports for a course. */
async function tabTitles(page: Page, config: AppConfig, courseKey: string): Promise<string[]> {
  return (await fetchCourseMetadata(page.request, config, courseKey)).tabs.map((t) => t.title);
}

test.describe(
  'Course textbooks',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'adds a textbook with a chapter',
      { annotation: testId('TC-00242') },
      async ({ page, config, authoringCourse, textbooksPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const key = authoringCourse.courseKey;
        const title = `E2E Textbook ${test.info().testId.slice(-6)}`;
        await textbooksPage.goto(key);
        await textbooksPage.addTextbook({
          tabTitle: title,
          chapterTitle: 'E2E Chapter One',
          chapterUrl: CHAPTER_URL,
        });

        const books = await fetchTextbooks(page.request, config, key);
        expect(books.map((b) => b.tab_title)).toContain(title);
        expect(books[0]?.chapters).toHaveLength(1);

        // The course gains a tab titled after the textbook.
        await expect.poll(() => tabTitles(page, config, key)).toContain(title);

        // `STUDIO-010`: the Textbooks page nests a non-`<li>` child in a list,
        // and on releases before `main` the textbook card's three icon-only
        // actions carry no accessible name. Both are baselined on this scan
        // only, so every other rule still gates here and these two still gate
        // every other page. The `button-name` entry comes out once the oldest
        // supported release has the labelled card actions `main` already ships.
        await checkA11y(page, {
          label: 'studio-textbooks',
          additionalBaseline: ['list', 'button-name'],
        });
      },
    );

    test(
      'deletes a chapter from a textbook',
      { annotation: testId('TC-00243') },
      async ({ page, config, authoringCourse, textbooksPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const key = authoringCourse.courseKey;
        const title = `E2E Textbook ${test.info().testId.slice(-6)}`;
        await textbooksPage.goto(key);
        await textbooksPage.addTextbook({
          tabTitle: title,
          chapterTitle: 'E2E Chapter One',
          chapterUrl: CHAPTER_URL,
        });
        await textbooksPage.addChapter('E2E Chapter Two', '/static/e2e-textbook-2.pdf');
        await expect
          .poll(async () => (await fetchTextbooks(page.request, config, key))[0]?.chapters.length)
          .toBe(2);

        await textbooksPage.deleteLastChapter();
        await expect
          .poll(async () => (await fetchTextbooks(page.request, config, key))[0]?.chapters.length)
          .toBe(1);
      },
    );

    test(
      'deletes a textbook',
      { annotation: testId('TC-00244') },
      async ({ page, config, authoringCourse, textbooksPage, studioAuthorSession }) => {
        void studioAuthorSession;
        const key = authoringCourse.courseKey;
        const title = `E2E Textbook ${test.info().testId.slice(-6)}`;
        await textbooksPage.goto(key);
        await textbooksPage.addTextbook({
          tabTitle: title,
          chapterTitle: 'E2E Chapter One',
          chapterUrl: CHAPTER_URL,
        });
        await expect.poll(() => tabTitles(page, config, key)).toContain(title);

        await textbooksPage.deleteTextbook();
        await expect
          .poll(() =>
            fetchTextbooks(page.request, config, key).then((b) => b.map((x) => x.tab_title)),
          )
          .not.toContain(title);
        await expect.poll(() => tabTitles(page, config, key)).not.toContain(title);
      },
    );
  },
);
