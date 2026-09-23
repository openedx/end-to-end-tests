import { expect, test } from '../../../src/fixtures';
import { fetchLearnerHome, type LearnerHome } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { anonymousHeaderExpectation, expectedUserMenu } from '../../../src/steps';

/**
 * The page header (TC-00019, TC-00020, TC-00021, TC-00023).
 *
 * What a header offers is configuration — a Help link exists iff `SUPPORT_URL`
 * is set, the catalog link iff discovery is on, Order History iff
 * `ORDER_HISTORY_URL` — so every case compares the rendered header with the
 * target's own chrome configuration (`chromeCase.read`), never with the sheet's
 * list of labels, which describes one provider's setup. The same assertions
 * hold whichever frontend rendered the header: the page objects read all three
 * generations, and the account menu's expected items follow the generation the
 * page rendered.
 */
test.describe('Site header', () => {
  test(
    'offers a signed-out visitor the catalog, sign-in and registration',
    { tag: ['@smoke', '@mfe-catalog'], annotation: testId('TC-00019') },
    async ({ page, siteHeader, publicChrome, loginPage }) => {
      const expected = anonymousHeaderExpectation(publicChrome.chrome);

      await expect(siteHeader.logoLink).toBeVisible();
      await expect(siteHeader.logoImage).toBeVisible();
      await expect(siteHeader.mainLinks).toHaveCount(expected.mainLinks);
      await expect(siteHeader.anonymousLinks).toHaveCount(expected.callsToAction);

      // The brand link leads a signed-out visitor to sign in.
      await siteHeader.follow(siteHeader.logoLink);
      await expect(loginPage.emailOrUsername).toBeVisible();
      await expect(page).toHaveURL(/\/login\b/);
    },
  );

  test.describe('for a signed-in learner', { tag: ['@regression', '@authenticated'] }, () => {
    test(
      'the dashboard header links the dashboard, the catalog and the account menu',
      { tag: '@mfe-learner-dashboard', annotation: testId('TC-00023') },
      async ({ page, request, config, siteHeader, chromeCase, dashboardPage, enrolledCourse }) => {
        const { username } = enrolledCourse.identity;
        await dashboardPage.goto();
        const { generation, chrome } = await chromeCase.read();

        // "Courses" marks the dashboard itself and leads there — directly, or
        // (the legacy dashboard's `href="/"`) through the site root's redirects;
        // the catalog link is there iff discovery is on, pointing where the
        // dashboard's own API says.
        await expect(siteHeader.activeMainLink).toHaveCount(1);
        const [active] = await siteHeader.hrefs(siteHeader.activeMainLink);
        const landed = await page.request.get(active!);
        expect(new URL(landed.url()).pathname.replace(/\/$/, '')).toBe(
          new URL(page.url()).pathname.replace(/\/$/, ''),
        );
        const home = (await fetchLearnerHome(request, config)) as LearnerHome;
        const catalog = new URL(home.platformSettings.courseSearchUrl).toString();
        expect((await siteHeader.hrefs(siteHeader.mainLinks)).includes(catalog)).toBe(
          chrome.courseDiscovery,
        );

        const menu = expectedUserMenu(generation, chrome, username);
        expect(await siteHeader.openUserMenu()).toEqual(menu);

        // The profile item opens this learner's profile.
        await siteHeader.followUserMenuItem(menu.find((url) => url.includes(`/u/${username}`))!);
        await expect(page).toHaveURL(new RegExp(`/u/${username}\\b`));

        // The logo leads back to the dashboard.
        await siteHeader.follow(siteHeader.logoLink);
        await expect(dashboardPage.content).toBeVisible();
      },
    );

    test(
      'the course home header links the dashboard and the account menu, and signs out',
      { tag: '@mfe-learning', annotation: testId('TC-00020') },
      async ({ page, siteHeader, chromeCase, courseOutlinePage, enrolledCourse }) => {
        const { courseKey, identity } = enrolledCourse;
        await courseOutlinePage.goto(courseKey);
        await courseOutlinePage.dismissTourDialog();
        const { generation, chrome } = await chromeCase.read();

        const menu = expectedUserMenu(generation, chrome, identity.username);
        expect(await siteHeader.openUserMenu()).toEqual(menu);

        // Sign out is the menu's last item; it ends the session.
        await siteHeader.followUserMenuItem(menu.at(-1)!);
        expect((await page.request.get(`${chrome.lmsBaseUrl}/api/user/v1/me`)).status()).toBe(401);
      },
    );

    test(
      'the in-course header names the course and links the account menu',
      { tag: '@mfe-learning', annotation: testId('TC-00021') },
      async ({
        siteHeader,
        chromeCase,
        unitPage,
        dashboardPage,
        courseOutline,
        courseDetail,
        enrolledCourse,
      }) => {
        const { courseKey, identity } = enrolledCourse;
        const unit = courseOutline.units[0]!;
        await unitPage.goto(courseKey, unit.sequentialId, unit.id);
        const { generation, chrome } = await chromeCase.read();

        // The course lockup shows the course's own organization, number and name.
        await expect(siteHeader.courseLockup).toContainText(courseDetail.org);
        await expect(siteHeader.courseLockup).toContainText(courseDetail.number);
        await expect(siteHeader.courseLockup).toContainText(courseDetail.name);

        expect(await siteHeader.openUserMenu()).toEqual(
          expectedUserMenu(generation, chrome, identity.username),
        );
        await siteHeader.userMenuTrigger.press('Escape');

        await siteHeader.follow(siteHeader.logoLink);
        await expect(dashboardPage.content).toBeVisible();
      },
    );
  });
});

