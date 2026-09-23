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
 * shell's own language menu is only in the shell (`@frontend-base`).
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
      // The session now carries the language, and the next page is served in it.
      await expect
        .poll(
          async () =>
            (await page.context().cookies()).find((c) => c.name === chrome.languageCookieName)
              ?.value,
        )
        .toBe(target);
      await dashboardPage.goto();
      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        new RegExp(`^${target!.split('-')[0]}`, 'i'),
      );
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
