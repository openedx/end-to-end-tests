import { test, expect } from '@playwright/test';

import { chromeConfigFromMfeConfig, chromeConfigFromSiteConfig } from '../../src/api';

/**
 * Unit coverage for the narrowing behind the header and footer specs: one
 * `ChromeConfig`, whether a page's chrome was built by a legacy MFE (the flat
 * `mfe_config` keys) or by the frontend-base shell (`frontend_site_config`,
 * shapes as measured on a Tutor `main` stack).
 */
test.describe('chrome config narrowing', { tag: '@unit' }, () => {
  test('reads a legacy MFE config, treating unset URLs as absent', () => {
    const chrome = chromeConfigFromMfeConfig({
      SITE_NAME: 'My Open edX',
      ACCOUNT_SETTINGS_URL: 'http://apps.local.openedx.io/account/',
      ACCOUNT_PROFILE_URL: 'http://apps.local.openedx.io/profile/',
      LOGOUT_URL: 'http://local.openedx.io/logout',
      SUPPORT_URL: '',
      ORDER_HISTORY_URL: 'null',
      ENABLE_COURSE_DISCOVERY: true,
      NON_BROWSABLE_COURSES: 'false',
    });
    expect(chrome).toMatchObject({
      siteName: 'My Open edX',
      accountSettingsUrl: 'http://apps.local.openedx.io/account/',
      supportUrl: undefined,
      orderHistoryUrl: undefined,
      enablePrograms: false,
      courseDiscovery: true,
    });
  });

  test('turns the catalog link off for non-browsable courses', () => {
    const chrome = chromeConfigFromMfeConfig({
      ENABLE_COURSE_DISCOVERY: 'true',
      NON_BROWSABLE_COURSES: true,
    });
    expect(chrome.courseDiscovery).toBe(false);
  });

  test("reads the shell's site config: routes and top-level values over the common keys, the app's own config over both", () => {
    const raw = {
      siteName: 'Shell Site',
      lmsBaseUrl: 'http://local.openedx.io',
      logoutUrl: 'http://local.openedx.io/logout',
      externalRoutes: [
        { role: 'org.openedx.frontend.role.account', url: 'http://apps.local.openedx.io/account/' },
        { role: 'org.openedx.frontend.role.profile', url: 'http://apps.local.openedx.io/profile/' },
      ],
      commonAppConfig: {
        SITE_NAME: 'ignored',
        ACCOUNT_SETTINGS_URL: 'http://legacy/account',
        ENABLE_COURSE_DISCOVERY: true,
        PASSWORD_RESET_SUPPORT_LINK: 'mailto:contact@local.openedx.io',
      },
      apps: [
        {
          appId: 'org.openedx.frontend.app.instructorDashboard',
          config: { SUPPORT_URL: 'https://docs.openedx.org/' },
        },
      ],
    };

    const dashboard = chromeConfigFromSiteConfig(raw, 'org.openedx.frontend.app.learnerDashboard');
    expect(dashboard).toMatchObject({
      siteName: 'Shell Site',
      accountSettingsUrl: 'http://apps.local.openedx.io/account/',
      accountProfileUrl: 'http://apps.local.openedx.io/profile/',
      supportUrl: undefined,
      courseDiscovery: true,
      passwordResetSupportLink: 'mailto:contact@local.openedx.io',
    });

    const instructor = chromeConfigFromSiteConfig(
      raw,
      'org.openedx.frontend.app.instructorDashboard',
    );
    expect(instructor.supportUrl).toBe('https://docs.openedx.org/');
  });

  test('tolerates a site config with nothing but the common keys', () => {
    const chrome = chromeConfigFromSiteConfig({ commonAppConfig: { SITE_NAME: 'Only Common' } });
    expect(chrome.siteName).toBe('Only Common');
    expect(chrome.accountSettingsUrl).toBeUndefined();
  });
});
