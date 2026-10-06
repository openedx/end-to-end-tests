import type { Page } from '@playwright/test';

import { SUPERSET_SELECTORS, TIMEOUTS } from '../../config';

/**
 * Superset's sign-in through the LMS (Aspects' `openedxsso` OAuth provider): the
 * login page's provider link, the LMS's authorization, and the way back.
 *
 * Whether Superset let the user in is not this page's to say: it signs a refused
 * user out again and lands them back on `/login/`. The step that drives it reads
 * the account Superset now holds (`/api/v1/me/roles/`).
 */
export class SupersetSignInPage {
  constructor(
    private readonly page: Page,
    private readonly origin: string,
  ) {}

  private onLoginPage(): boolean {
    const url = new URL(this.page.url());
    return url.origin === this.origin && url.pathname.startsWith('/login');
  }

  /**
   * Runs the SSO from wherever the page is (Superset's own URL, the page the
   * Reports tab's link opened): nothing to do when a Superset session is already
   * held. On the LMS's consent page, which a user sees on their first sign-in,
   * the authorization is accepted. Resolves once the page is back on Superset.
   */
  async signIn(): Promise<void> {
    if (!this.page.url().startsWith(this.origin)) {
      await this.page.goto(`${this.origin}/login/`);
    }
    await this.page.waitForLoadState('domcontentloaded');
    if (!this.onLoginPage()) return;

    // The provider link leads to the LMS's authorization. A user who has
    // authorized Superset before is sent straight back (a redirect); a first-time
    // user stops on the consent page, which loads at the authorize URL.
    const backOnSuperset = (url: URL) =>
      url.origin === this.origin &&
      !url.pathname.startsWith('/oauth-authorized') &&
      !url.pathname.startsWith('/login/openedxsso');
    await Promise.all([
      this.page.waitForURL(
        (url) => backOnSuperset(url) || url.pathname.startsWith('/oauth2/authorize'),
        { timeout: TIMEOUTS.navigation },
      ),
      this.page.locator(SUPERSET_SELECTORS.ssoProviderLink).first().click(),
    ]);
    if (!backOnSuperset(new URL(this.page.url()))) {
      await Promise.all([
        this.page.waitForURL(backOnSuperset, { timeout: TIMEOUTS.navigation }),
        this.page.locator(SUPERSET_SELECTORS.lmsOAuthAllow).click(),
      ]);
    }
    await this.page.waitForLoadState('domcontentloaded');
  }
}
