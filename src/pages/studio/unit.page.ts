import type { Locator, Page } from '@playwright/test';

import { STUDIO_UNIT_PAGE_SELECTORS, TIMEOUTS, type AppConfig } from '../../config';
import { CLIPBOARD_PATH, XBLOCK_PATH, studioOrigin } from '../../api';
import { waitForWrite } from './wait-for-write';

/** The usage key in a `/container/<vertical>/…` URL, or undefined if none. */
function unitKeyFromUrl(url: string): string | undefined {
  return /container\/(block-v1:[^/?#]*type@vertical[^/?#]+)/.exec(url)?.[1];
}

/**
 * The unit (container) page in the authoring MFE — where an author works on one
 * unit: previews it, publishes it, sets its visibility, navigates to siblings,
 * and copies it to the clipboard.
 *
 * Locators and single-surface actions; the spec asserts, against `xblock/outline`
 * / `container_handler` (author side) and the learner's readings. New-tab actions
 * (Preview, View live) return the opened `Page` for the spec to judge its URL.
 * Several header controls carry no test id, so they are anchored by position in a
 * known button group (see the selector comments).
 */
export class StudioUnitPage {
  private readonly s = STUDIO_UNIT_PAGE_SELECTORS;
  readonly header: Locator;
  readonly componentIframe: Locator;
  readonly publishButton: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.header = page.locator(this.s.unitHeaderTitle);
    this.componentIframe = page.locator(this.s.componentIframe);
    this.publishButton = page.locator(this.s.publishButton);
  }

  /** The Studio URL for a unit; the platform redirects it to the MFE. */
  url(unitUsageKey: string): string {
    return `${studioOrigin(this.config)}/container/${unitUsageKey}`;
  }

  async goto(unitUsageKey: string): Promise<void> {
    await this.page.goto(this.url(unitUsageKey));
    await this.page.waitForURL((u) => u.pathname.includes(`/container/${unitUsageKey}`));
    await this.header.waitFor();
    // The components render in a legacy iframe the MFE frames after the header.
    await this.componentIframe.waitFor();
  }

  // --- New-tab actions -----------------------------------------------------

  /** Clicks "Preview" and returns the learning-MFE preview tab it opens. */
  async preview(): Promise<Page> {
    return this.openInNewTab(this.previewViewLive().first());
  }

  /**
   * Clicks "View live version" and returns the LMS tab it opens. The button is
   * disabled until the unit is published, so publish first.
   */
  async viewLive(): Promise<Page> {
    return this.openInNewTab(this.previewViewLive().nth(1));
  }

  private previewViewLive(): Locator {
    return this.page.locator(this.s.previewViewLiveGroup).locator('button');
  }

  private async openInNewTab(button: Locator): Promise<Page> {
    const [tab] = await Promise.all([this.page.context().waitForEvent('page'), button.click()]);
    await tab.waitForLoadState('domcontentloaded');
    return tab;
  }

  // --- Publish and visibility ---------------------------------------------

  /** Publishes the unit through the sidebar Publish button, waiting for the write. */
  async publish(): Promise<void> {
    await waitForWrite(
      this.page,
      {
        method: ['POST', 'PATCH'],
        predicate: (r) => new RegExp(`${XBLOCK_PATH}block-v1:`).test(r.url()),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => this.publishButton.click(),
    );
  }

  /** Opens the sidebar's Settings tab (holds visibility, group access, discussion). */
  async openSettings(): Promise<void> {
    await this.page.locator(this.s.sidebarSettingsTab).click();
  }

  /**
   * Sets "Hide from learners" via the Settings tab's Student Visible / Staff Only
   * toggle, waiting for the republish it triggers. Student Visible is the first
   * button in the toggle group, Staff Only the second.
   */
  async setStaffOnly(staffOnly: boolean): Promise<void> {
    await this.openSettings();
    const toggle = this.page.locator(this.s.visibilityToggleGroup).locator('button');
    await waitForWrite(
      this.page,
      {
        method: ['POST', 'PATCH'],
        predicate: (r) => new RegExp(`${XBLOCK_PATH}block-v1:`).test(r.url()),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => toggle.nth(staffOnly ? 1 : 0).click(),
    );
  }

  // --- Navigation ----------------------------------------------------------

  /**
   * Clicks "New unit" (the first sequence-navigation action button); the MFE
   * navigates to the new unit's page. Returns its usage key from the URL.
   */
  async addUnit(): Promise<string> {
    const button = this.page.locator(this.s.sequenceActionButton).first();
    return this.clickAndReadUnit(button);
  }

  /**
   * Clicks "Paste as new unit" (the second sequence-navigation action button,
   * shown while the clipboard holds a unit); the MFE navigates to the pasted
   * unit. Returns its usage key.
   */
  async pasteAsNewUnit(): Promise<string> {
    const button = this.page.locator(this.s.sequenceActionButton).nth(1);
    await button.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    return this.clickAndReadUnit(button);
  }

  /** Clicks "Next"/"Previous" and returns the sibling unit's usage key from the URL. */
  async next(): Promise<string> {
    return this.clickAndReadUnit(this.page.locator(this.s.nextUnitButton));
  }

  async previous(): Promise<string> {
    return this.clickAndReadUnit(this.page.locator(this.s.previousUnitButton));
  }

  private async clickAndReadUnit(button: Locator): Promise<string> {
    const before = unitKeyFromUrl(this.page.url());
    await button.click();
    await this.page.waitForURL((u) => {
      const key = unitKeyFromUrl(u.href);
      return key !== undefined && key !== before;
    });
    const key = unitKeyFromUrl(this.page.url());
    if (key === undefined) {
      throw new Error(`Expected a unit URL after navigation, got ${this.page.url()}`);
    }
    await this.header.waitFor();
    return key;
  }

  /**
   * Enables or disables the unit's discussion through the Settings tab's "Enable
   * discussion" checkbox, waiting for the republish it triggers.
   */
  async setDiscussionEnabled(enabled: boolean): Promise<void> {
    await this.openSettings();
    const checkbox = this.page.locator(this.s.discussionCheckbox);
    if ((await checkbox.isChecked()) === enabled) return;
    await waitForWrite(
      this.page,
      {
        method: ['POST', 'PATCH'],
        predicate: (r) => new RegExp(`${XBLOCK_PATH}block-v1:`).test(r.url()),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => checkbox.setChecked(enabled),
    );
  }

  // --- Components ----------------------------------------------------------

  /** The "Add component" tiles, in the platform's `component_templates` order. */
  addComponentTiles(): Locator {
    return this.page.locator(this.s.addComponentButton);
  }

  /**
   * Clicks the "Add component" tile at `index` (the type's position in the
   * platform's `component_templates`, from `availableComponentTypes`). What
   * follows depends on the type: a template modal (text), a type picker (problem),
   * or an inline editor (video).
   */
  async openAddComponent(index: number): Promise<void> {
    await this.addComponentTiles().nth(index).click();
  }

  /**
   * Pastes the clipboard's component into this unit via the "Paste Component"
   * button (shown while the clipboard holds a component), waiting for the write.
   * Returns nothing — the caller re-reads the unit's children.
   */
  async pasteComponent(): Promise<void> {
    const paste = this.page.locator(this.s.pasteComponentButton);
    await paste.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    await waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().endsWith(XBLOCK_PATH),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => paste.click(),
    );
  }

  // --- Clipboard -----------------------------------------------------------

  /**
   * Copies this unit to the clipboard through the sidebar Item Menu's "Copy to
   * Clipboard" item (the first, non-danger item), waiting for the content-staging
   * write.
   */
  async copyToClipboard(): Promise<void> {
    await this.page.locator(this.s.itemMenuButton).click();
    await waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().endsWith(CLIPBOARD_PATH),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => this.page.locator(this.s.itemMenuCopyItem).first().click(),
    );
  }
}
