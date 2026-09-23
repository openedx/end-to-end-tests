import { expect, test } from '../../../src/fixtures';
import { fetchPreferences } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Switching the site language (TC-00066). The platform stores the choice as
 * the learner's `pref-lang` preference and serves pages in it; both are read
 * back after the UI makes the switch. Which language to switch to is taken
 * from what the page itself offers, never from a list in the suite.
 *
 * Account Settings' Site language is on every release; the frontend-base
 * shell's own language menu is only in the shell (`@frontend-base`). Every
 * page served afterwards should declare the language in `<html lang>` (WCAG
 * 3.1.1); pages rendered by frontend-platform MFEs do not (`FP-001`), and
 * `chromeCase` marks that test an expected failure wherever one is read.
 *
 * Readings go through the **browser's** request context (`page.request`): the
 * LMS copies the language cookie a request carries into `pref-lang`, so a
 * separate context still holding the old cookie would reset the preference it
 * reads.
 */
test.describe('Site language', { tag: ['@regression', '@authenticated'] }, () => {
  test(
    'switches from Account Settings',
    { tag: '@mfe-account', annotation: testId('TC-00066') },
    async ({ page, config, accountSettingsPage, dashboardPage, chromeCase, courseLearner }) => {
      const { username } = courseLearner.identity;
      await accountSettingsPage.goto();
      const { chrome } = await chromeCase.read();
      const { current, offered } = await accountSettingsPage.editSiteLanguage();
      const target = offered.find((code) => code !== current);
      expect(target, 'the site offers a second language').toBeDefined();

      await accountSettingsPage.saveSiteLanguage(target!);

      expect((await fetchPreferences(page.request, config, username))['pref-lang']).toBe(target);
      // The session now carries the language, and the LMS serves the next page
      // in it. Its `Content-Language` is the reading every release shares: the
      // legacy MFEs switch `dir` but leave `<html lang>` as built.
      await expect
        .poll(
          async () =>
            (await page.context().cookies()).find((c) => c.name === chrome.languageCookieName)
              ?.value,
        )
        .toBe(target);
      const next = await page.request.get(dashboardPage.url, { maxRedirects: 0 });
      expect(next.headers()['content-language']).toMatch(
        new RegExp(`^${target!.split('-')[0]}`, 'i'),
      );
    },
  );

  test(
    'every page served after the switch declares the language',
    {
      tag: ['@mfe-account', '@mfe-learner-dashboard', '@mfe-profile'],
      annotation: testId('TC-00066'),
    },
    async ({
      page,
      siteHeader,
      accountSettingsPage,
      dashboardPage,
      profilePage,
      chromeCase,
      courseLearner,
    }) => {
      const { username } = courseLearner.identity;
      await accountSettingsPage.goto();
      const { current, offered } = await accountSettingsPage.editSiteLanguage();
      const target = offered.find((code) => code !== current);
      expect(target, 'the site offers a second language').toBeDefined();
      await accountSettingsPage.saveSiteLanguage(target!);

      const readings = [];
      for (const [name, open] of [
        ['dashboard', () => dashboardPage.goto()],
        ['account', () => accountSettingsPage.goto()],
        ['profile', () => profilePage.goto(username)],
      ] as const) {
        await open();
        readings.push({
          page: name,
          generation: await siteHeader.generation(),
          lang: await page.locator('html').getAttribute('lang'),
        });
      }
      chromeCase.expectKnownDefects({
        generations: readings.map((reading) => reading.generation),
        signedIn: true,
        scenario: 'page-language',
      });
      const language = new RegExp(`^${target!.split('-')[0]}(-|$)`, 'i');
      expect(
        readings.filter((reading) => !language.test(reading.lang ?? '')),
        JSON.stringify(readings),
      ).toEqual([]);
    },
  );

  test(
    "switches from the shell's language menu",
    { tag: ['@frontend-base', '@mfe-learner-dashboard'], annotation: testId('TC-00066') },
    async ({ page, config, dashboardPage, siteFooter, courseLearner }) => {
      const { username } = courseLearner.identity;
      await dashboardPage.goto();
      const before = (await fetchPreferences(page.request, config, username))['pref-lang'];

      const chosen = await siteFooter.chooseAnotherLanguage(config.baseUrls.lms);

      expect(chosen).not.toBe(before);
      expect((await fetchPreferences(page.request, config, username))['pref-lang']).toBe(chosen);
      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        new RegExp(`^${chosen.split('-')[0]}`, 'i'),
      );
    },
  );
});
