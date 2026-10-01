import { checkA11y } from '../../../src/a11y';
import { A11Y_VIEWPORTS, viewportUse } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { SHELL_CHROME_A11Y_BASELINE } from '../chrome/helpers';

/**
 * The course About page (TC-00009–TC-00013): its share links, start date and
 * media, on the configured course (`COURSE_KEY`). The catalog MFE serves the
 * page wherever it is enabled; the LMS About route redirects there.
 *
 * Share links are asserted by where they point and never followed off-site.
 * The start date is compared with the course API's own start, formatted the
 * way the page formats dates, so the case holds in any site language.
 */
test.describe('Course About page', { tag: '@mfe-catalog' }, () => {
  test(
    'shares the course on Facebook',
    { tag: ['@regression', '@authenticated'], annotation: testId('TC-00009') },
    async ({ page, courseAboutPage, courseKey }) => {
      await courseAboutPage.gotoRendered(courseKey);
      const href = new URL((await courseAboutPage.shareFacebook.getAttribute('href')) ?? '');
      expect(href.searchParams.get('u')).toBe(page.url());
    },
  );

  test(
    'shares the course on Twitter',
    { tag: ['@regression', '@authenticated'], annotation: testId('TC-00010') },
    async ({ page, courseAboutPage, courseKey }) => {
      await courseAboutPage.gotoRendered(courseKey);
      const href = new URL((await courseAboutPage.shareTwitter.getAttribute('href')) ?? '');
      expect(href.searchParams.get('text')).toContain(page.url());
    },
  );

  test(
    'shares the course by e-mail',
    { tag: ['@regression', '@authenticated'], annotation: testId('TC-00011') },
    async ({ page, courseAboutPage, courseKey }) => {
      await courseAboutPage.gotoRendered(courseKey);
      const href = new URL((await courseAboutPage.shareEmail.getAttribute('href')) ?? '');
      expect(href.protocol).toBe('mailto:');
      expect(href.searchParams.get('subject')).toMatch(/\S/);
      expect(href.searchParams.get('body')).toContain(page.url());
    },
  );

  test(
    'shows when classes start',
    { tag: '@regression', annotation: testId('TC-00012') },
    async ({ courseAboutPage, courseKey, courseDetail }) => {
      expect(courseDetail.start, 'the course has a start date').not.toBeNull();
      await courseAboutPage.gotoRendered(courseKey);
      const expected = await courseAboutPage.formatShortDate(courseDetail.start!);
      await expect(courseAboutPage.detailsItemValues.filter({ hasText: expected })).toHaveCount(1);
    },
  );

  test(
    'shows the course image',
    { tag: '@regression', annotation: testId('TC-00013') },
    async ({ config, courseAboutPage, courseKey, courseDetail }) => {
      expect(courseDetail.courseImageUri, 'the course has an image').not.toBeNull();
      await courseAboutPage.gotoRendered(courseKey);
      await expect(courseAboutPage.mediaImage).toBeVisible();
      expect(await courseAboutPage.mediaImageLoaded()).toBe(true);
      const src = new URL((await courseAboutPage.mediaImage.getAttribute('src')) ?? '');
      expect(src.pathname).toBe(
        new URL(courseDetail.courseImageUri!, config.baseUrls.lms).pathname,
      );
    },
  );

  test(
    'plays the course intro video',
    { tag: ['@course-intro-video', '@regression'], annotation: testId('TC-00013') },
    async ({ courseAboutPage, courseKey, courseIntroVideoId }) => {
      await courseAboutPage.gotoRendered(courseKey);
      // The player embeds a third-party site: its address is the assertion, and
      // whether YouTube is reachable from the runner is not.
      expect(await courseAboutPage.openIntroVideo()).toContain(`/embed/${courseIntroVideoId}`);
    },
  );

  for (const viewport of A11Y_VIEWPORTS) {
    test.describe(`at ${viewport.name} width`, () => {
      test.use(viewportUse(viewport));

      test(
        'the About page meets WCAG 2.2 AA',
        { tag: '@regression' },
        async ({ page, courseAboutPage, courseKey }) => {
          await courseAboutPage.gotoRendered(courseKey);
          // DEMO-001: the demo course's overview has a colour-only link; BASE-003:
          // the shell's narrow-layout menu toggle is unnamed.
          await checkA11y(page, {
            label: `course-about-${viewport.name}`,
            additionalBaseline: ['link-in-text-block', ...SHELL_CHROME_A11Y_BASELINE],
          });
        },
      );
    });
  }
});
