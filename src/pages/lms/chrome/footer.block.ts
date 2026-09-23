import type { Locator, Page } from '@playwright/test';

import { CHROME_SELECTORS } from '../../../config';

/**
 * The page footer, over both footer generations (the frontend-base shell's and
 * `frontend-component-footer`'s). Locators and readings only.
 */
export class FooterBlock {
  readonly root: Locator;
  /** Every link the footer renders — theme data, so never asserted as a set. */
  readonly links: Locator;
  readonly imageLinks: Locator;
  /** "Powered by Open edX" — the last image link in both generations. */
  readonly poweredByLink: Locator;
  /** The shell's "© {year} {siteName}." line; absent from the legacy footer. */
  readonly legalNotice: Locator;
  readonly languageMenuTrigger: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator(CHROME_SELECTORS.footer).first();
    this.links = this.root.locator('a[href]');
    this.imageLinks = this.root.locator(CHROME_SELECTORS.footerImageLink);
    this.poweredByLink = this.imageLinks.last();
    this.legalNotice = this.root.locator(CHROME_SELECTORS.footerLegalNotice).first();
    this.languageMenuTrigger = this.root.locator(CHROME_SELECTORS.languageMenuTrigger);
  }

  /** The absolute URLs of every footer link, in document order. */
  async linkUrls(): Promise<readonly string[]> {
    await this.root.waitFor();
    const base = this.page.url();
    const raw = await this.links.evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute('href') ?? ''),
    );
    return raw.map((href) => new URL(href, base).toString());
  }

  /** Whether an image link's picture actually loaded (a broken logo reads `false`). */
  async imageLoaded(link: Locator): Promise<boolean> {
    return link
      .locator('img')
      .evaluate(
        (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
      );
  }

  /** Rendered heights of the footer's image links' pictures, in document order. */
  async imageHeights(): Promise<readonly number[]> {
    await this.root.waitFor();
    // Heights are only final once each picture has loaded.
    await this.imageLinks.locator('img').evaluateAll((images) =>
      Promise.all(
        images.map((img) =>
          (img as HTMLImageElement).complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
              }),
        ),
      ),
    );
    return this.imageLinks
      .locator('img')
      .evaluateAll((images) => images.map((img) => img.getBoundingClientRect().height));
  }

  /**
   * Picks the first language the shell's language menu offers other than the
   * current one, and waits for the preference it stores. Returns the language
   * code the menu stored — the menu items carry no code of their own.
   */
  async chooseAnotherLanguage(lmsBaseUrl: string): Promise<string> {
    await this.languageMenuTrigger.click();
    const stored = this.page.waitForResponse(
      (r) =>
        r.url().startsWith(`${lmsBaseUrl}/api/user/v1/preferences/`) &&
        r.request().method() === 'PATCH',
    );
    await this.page.locator('.dropdown-menu a.dropdown-item:not(.active):visible').first().click();
    const body = JSON.parse((await stored).request().postData() ?? '{}') as Record<string, string>;
    return body['pref-lang'] ?? '';
  }

  /** The absolute URLs a set of footer links point at. */
  async hrefs(links: Locator): Promise<readonly string[]> {
    const base = this.page.url();
    const raw = await links.evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute('href') ?? ''),
    );
    return raw.map((href) => new URL(href, base).toString());
  }
}
