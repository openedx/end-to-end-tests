import type { Locator, Page, Response } from '@playwright/test';

import { LIBRARIES_V2_PATH } from '../../../api';
import { LIBRARY_SELECTORS, TIMEOUTS } from '../../../config';
import { waitForWrite } from '../wait-for-write';

/**
 * The library MFE's right-hand sidebar (`[data-testid="library-sidebar"]`),
 * shared by the library, collection and container pages. Depending on what
 * opened it, it is the **library info** panel ("Publish All", "Discard
 * Changes", the public-read switch, the team link), the **Add Content** panel,
 * or an **item info** panel for a component / container / collection (tabs,
 * the two-step publish control, the Usage hierarchy).
 *
 * Locators and single-surface actions; every write waits for the v2 request it
 * causes and returns the response. No assertions.
 */
export class LibrarySidebar {
  private readonly s = LIBRARY_SELECTORS;
  readonly root: Locator;
  /** The public-read `Form.Switch` of the library info panel. */
  readonly publicReadSwitch: Locator;
  /** The team control: a link into the admin console, or a button opening the team modal. */
  readonly manageTeamLink: Locator;
  readonly manageTeamButton: Locator;
  /** The item's publish control; `publishStatusDraft` matches only while changes are pending. */
  readonly publishStatusButton: Locator;
  readonly publishStatusDraft: Locator;
  /** The two-step publish confirmation box. */
  readonly publishConfirmBox: Locator;
  readonly hierarchyRows: Locator;
  readonly hierarchySelectedRow: Locator;
  readonly blockPreview: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator(this.s.sidebar);
    this.publicReadSwitch = page.locator(this.s.publicReadSwitch);
    this.manageTeamLink = page.locator(this.s.manageTeamLink);
    this.manageTeamButton = page.locator(this.s.manageTeamButton);
    this.publishStatusButton = page.locator(this.s.publishStatusButton);
    this.publishStatusDraft = page.locator(this.s.publishStatusDraft);
    this.publishConfirmBox = page.locator(this.s.publishConfirmBox);
    this.hierarchyRows = page.locator(this.s.hierarchyRow);
    this.hierarchySelectedRow = page.locator(this.s.hierarchySelectedRow);
    this.blockPreview = this.root.locator(this.s.blockPreview);
  }

  /** Closes the sidebar (its title row's last inline icon button — the row may also hold a rename pencil). */
  async close(): Promise<void> {
    await this.page.locator(this.s.sidebarCloseButton).last().click();
    await this.root.waitFor({ state: 'hidden' });
  }

  /** One of the item panel's tabs, by non-localized key. */
  tab(key: 'preview' | 'manage' | 'usage' | 'details' | 'settings'): Locator {
    return this.page.locator(this.s.sidebarTab(key));
  }

  async openTab(key: 'preview' | 'manage' | 'usage' | 'details' | 'settings'): Promise<void> {
    await this.tab(key).click();
  }

  /** The Usage tab's hierarchy rows' text, top level first. */
  async hierarchyTexts(): Promise<string[]> {
    await this.page.locator(this.s.hierarchy).waitFor();
    return this.page.locator(this.s.hierarchyRowText).allTextContents();
  }

  // --- item publish (two-step) ---------------------------------------------

  /**
   * Clicks the item's publish control, which opens the confirmation box
   * (nothing is published yet); returns the hierarchy rows the box lists.
   */
  async openPublishConfirmation(): Promise<string[]> {
    await this.publishStatusButton.click();
    await this.publishConfirmBox.waitFor();
    return this.publishConfirmBox.locator(this.s.hierarchyRowText).allTextContents();
  }

  /** Cancels an open publish confirmation. */
  async cancelPublish(): Promise<void> {
    await this.page.locator(this.s.publishConfirmCancel).click();
    await this.publishConfirmBox.waitFor({ state: 'detached' });
  }

  /** Confirms an open publish confirmation, waiting for the `POST …/publish/`. */
  async confirmPublish(): Promise<Response> {
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().includes(LIBRARIES_V2_PATH) && r.url().endsWith('/publish/'),
        timeout: TIMEOUTS.contentWrite,
      },
      () => this.page.locator(this.s.publishConfirmSubmit).click(),
    );
  }

  /** The whole two-step publish: open the confirmation and confirm it. */
  async publish(): Promise<Response> {
    await this.openPublishConfirmation();
    return this.confirmPublish();
  }

  /** "Edit component" in a component's sidebar — opens the component editor. */
  async editComponent(): Promise<void> {
    await this.page.locator(this.s.sidebarEditComponentButton).click();
  }

  // --- library info panel ------------------------------------------------------

  /** Flips the public-read switch, waiting for the `PATCH <lib>/` it fires. */
  async setPublicRead(enabled: boolean): Promise<Response | undefined> {
    // React-controlled: the switch changes state (and re-enables) only once the
    // PATCH answers, so click rather than `setChecked` and let the spec read the
    // resulting state from the API.
    await this.publicReadSwitch.waitFor();
    if ((await this.publicReadSwitch.isChecked()) === enabled) {
      return undefined;
    }
    return waitForWrite(this.page, { method: 'PATCH', urlIncludes: LIBRARIES_V2_PATH }, () =>
      this.publicReadSwitch.click(),
    );
  }
}
