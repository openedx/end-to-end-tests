import type { Locator, Page, Response } from '@playwright/test';

import {
  SIDEBAR_ITEM_MENU_ORDER,
  STUDIO_SIDEBAR_SELECTORS,
  TIMEOUTS,
  type AppConfig,
  type SidebarItemAction,
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
    return this.page.locator(this.s.itemMenuItems);
  }

  /**
   * Opens the item menu and returns one action's entry, named rather than
   * counted: `kind` is what is selected — an outline section/subsection, or a
   * unit's component — whose menus list different actions
   * (`SIDEBAR_ITEM_MENU_ORDER`).
   */
  async itemMenuAction(kind: 'outline' | 'component', action: SidebarItemAction): Promise<Locator> {
    const index = SIDEBAR_ITEM_MENU_ORDER[kind].indexOf(action);
    if (index < 0) throw new Error(`The ${kind} item menu has no "${action}" action.`);
    return (await this.openItemMenu()).nth(index);
  }

  /**
   * Deletes the selected item from its item menu: Delete, then the confirmation
   * dialog's Delete, waiting for the `DELETE /xblock/<key>` it fires.
   */
  async deleteSelected(kind: 'outline' | 'component'): Promise<void> {
    await (await this.itemMenuAction(kind, 'delete')).click();
    await waitForWrite(
      this.page,
      {
        method: 'DELETE',
        urlIncludes: `${XBLOCK_PATH}block-v1:`,
        timeout: TIMEOUTS.contentWrite,
      },
      () => this.page.locator(this.s.deleteConfirmButton).click(),
    );
  }

  /** The outline Add sidebar's "Add Existing" pane (library content to reuse). */
  get addExistingPane(): Locator {
    return this.page.locator(this.s.addExistingPane);
  }

  /**
   * Ticks (or unticks) one library in the "Add Existing" pane's library filter,
   * finding it by searching the filter for `libraryTitle`, since the filter
   * lists every library the author may reuse from. The pane then lists the
   * content of the ticked libraries only (of all of them when none is ticked).
   */
  async setAddExistingLibrary(
    libraryKey: string,
    libraryTitle: string,
    ticked: boolean,
  ): Promise<void> {
    await this.addExistingPane.locator(this.s.addExistingLibraryFilter).click();
    await this.page.locator(this.s.addExistingLibrarySearch).fill(libraryTitle);
    const option = this.page.locator(this.s.addExistingLibraryOption(libraryKey));
    // A just-seeded library can lag in the search index the filter reads.
    await option.waitFor({ timeout: TIMEOUTS.librarySearch });
    await option.setChecked(ticked);
    await this.page.keyboard.press('Escape');
    await this.page.locator(this.s.addExistingLibrarySearch).waitFor({ state: 'hidden' });
  }

  /** The content cards the "Add Existing" pane lists. */
  get addExistingCards(): Locator {
    return this.addExistingPane.locator(this.s.addExistingCard);
  }

  /**
   * Adds a library item from the "Add Existing" pane into the course: narrows the
   * pane to `libraryKey` with its library filter (searching the filter for
   * `libraryTitle`, since it lists every reusable library), searches the content
   * for `itemTitle` (the test's own data), and clicks that card's "Add", waiting
   * for the `POST /xblock/` that imports it. Returns that response — its body
   * carries the new block's `locator` and `upstreamRef`.
   */
  async addExistingFromLibrary(
    libraryKey: string,
    libraryTitle: string,
    itemTitle: string,
  ): Promise<Response> {
    const pane = this.addExistingPane;
    await this.setAddExistingLibrary(libraryKey, libraryTitle, true);
    const search = pane.locator(this.s.addExistingSearch);
    await search.fill(itemTitle);
    await search.press('Enter');
    const card = pane.locator(this.s.addExistingCard).filter({ hasText: itemTitle }).first();
    await card.waitFor({ timeout: TIMEOUTS.librarySearch });
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => new URL(r.url()).pathname === XBLOCK_PATH,
        timeout: TIMEOUTS.contentWrite,
      },
      () => card.locator(this.s.addExistingCardAdd).first().click(),
    );
  }

  /** The panel's width in CSS pixels, as the resizable wrapper sets it. */
  async width(): Promise<number> {
    const box = await this.page.locator(this.s.resizable).boundingBox();
    if (box === null) throw new Error('The sidebar panel is not resizable here (no wrapper).');
    return box.width;
  }

  /**
   * Drags the panel's left edge `dx` pixels with the mouse (negative widens the
   * panel, positive narrows it) and returns the width it settles at. A real
   * press, move and release: the handle listens for mouse events on the
   * document, which a synthetic `dragTo` does not produce.
   */
  async dragEdge(dx: number): Promise<number> {
    // The handle is two pixels wide and moves when the outline beside it
    // settles: aim again until the pointer is really over it before pressing.
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const box = await this.resizeHandle.boundingBox();
      if (box === null) throw new Error('The sidebar has no resize handle to drag.');
      x = box.x + box.width / 2;
      y = box.y + Math.min(box.height / 2, 200);
      await this.page.mouse.move(x, y);
      const onHandle = await this.resizeHandle.evaluate(
        (handle, point) => document.elementFromPoint(point.x, point.y) === handle,
        { x, y },
      );
      if (onHandle) break;
    }
    await this.page.mouse.down();
    await this.page.mouse.move(x + dx, y, { steps: 10 });
    await this.page.mouse.up();
    // The handle sets the width in React state: read it once the browser has
    // painted the frame after the release, not the one the release landed in.
    await this.page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    return this.width();
  }

  /**
   * The Details tab's content-summary count for a block category, or `0` where
   * the summary has no chip for it.
   */
  async contentSummaryCount(category: string): Promise<number> {
    const chip = this.page.locator(this.s.contentSummaryCount(category));
    if ((await chip.count()) === 0) return 0;
    return Number((await chip.first().textContent())?.trim());
  }

  /** The tag values the Details tab lists under Taxonomy Alignments. */
  async appliedTags(): Promise<string[]> {
    const labels = await this.page.locator(this.s.appliedTagChip).allTextContents();
    return labels.map((label) => label.trim());
  }

  /** The course Settings tab's links into the settings pages. */
  get settingsLinks(): Locator {
    return this.page.locator(this.s.settingsLink);
  }

  /** The open Settings tab's date fields, in order (a subsection: release, due). */
  get settingsDateInputs(): Locator {
    return this.page.locator(this.s.settingsDateInput);
  }

  /** The option (0 or 1) a Settings-tab toggle group currently shows as chosen. */
  async settingsToggleChoice(group: number): Promise<number> {
    const buttons = this.page.locator(this.s.settingsToggleGroup).nth(group).locator('button');
    const classes: string[] = await buttons.evaluateAll((all: Element[]) =>
      all.map((button) => button.getAttribute('class') ?? ''),
    );
    return classes.findIndex((cls) => cls.split(/\s+/).includes(this.s.settingsToggleChosenClass));
  }

  /**
   * Chooses an option of a Settings-tab toggle group, waiting for the write to
   * the selected block that it fires.
   */
  async chooseSettingsToggle(group: number, option: number): Promise<Response> {
    const button = this.page
      .locator(this.s.settingsToggleGroup)
      .nth(group)
      .locator('button')
      .nth(option);
    return waitForWrite(
      this.page,
      {
        method: ['POST', 'PATCH'],
        urlIncludes: `${XBLOCK_PATH}block-v1:`,
        timeout: TIMEOUTS.contentWrite,
      },
      () => button.click(),
    );
  }

  /** The unit rendered in the outline panel's Preview tab. */
  get unitPreviewFrame(): Locator {
    return this.page.locator(this.s.outlineUnitPreviewFrame);
  }

  /**
   * Adds a new section, subsection or unit from the outline Add sidebar's "Add
   * New" tab, waiting for the `POST /xblock/` that creates it. Returns that
   * response: its body carries the new block's `locator`.
   */
  async addNewOutlineItem(kind: 'section' | 'subsection' | 'unit'): Promise<Response> {
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => new URL(r.url()).pathname === XBLOCK_PATH,
        timeout: TIMEOUTS.contentWrite,
      },
      () => this.page.locator(this.s.outlineAddNewButton(kind)).click(),
    );
  }

  /** A component type's entry on the unit page's Add sidebar ("Add New"). */
  unitAddNewType(type: string): Locator {
    return this.page.locator(this.s.unitAddNewType(type));
  }

  /**
   * Adds a new component to the unit from the Add sidebar's "Add New" tab,
   * waiting for the `POST /xblock/` that creates it and returning that response
   * (its body carries the new block's `locator`). A type with templates (Text,
   * Problem, Open Response) is expanded and its first, plain template chosen.
   * Text, Video and Problem then open their editor over the page.
   */
  async addNewComponent(type: string): Promise<Response> {
    const templated = (['html', 'problem', 'openassessment'] as const).find((t) => t === type);
    const entry = this.unitAddNewType(type);
    let trigger = entry;
    if (templated !== undefined) {
      if ((await entry.getAttribute('aria-expanded')) !== 'true') await entry.click();
      trigger = this.page.locator(this.s.unitAddNewTemplate(templated)).first();
    }
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => new URL(r.url()).pathname === XBLOCK_PATH,
        timeout: TIMEOUTS.contentWrite,
      },
      () => trigger.click(),
    );
  }

  /**
   * Moves the selected component to another unit through its item menu's
   * "Move": drills down the dialog by each ancestor's name (section, subsection,
   * then the target unit — the test's own data) and confirms, waiting for the
   * `PATCH /xblock/` that moves it.
   */
  async moveSelectedComponentTo(path: readonly string[]): Promise<Response> {
    await (await this.itemMenuAction('component', 'move')).click();
    await this.page.locator(this.s.moveDialog).waitFor();
    // The dialog can redraw its list while the course tree is still loading,
    // which takes the entry being clicked away and returns to the top level:
    // start the drill-down over when that happens rather than fail on it.
    const drill = async (): Promise<void> => {
      for (const name of path) {
        await this.page
          .locator(this.s.moveDialogItem)
          .filter({ has: this.page.getByText(name, { exact: true }) })
          .first()
          .click({ timeout: TIMEOUTS.optionalOverlay });
      }
    };
    await drill().catch(() => drill());
    const confirm = this.page.locator(this.s.moveDialogConfirm);
    return waitForWrite(
      this.page,
      {
        method: 'PATCH',
        predicate: (r) => new URL(r.url()).pathname === XBLOCK_PATH,
        timeout: TIMEOUTS.contentWrite,
      },
      () => confirm.click(),
    );
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
   * wired, and a lost click leaves the item unpublished. For an item whose
   * Publish opens a confirmation (the course outline), use
   * {@link publishAndConfirm}.
   */
  async publish(): Promise<void> {
    await this.clickPublish(this.publishButton);
  }

  /**
   * Publishes the selected outline item from the Info panel: its Publish button
   * opens the outline's publish confirmation, and the confirm is what fires the
   * `POST /xblock/`. The outline re-renders while it settles, so a press that
   * opens no dialog is retried once before the confirm is clicked.
   */
  async publishAndConfirm(): Promise<void> {
    const confirm = this.page.locator(this.s.publishConfirmButton);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.publishButton.click();
      try {
        await confirm.waitFor({ timeout: TIMEOUTS.contentWrite });
        break;
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
    await waitForWrite(
      this.page,
      {
        method: ['POST', 'PATCH'],
        urlIncludes: `${XBLOCK_PATH}block-v1:`,
        timeout: TIMEOUTS.contentWrite,
      },
      () => confirm.click(),
    );
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
