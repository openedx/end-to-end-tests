import type { Locator, Page } from '@playwright/test';

import { STUDIO_SIDEBAR_SELECTORS, type AppConfig, type SidebarPageKey } from '../../../config';

/**
 * The Verawood authoring sidebar as a region of whichever page hosts it — the
 * course outline or the unit page. One shared component (`src/generic/sidebar`),
 * so one object drives both: the rail (Info / Add / Align / Help), the panel and
 * its page-switcher dropdown, the collapse and resize controls, the selected
 * item's title and overflow menu, and the Taxonomy Alignments "Manage tags"
 * opener.
 *
 * Locators and single-surface actions only; the spec owns the assertions. The
 * sidebar's rendering *is* the thing under test for the structure cases, so those
 * assertions are structural (a rail button's active class, the panel's presence,
 * a title equal to the item's own name), never on localized copy.
 */
export class AuthoringSidebar {
  private readonly s = STUDIO_SIDEBAR_SELECTORS;
  readonly toggleColumn: Locator;
  readonly panel: Locator;
  readonly title: Locator;
  readonly collapseButton: Locator;
  readonly resizeHandle: Locator;
  readonly pageDropdownToggle: Locator;
  readonly itemMenuButton: Locator;
  readonly backButton: Locator;
  readonly publishButton: Locator;
  readonly taxonomySectionMenu: Locator;

  constructor(
    private readonly page: Page,
    config: AppConfig,
  ) {
    void config;
    this.toggleColumn = page.locator(this.s.toggle);
    this.panel = page.locator(this.s.sidebarContent);
    this.title = page.locator(this.s.title);
    this.collapseButton = page.locator(this.s.collapseButton);
    this.resizeHandle = page.locator(this.s.resizeHandle);
    this.pageDropdownToggle = page.locator(this.s.pageDropdownToggle);
    this.itemMenuButton = page.locator(this.s.itemMenuButton);
    this.backButton = page.locator(this.s.backButton);
    this.publishButton = page.locator(this.s.publishButton);
    this.taxonomySectionMenu = page.locator(this.s.taxonomySectionMenu);
  }

  /** A page's rail button. */
  railButton(key: SidebarPageKey): Locator {
    return this.page.locator(this.s.railButton(key));
  }

  /** Whether a rail button is the active (open) page. */
  async isPageActive(key: SidebarPageKey): Promise<boolean> {
    const cls = (await this.railButton(key).getAttribute('class')) ?? '';
    return cls.split(/\s+/).includes(this.s.railActiveClass);
  }

  /** Opens a page from the rail and waits for its button to become active. */
  async openPage(key: SidebarPageKey): Promise<void> {
    await this.railButton(key).click();
    await this.railButton(key)
      .and(this.page.locator(`.${this.s.railActiveClass}`))
      .waitFor();
  }

  /** Whether the panel is open (expanded). */
  async isOpen(): Promise<boolean> {
    return this.panel.isVisible();
  }

  /** Collapses the open panel (the toggle turns into an expand control). */
  async collapse(): Promise<void> {
    await this.collapseButton.click();
    await this.panel.waitFor({ state: 'hidden' });
  }

  /** Expands the collapsed panel. */
  async expand(): Promise<void> {
    await this.collapseButton.click();
    await this.panel.waitFor({ state: 'visible' });
  }

  /** Opens the page-switcher dropdown and returns its menu items (one per page). */
  async openPageDropdown(): Promise<Locator> {
    await this.pageDropdownToggle.click();
    return this.page.locator(this.s.dropdownItem);
  }

  /** Opens the selected item's overflow ("Item Menu") and returns its items. */
  async openItemMenu(): Promise<Locator> {
    await this.itemMenuButton.click();
    return this.page.locator('.dropdown-menu.show .dropdown-item');
  }

  /** The panel's documentation links (their `href`s) — the Help-content oracle. */
  async helpLinkHrefs(): Promise<string[]> {
    const links = await this.page.locator(this.s.helpLink).all();
    const hrefs = await Promise.all(links.map((l) => l.getAttribute('href')));
    return hrefs.filter((h): h is string => h !== null);
  }
}
