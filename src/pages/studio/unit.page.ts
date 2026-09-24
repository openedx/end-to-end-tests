import type { Frame, Locator, Page, Response } from '@playwright/test';

import {
  COURSE_LIBRARY_SYNC_SELECTORS,
  LEGACY_EDITOR_SELECTORS,
  advancedComponentOption,
  STUDIO_EDITOR_SELECTORS,
  STUDIO_UNIT_PAGE_SELECTORS,
  TIMEOUTS,
  type AppConfig,
} from '../../config';
import { ApiError, CLIPBOARD_PATH, XBLOCK_PATH, studioOrigin } from '../../api';
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
        urlIncludes: `${XBLOCK_PATH}block-v1:`,
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
        urlIncludes: `${XBLOCK_PATH}block-v1:`,
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
    // The paste button renders off the MFE's clipboard state. After "Copy to
    // Clipboard" the MFE does not re-fetch the clipboard (measured: only the
    // initial GET and the copy's POST), it updates state from the POST — which
    // lands late or not at all on a slow target (verawood CI waited 30s for
    // nothing). Give it a moment, then reload: a fresh page load issues the
    // clipboard GET, and the button follows deterministically.
    const appeared = await button
      .waitFor({ state: 'visible', timeout: TIMEOUTS.optionalOverlay })
      .then(() => true)
      .catch(() => false);
    if (!appeared) {
      await Promise.all([
        this.page.waitForResponse(
          (r) => r.url().endsWith(CLIPBOARD_PATH) && r.request().method() === 'GET',
          { timeout: TIMEOUTS.navigation },
        ),
        this.page.reload(),
      ]);
      await this.header.waitFor();
      await button.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    }
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
        urlIncludes: `${XBLOCK_PATH}block-v1:`,
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
   * Adds a component through the "Advanced" tile: opens the picker (the tile at
   * `advancedTileIndex`, from `availableComponentTypes`), chooses `category` by
   * its radio's value and selects it, waiting for the create it causes
   * (`POST /xblock/`). Returns the new block's usage key.
   */
  async addAdvancedComponent(advancedTileIndex: number, category: string): Promise<string> {
    await this.openAddComponent(advancedTileIndex);
    const picker = this.page.locator(this.s.advancedPickerDialog);
    await picker.locator(advancedComponentOption(category)).check();
    const response = await waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => new URL(r.url()).pathname === XBLOCK_PATH,
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => picker.locator(this.s.advancedPickerSelect).click(),
    );
    const body = (await response.json()) as { locator?: string };
    if (!response.ok() || body.locator === undefined) {
      throw new ApiError(`Adding a ${category} component failed (HTTP ${response.status()}).`, {
        status: response.status(),
        url: response.url(),
        body: JSON.stringify(body).slice(0, 500),
      });
    }
    return body.locator;
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
        // A paste re-stages the copied OLX under this unit — heavier than a plain
        // create on a busy CMS, so use the roomier content-write budget.
        timeout: TIMEOUTS.contentWrite,
      },
      () => paste.click(),
    );
  }

  // --- Library content -----------------------------------------------------

  /**
   * The "Update available" action in the header of an upstream-linked block
   * inside the components iframe (present only while the library item has a
   * newer published version). Clicking it opens the preview-changes modal in
   * this page. Anchored inside the iframe's block wrapper for `usageKey`.
   */
  iframeUpdateAvailableButton(usageKey: string): Locator {
    return this.page
      .frameLocator(this.s.componentIframe)
      .locator(`[data-usage-id="${usageKey}"]`)
      .locator(COURSE_LIBRARY_SYNC_SELECTORS.iframeUpdateAvailableButton)
      .first();
  }

  /**
   * A component's rendered preview inside the unit's iframe, by its usage key —
   * the block's own `div.xblock`, not its card header (which carries the same
   * `data-usage-id`).
   */
  component(usageKey: string): Locator {
    return this.page
      .frameLocator(this.s.componentIframe)
      .locator(`div.xblock[data-usage-id="${usageKey}"]`);
  }

  /**
   * Selects a component card inside the unit's iframe by clicking its header —
   * the Verawood interaction that shows the component's Info in the unit-page
   * sidebar (with a Back button and the component's own overflow menu). The
   * header is server-rendered inside the legacy container iframe and carries the
   * block's `data-usage-id` (our own key, not localized copy).
   */
  async selectComponent(usageKey: string): Promise<void> {
    await this.page
      .frameLocator(this.s.componentIframe)
      .locator(`.xblock-header-primary[data-usage-id="${usageKey}"]`)
      .first()
      .click();
  }

  /**
   * "Edit" in a component's iframe header — opens the MFE's editor dialog for
   * that component (the text editor for an html block), the way an author
   * overrides a library-sourced component's content in the course.
   */
  async editComponentInIframe(usageKey: string): Promise<void> {
    await this.page
      .frameLocator(this.s.componentIframe)
      .locator(`[data-usage-id="${usageKey}"]`)
      .locator(COURSE_LIBRARY_SYNC_SELECTORS.iframeEditButton)
      .first()
      .click();
    await this.page.locator(STUDIO_EDITOR_SELECTORS.editorDialog).last().waitFor();
  }

  /**
   * "Edit" on a component whose editor is its own XBlock `studio_view` (poll,
   * Google calendar, recommender, ORA, …): the MFE opens a dialog holding the
   * editor in an iframe. Returns that frame once it has loaded.
   */
  async openLegacyEditor(usageKey: string): Promise<Frame> {
    await this.page
      .frameLocator(this.s.componentIframe)
      .locator(`[data-usage-id="${usageKey}"]`)
      .locator(COURSE_LIBRARY_SYNC_SELECTORS.iframeEditButton)
      .first()
      .click();
    const element = this.page.locator(LEGACY_EDITOR_SELECTORS.frame);
    await element.waitFor({ timeout: TIMEOUTS.navigation });
    const handle = await element.elementHandle();
    const frame = await handle?.contentFrame();
    await handle?.dispose();
    if (frame === null || frame === undefined) {
      throw new Error(`The editor for ${usageKey} opened no frame.`);
    }
    await frame.waitForLoadState('load', { timeout: TIMEOUTS.navigation });
    return frame;
  }

  /**
   * Clicks a legacy editor's save control and waits for the Studio handler it
   * posts to (`POST /xblock/<key>/handler/<handler>`), then — unless the editor
   * stays open after a save, as the recommender's does — for the dialog to
   * close. Returns the handler's response.
   */
  async saveLegacyEditor(
    frame: Frame,
    saveSelector: string,
    { handler = 'studio_submit', closes = true }: { handler?: string; closes?: boolean } = {},
  ): Promise<Response> {
    const response = await waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => new URL(r.url()).pathname.endsWith(`/handler/${handler}`),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => frame.locator(saveSelector).click(),
    );
    if (closes) await this.legacyEditorClosed();
    return response;
  }

  /** Closes a legacy editor without saving, through its own cancel control. */
  async closeLegacyEditor(frame: Frame): Promise<void> {
    await frame.locator(LEGACY_EDITOR_SELECTORS.close).first().click();
    await this.legacyEditorClosed();
  }

  private async legacyEditorClosed(): Promise<void> {
    await this.page
      .locator(LEGACY_EDITOR_SELECTORS.frame)
      .waitFor({ state: 'detached', timeout: TIMEOUTS.navigation });
  }

  async openUpdateAvailable(usageKey: string): Promise<void> {
    await this.iframeUpdateAvailableButton(usageKey).click();
    await this.page.locator(COURSE_LIBRARY_SYNC_SELECTORS.previewModal).waitFor();
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