/**
 * The Help link (TC-00020, TC-00021, TC-00023): present and pointing at
 * `SUPPORT_URL` where the target configures one, absent where it does not.
 * Each half runs only where the target's configuration makes it the case in
 * point (`chromeCase.requireSupportUrl`).
 */
test.describe('Site header Help link', { tag: ['@regression', '@authenticated'] }, () => {
  test(
    'points at SUPPORT_URL on the dashboard',
    { tag: '@mfe-learner-dashboard', annotation: testId('TC-00023') },
    async ({ siteHeader, chromeCase, dashboardPage }) => {
      await dashboardPage.goto();
      const { chrome } = await chromeCase.read();
      chromeCase.requireSupportUrl(chrome, true);
      expect(await siteHeader.hrefs(siteHeader.helpLink)).toEqual([
        new URL(chrome.supportUrl!).toString(),
      ]);
    },
  );

  test(
    'is absent without SUPPORT_URL on the dashboard',
    { tag: '@mfe-learner-dashboard', annotation: testId('TC-00023') },
    async ({ siteHeader, chromeCase, dashboardPage }) => {
      await dashboardPage.goto();
      const { generation, chrome } = await chromeCase.read();
      chromeCase.requireSupportUrl(chrome, false);
      chromeCase.expectKnownDefects({
        generations: [generation],
        signedIn: true,
        scenario: 'no-help-link',
      });
      await expect(siteHeader.helpLink).toHaveCount(0);
    },
  );

  test(
    'points at SUPPORT_URL on the course home',
    { tag: '@mfe-learning', annotation: testId('TC-00020') },
    async ({ siteHeader, chromeCase, courseOutlinePage, enrolledCourse }) => {
      await courseOutlinePage.goto(enrolledCourse.courseKey);
      await courseOutlinePage.dismissTourDialog();
      const { chrome } = await chromeCase.read();
      chromeCase.requireSupportUrl(chrome, true);
      expect(await siteHeader.hrefs(siteHeader.helpLink)).toEqual([
        new URL(chrome.supportUrl!).toString(),
      ]);
    },
  );

  test(
    'is absent without SUPPORT_URL on the course home',
    { tag: '@mfe-learning', annotation: testId('TC-00020') },
    async ({ siteHeader, chromeCase, courseOutlinePage, enrolledCourse }) => {
      await courseOutlinePage.goto(enrolledCourse.courseKey);
      await courseOutlinePage.dismissTourDialog();
      const { generation, chrome } = await chromeCase.read();
      chromeCase.requireSupportUrl(chrome, false);
      chromeCase.expectKnownDefects({
        generations: [generation],
        signedIn: true,
        scenario: 'no-help-link',
      });
      await expect(siteHeader.helpLink).toHaveCount(0);
    },
  );

  test(
    'points at SUPPORT_URL on the in-course page',
    { tag: '@mfe-learning', annotation: testId('TC-00021') },
    async ({ siteHeader, chromeCase, unitPage, courseOutline, enrolledCourse }) => {
      const unit = courseOutline.units[0]!;
      await unitPage.goto(enrolledCourse.courseKey, unit.sequentialId, unit.id);
      const { chrome } = await chromeCase.read();
      chromeCase.requireSupportUrl(chrome, true);
      expect(await siteHeader.hrefs(siteHeader.helpLink)).toEqual([
        new URL(chrome.supportUrl!).toString(),
      ]);
    },
  );

  test(
    'is absent without SUPPORT_URL on the in-course page',
    { tag: '@mfe-learning', annotation: testId('TC-00021') },
    async ({ siteHeader, chromeCase, unitPage, courseOutline, enrolledCourse }) => {
      const unit = courseOutline.units[0]!;
      await unitPage.goto(enrolledCourse.courseKey, unit.sequentialId, unit.id);
      const { generation, chrome } = await chromeCase.read();
      chromeCase.requireSupportUrl(chrome, false);
      chromeCase.expectKnownDefects({
        generations: [generation],
        signedIn: true,
        scenario: 'no-help-link',
      });
      await expect(siteHeader.helpLink).toHaveCount(0);
    },
  );
});
