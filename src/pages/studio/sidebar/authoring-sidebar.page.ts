import type { Locator, Page } from '@playwright/test';

import {
  STUDIO_SIDEBAR_SELECTORS,
  TIMEOUTS,
  type AppConfig,
  type SidebarPageKey,
} from '../../../config';
import { XBLOCK_PATH } from '../../../api';
import { waitForWrite } from '../wait-for-write';

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
  readonly unitPublishButton: Locator;
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
    this.unitPublishButton = page.locator(this.s.unitPublishButton);
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

  /** A panel tab by its non-localized element id (see the selector helpers). */
  tab(selector: string): Locator {
    return this.page.locator(selector);
  }

  /**
   * Clicks a panel tab and waits for it to be selected. Callers pass one of
   * `STUDIO_SIDEBAR_SELECTORS`' tab helpers rather than a hand-built id, so the
   * three `Tabs` id schemes live in the selector module with the rest.
   */
  async openTab(selector: string): Promise<void> {
    await this.tab(selector).click();
    await this.tab(selector).and(this.page.locator('[aria-selected="true"]')).waitFor();
  }

  /** The topics the Help panel renders for the selected level. */
  get helpTopics(): Locator {
    return this.page.locator(this.s.helpTopic);
  }

  /** The `href`s of the links currently rendered in the panel (the Settings-tab links). */
  async panelLinkHrefs(): Promise<string[]> {
    const links = await this.page.locator(this.s.helpLink).all();
    const hrefs = await Promise.all(links.map((l) => l.getAttribute('href')));
    return hrefs.filter((h): h is string => h !== null);
  }

  /**
   * Publishes the selected item from the Info panel's Publish button (present
   * only while the item has unpublished changes), waiting for the `POST /xblock/`
   * the publish fires. Retries the click once if the first press produces no
   * request — under a loaded CMS the button can be pressed before its handler is
   * wired, and a lost click leaves the item unpublished.
   */
  async publish(): Promise<void> {
    await this.clickPublish(this.publishButton);
  }

  /** Publishes the unit from the unit-page publish-controls widget (with the same retry). */
  async publishUnit(): Promise<void> {
    await this.clickPublish(this.unitPublishButton);
  }

  private async clickPublish(button: Locator): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await waitForWrite(
          this.page,
          {
            method: ['POST', 'PATCH'],
            urlIncludes: `${XBLOCK_PATH}block-v1:`,
            timeout: TIMEOUTS.contentWrite,
          },
          () => button.click(),
        );
        return;
      } catch (error) {
        // The button may have already gone (the publish landed) — then we are done.
        if (!(await button.isVisible())) return;
        if (attempt === 1) throw error;
      }
    }
  }
}
