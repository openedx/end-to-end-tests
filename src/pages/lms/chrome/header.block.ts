import type { Locator, Page } from '@playwright/test';

import { CHROME_SELECTORS, TIMEOUTS } from '../../../config';

/**
 * Which frontend rendered a page's chrome — see `CHROME_SELECTORS`. Detected
 * from the page, never assumed from its app: the frontend-base conversion moves
 * apps from `legacy` to `shell` release by release.
 */
export type ChromeGeneration = 'shell' | 'legacy' | 'learning';

/**
 * The page header, over all three header generations: one set of locators, a
 * union per anchor, reading whichever header the page rendered. Locators and
 * readings only — specs own the assertions.
 */
export class HeaderBlock {
  readonly root: Locator;
  readonly logoLink: Locator;
  readonly logoImage: Locator;
  readonly mainLinks: Locator;
  readonly anonymousLinks: Locator;
  /** The signed-out "Sign in" / "Login" link, told apart from "Register" by its route. */
  readonly signInLink: Locator;
  /** The signed-out "Register for free" / "Sign Up" link. */
  readonly registerLink: Locator;
  readonly activeMainLink: Locator;
  readonly userMenuTrigger: Locator;
  readonly userMenuItems: Locator;
  readonly helpLink: Locator;
  readonly courseLockup: Locator;
  readonly menuToggle: Locator;
  readonly menuPanel: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator(CHROME_SELECTORS.header).first();
    this.logoLink = this.root.locator(CHROME_SELECTORS.headerLogoLink).first();
    this.logoImage = this.logoLink.locator('img');
    this.mainLinks = this.root.locator(CHROME_SELECTORS.headerMainLink);
    this.anonymousLinks = this.root.locator(CHROME_SELECTORS.headerAnonymousLink);
    this.signInLink = this.anonymousLinks.and(page.locator('a[href*="login"]')).first();
    this.registerLink = this.anonymousLinks.and(page.locator('a[href*="register"]')).first();
    this.activeMainLink = this.root.locator(CHROME_SELECTORS.headerActiveMainLink);
    this.userMenuTrigger = this.root.locator(CHROME_SELECTORS.headerUserMenuTrigger).first();
    this.userMenuItems = page.locator(CHROME_SELECTORS.headerUserMenuItem);
    this.helpLink = this.root.locator(CHROME_SELECTORS.headerHelpLink);
    this.courseLockup = this.root.locator(CHROME_SELECTORS.headerCourseLockup);
    this.menuToggle = page.locator(CHROME_SELECTORS.headerMenuToggle).first();
    this.menuPanel = page.locator(CHROME_SELECTORS.headerMenuPanel);
  }

  /**
   * Which generation rendered this page's header. Waits for the header to have
   * rendered its controls (the account menu, or the signed-out buttons), so a
   * reading taken next sees the finished header — the learning header, for
   * one, mounts its Help link with the account menu, after the page's config.
   */
  async generation(): Promise<ChromeGeneration> {
    await this.root.waitFor();
    await this.userMenuTrigger.or(this.anonymousLinks.first()).first().waitFor();
    for (const generation of ['shell', 'learning', 'legacy'] as const) {
      if ((await this.page.locator(CHROME_SELECTORS.generation[generation]).count()) > 0) {
        return generation;
      }
    }
    // The union matched, so one of the three did; this keeps the type total.
    throw new Error('The page rendered a header none of the chrome generations recognises.');
  }

  /** The absolute URLs a set of links point at, in document order. */
  async hrefs(links: Locator): Promise<readonly string[]> {
    const base = this.page.url();
    const raw = await links.evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute('href') ?? ''),
    );
    return raw.map((href) => new URL(href, base).toString());
  }

  /**
   * The primary links a visitor can reach at the current width: the visible
   * ones, or — where the narrow layout hides them behind the menu toggle — the
   * ones that menu offers once opened.
   */
  async reachableMainLinks(): Promise<readonly string[]> {
    await this.root.waitFor();
    if ((await this.mainLinks.count()) > 0 || (await this.menuToggle.count()) === 0) {
      return this.hrefs(this.mainLinks);
    }
    await this.openMenu();
    return this.hrefs(this.menuPanel.locator('a[href]'));
  }

  /** Opens the account menu and returns the URLs its items point at, in order. */
  async openUserMenu(): Promise<readonly string[]> {
    await this.userMenuTrigger.click();
    try {
      await this.userMenuItems.first().waitFor({ timeout: TIMEOUTS.optionalOverlay });
    } catch {
      // A click that lands while the header is still hydrating opens nothing;
      // the trigger is then live, and a second click opens the menu.
      await this.userMenuTrigger.click();
      await this.userMenuItems.first().waitFor();
    }
    return this.hrefs(this.userMenuItems);
  }

  /** Opens the account menu and follows the item pointing at `url`. */
  async followUserMenuItem(url: string): Promise<void> {
    const index = (await this.openUserMenu()).indexOf(url);
    if (index < 0) throw new Error(`The account menu has no item pointing at ${url}.`);
    await this.follow(this.userMenuItems.nth(index));
  }

  /** Opens the narrow layout's menu and waits for its panel. */
  async openMenu(): Promise<void> {
    await this.menuToggle.click();
    await this.menuPanel.first().waitFor({ state: 'attached' });
  }

  /** Follows a header link and waits until the page has left for its target. */
  async follow(link: Locator): Promise<void> {
    const from = this.page.url();
    await link.click();
    await this.page.waitForURL((url) => url.toString() !== from);
  }

  /** The rendered height of the header's logo. */
  async logoHeight(): Promise<number> {
    const box = await this.logoImage.boundingBox();
    return box?.height ?? 0;
  }
}
