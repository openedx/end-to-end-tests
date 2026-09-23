import { randomUUID } from 'node:crypto';

import { checkA11y } from '../../../src/a11y';
import { A11Y_VIEWPORTS, viewportUse } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { fetchAccount, updateAccount, updatePreferences } from '../../../src/api';
import { issue, testId } from '../../../src/reporting';
import { partitionSiteLinks } from '../../../src/steps';
import { PROFILE_A11Y_BASELINE } from './helpers';

/**
 * The learner profile (TC-00068–TC-00072): a learner adds their location,
 * language, education, bio and social links on their profile page, and each is
 * read back through the accounts API. Where the case is about who can see a
 * field, a second learner's reading of the account decides — the owner always
 * sees everything.
 *
 * Every case starts from `profileLearner`, whose adult year of birth lets the
 * profile be shared at all (without one the platform keeps it private).
 */
test.describe('Learner profile', { tag: ['@regression', '@authenticated', '@mfe-profile'] }, () => {
  test(
    'adds a location from the profile',
    {
      annotation: [
        testId('TC-00068'),
        issue('https://github.com/openedx/wg-build-test-release/issues/575'),
      ],
    },
    async ({ request, config, profilePage, profileLearner }) => {
      // PROF-003 / wg#575: the profile builds its country list from the
      // registration form, which lists no country field by default.
      test.fail(true, 'PROF-003: the profile offers no country to choose (wg#575)');
      const { username } = profileLearner.identity;
      await profilePage.goto(username);
      await profilePage.openEmpty('country');
      const [country] = await profilePage.options('country');
      expect(country, 'the profile offers a country').toBeDefined();
      await profilePage.control('country').selectOption(country!);
      expect((await profilePage.save('country')).ok()).toBe(true);
      expect((await fetchAccount(request, config, username)).country).toBe(country);
    },
  );

  test(
    'shares the location with other learners only while it is visible to them',
    { annotation: testId('TC-00068') },
    async ({ request, config, profileLearner, profileViewer }) => {
      const { username } = profileLearner.identity;
      await updateAccount(request, config, username, { country: 'FR' });

      await updatePreferences(request, config, username, {
        account_privacy: 'custom',
        'visibility.country': 'all_users',
      });
      expect((await fetchAccount(profileViewer.request, config, username)).country).toBe('FR');

      await updatePreferences(request, config, username, { 'visibility.country': 'private' });
      expect(await fetchAccount(profileViewer.request, config, username)).not.toHaveProperty(
        'country',
      );
    },
  );

  test(
    'adds a language',
    { annotation: testId('TC-00069') },
    async ({ request, config, profilePage, profileLearner }) => {
      const { username } = profileLearner.identity;
      await profilePage.goto(username);
      await profilePage.openEmpty('languageProficiencies');
      const [language] = await profilePage.options('languageProficiencies');
      expect(language, 'the profile offers a language').toBeDefined();
      await profilePage.control('languageProficiencies').selectOption(language!);
      expect((await profilePage.save('languageProficiencies')).ok()).toBe(true);
      expect((await fetchAccount(request, config, username)).language_proficiencies).toEqual([
        { code: language },
      ]);
    },
  );

  test(
    'adds a bio and the three social links, visible to other learners',
    { annotation: testId('TC-00070') },
    async ({ request, config, profilePage, profileLearner, profileViewer }) => {
      const { username } = profileLearner.identity;
      const bio = `E2E bio ${randomUUID().slice(0, 8)}`;
      const handle = `e2e${randomUUID().slice(0, 8)}`;
      await profilePage.goto(username);

      await profilePage.openEmpty('bio');
      await profilePage.control('bio').fill(bio);
      expect((await profilePage.save('bio')).ok()).toBe(true);

      for (const field of ['social-x', 'social-facebook', 'social-linkedin'] as const) {
        await profilePage.openEmpty(field);
        await profilePage.control(field).fill(handle);
        expect((await profilePage.save(field)).ok()).toBe(true);
      }

      const account = await fetchAccount(request, config, username);
      expect(account.bio).toBe(bio);
      expect(
        Object.fromEntries(
          (account.social_links ?? []).map((link) => [link.platform, link.social_link]),
        ),
      ).toEqual({
        x: expect.stringContaining(handle),
        facebook: expect.stringContaining(handle),
        linkedin: expect.stringContaining(handle),
      });

      // Visible to everyone by default: another learner reads both. (One
      // visibility covers all three links — the sheet's comment on this case.)
      const seen = await fetchAccount(profileViewer.request, config, username);
      expect(seen.bio).toBe(bio);
      expect(seen.social_links).toHaveLength(3);
    },
  );

  test(
    'links the dashboard from the header and the site from the footer logo',
    { annotation: testId('TC-00071') },
    async ({
      page,
      request,
      config,
      profilePage,
      siteHeader,
      siteFooter,
      dashboardPage,
      profileLearner,
    }) => {
      await profilePage.goto(profileLearner.identity.username);

      // The footer logo shows and its link works (fetched when on the install,
      // checked as well formed when off-site).
      await expect(siteFooter.poweredByLink).toBeVisible();
      expect(await siteFooter.imageLoaded(siteFooter.poweredByLink)).toBe(true);
      const [logoTarget] = await siteFooter.hrefs(siteFooter.poweredByLink);
      const { onSite } = partitionSiteLinks([logoTarget!], config);
      for (const url of onSite) {
        expect((await request.get(url)).status(), url).toBeLessThan(400);
      }

      // The header's Courses link leads to the learner's dashboard.
      await expect(siteHeader.mainLinks.first()).toBeVisible();
      await siteHeader.follow(siteHeader.mainLinks.first());
      await expect(dashboardPage.content).toBeVisible();
      void page;
    },
  );

  test(
    'adds a level of education',
    { annotation: testId('TC-00072') },
    async ({ request, config, profilePage, profileLearner }) => {
      const { username } = profileLearner.identity;
      await profilePage.goto(username);
      await profilePage.openEmpty('levelOfEducation');
      const [level] = await profilePage.options('levelOfEducation');
      expect(level, 'the profile offers a level of education').toBeDefined();
      await profilePage.control('levelOfEducation').selectOption(level!);
      expect((await profilePage.save('levelOfEducation')).ok()).toBe(true);
      expect((await fetchAccount(request, config, username)).level_of_education).toBe(level);
    },
  );

  for (const viewport of A11Y_VIEWPORTS) {
    test.describe(`at ${viewport.name} width`, () => {
      test.use(viewportUse(viewport));

      test('the profile meets WCAG 2.2 AA', async ({ page, profilePage, profileLearner }) => {
        await profilePage.goto(profileLearner.identity.username);
        await checkA11y(page, {
          label: `profile-${viewport.name}`,
          additionalBaseline: PROFILE_A11Y_BASELINE,
        });
      });
    });
  }
});
