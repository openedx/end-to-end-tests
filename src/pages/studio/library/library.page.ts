import type { Locator, Page, Response } from '@playwright/test';

import { CLIPBOARD_PATH, LIBRARIES_V2_PATH } from '../../../api';
import {
  LIBRARY_SELECTORS,
  STUDIO_EDITOR_SELECTORS,
  TIMEOUTS,
  libraryCollectionPath,
  libraryPath,
  type AppConfig,
  type LibraryContainerType,
  type LibraryTab,
} from '../../../config';
import { waitForWrite } from '../wait-for-write';
import { LibrarySidebar } from './library-sidebar';

/** What the Add Content sidebar can add, by the request it fires. */
export type AddableComponentType = keyof typeof LIBRARY_SELECTORS.addComponentIndex;

/**
 * The library page in the authoring MFE (`/library/<lib key>`): the header
 * ("Library Info" / "New"), the content tabs, search / sort / filters, the
 * content cards with their kebab menus, and the sidebar. The collection
 * landing page (`/collection/<key>`) is the same surface scoped to one
 * collection, so it is reached from here too.
 *
 * Locators and single-surface actions. Every write waits for the v2 request it
 * causes and returns the response; the spec asserts on the API afterwards.
 */
export class LibraryPage {
  private readonly s = LIBRARY_SELECTORS;
  readonly root: Locator;
  readonly sidebar: LibrarySidebar;
  readonly searchInput: Locator;
  readonly cards: Locator;
  /** Every card's title text — for order assertions with `allInnerTexts()`. */
  readonly cardTitles: Locator;
  readonly notFoundAlert: Locator;
  readonly permissionDeniedAlert: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.root = page.locator(this.s.page);
    this.sidebar = new LibrarySidebar(page);
    this.searchInput = page.locator(this.s.searchInput);
    // Cards render below the tab strip, not inside the (empty) tab panes.
    this.cards = page.locator(`${this.s.page} ${this.s.card}`);
    this.cardTitles = this.cards.locator(this.s.cardBodyTitle);
    this.notFoundAlert = page.locator(this.s.notFoundAlert);
    this.permissionDeniedAlert = page.locator(this.s.permissionDeniedAlert);
  }

  url(libraryKey: string, tab?: LibraryTab): string {
    return libraryPath(this.config, libraryKey, tab);
  }

  /**
   * Opens the library (on a tab), waiting for the MFE to fetch the library
   * itself — the "surface really renders" signal a gated spec asserts on.
   */
  async goto(libraryKey: string, tab?: LibraryTab): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes(`${LIBRARIES_V2_PATH}${libraryKey}/`) && r.request().method() === 'GET',
        { timeout: TIMEOUTS.navigation },
      ),
      this.page.goto(this.url(libraryKey, tab)),
    ]);
    return response;
  }

  async gotoCollection(libraryKey: string, collectionKey: string): Promise<void> {
    await this.page.goto(libraryCollectionPath(this.config, libraryKey, collectionKey));
    await this.root.waitFor();
  }

  /** A content tab link, by non-localized key. */
  tab(tab: LibraryTab): Locator {
    return this.page.locator(this.s.tab(tab));
  }

  async openTab(tab: LibraryTab): Promise<void> {
    await this.tab(tab).click();
  }

  // --- header ----------------------------------------------------------------

  /**
   * "Library Info" (or "Collection Info") — shows the info panel in the sidebar.
   * The library page opens with that panel already shown, and the header
   * button toggles it, so this only clicks when the panel is not there.
   */
  async openInfo(): Promise<void> {
    // The panel opens by itself a moment after the page renders; give it that
    // moment before deciding whether the toggle needs a click.
    await this.sidebar.root.waitFor({ timeout: TIMEOUTS.optionalOverlay }).catch(() => undefined);
    if (!(await this.sidebar.publicReadSwitch.isVisible())) {
      // The header renders after the library's own fetch, and later still on a
      // loaded target, so the toggle is waited for rather than clicked blind.
      const info = this.page.locator(this.s.headerActionButton).nth(this.s.headerAction.info);
      await info.waitFor({ timeout: TIMEOUTS.navigation });
      await info.click();
    }
    await this.sidebar.root.waitFor();
  }

  /** "New" — shows the Add Content panel in the sidebar (a toggle, like Info). */
  async openAddContent(): Promise<void> {
    const componentButtons = this.page.locator(this.s.addContentButtonAfterRule);
    if (!(await componentButtons.first().isVisible())) {
      await this.page.locator(this.s.headerActionButton).nth(this.s.headerAction.add).click();
    }
    await componentButtons.first().waitFor();
  }

  // --- add content ---------------------------------------------------------------

  /**
   * The Add Content buttons above the rule, in rendered order: on the library
   * page "Collection", "Section", "Subsection", "Unit"; on a collection page
   * "Existing Library Content" replaces "Collection".
   */
  private addBeforeRule(): Locator {
    return this.page.locator(this.s.addContentButtonBeforeRule);
  }

  /**
   * Adds a container (or, on the library page, a collection) from the open
   * Add Content panel by its position above the rule, waiting for the
   * `POST <lib>/containers/` (or `/collections/`) it fires. The MFE opens a
   * naming modal for containers and collections first — {@link nameNewItem}.
   */
  async addContainer(
    kind: 'collection' | LibraryContainerType,
    displayName: string,
  ): Promise<Response> {
    const order: readonly string[] = ['collection', 'section', 'subsection', 'unit'];
    await this.addBeforeRule().nth(order.indexOf(kind)).click();
    return this.nameNewItem(displayName, kind === 'collection' ? '/collections/' : '/containers/');
  }

  /**
   * Fills the "name your new …" modal the container / collection buttons open
   * and submits it, waiting for the create request.
   */
  async nameNewItem(displayName: string, urlIncludes: string): Promise<Response> {
    const dialog = this.page.locator(this.s.deleteModal).last();
    await dialog.locator(this.s.dialogNameInput).first().fill(displayName);
    return waitForWrite(
      this.page,
      { method: 'POST', urlIncludes, timeout: TIMEOUTS.contentWrite },
      () => dialog.locator(this.s.dialogSubmitButton).last().click(),
    );
  }

  /**
   * Picks a component type from the open Add Content panel (the buttons below
   * the rule, fixed order). The MFE opens the component's editor dialog first
   * and creates the block when the editor saves — so this returns once the
   * editor dialog is open; {@link saveNewComponent} waits for the create.
   */
  async addComponent(type: Exclude<AddableComponentType, 'advanced'>): Promise<void> {
    await this.page
      .locator(this.s.addContentButtonAfterRule)
      .nth(this.s.addComponentIndex[type])
      .click();
    await this.page.locator(this.s.editorDialog).last().waitFor({ timeout: TIMEOUTS.navigation });
  }

  /**
   * Saves the open component editor, waiting for the `POST <lib>/blocks/` that
   * creates the block (the editor writes its content in a follow-up call).
   */
  async saveNewComponent(): Promise<Response> {
    return waitForWrite(
      this.page,
      { method: 'POST', urlIncludes: '/blocks/', timeout: TIMEOUTS.contentWrite },
      () => this.page.locator(this.s.editorSaveButton).click(),
    );
  }

  /**
   * Saves the open editor of an **existing** library component, waiting for the
   * content write it fires (`POST /api/xblock/v2/xblocks/<usage>/fields/`).
   */
  async saveEditor(): Promise<Response> {
    return waitForWrite(
      this.page,
      { method: 'POST', urlIncludes: '/api/xblock/v2/xblocks/', timeout: TIMEOUTS.contentWrite },
      () => this.page.locator(this.s.editorSaveButton).click(),
    );
  }

  /** The open component editor dialog. */
  get editorDialog(): Locator {
    return this.page.locator(this.s.editorDialog).last();
  }

  /** The values of the open editor's text fields, in order — to check what was typed is still there. */
  async editorFieldValues(): Promise<string[]> {
    return this.editorDialog
      .locator(this.s.editorTextInput)
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  }

  /** The open text editor's editable body (TinyMCE's frame). */
  get editorTextBody(): Locator {
    return this.editorDialog.frameLocator(STUDIO_EDITOR_SELECTORS.tinyMceFrame).locator('body');
  }

  /** The editor's "Cancel" — opens the "Exit the editor?" prompt without answering it. */
  async cancelEditor(): Promise<void> {
    await this.page.locator(this.s.editorCancelButton).click();
    await this.page.locator(this.s.editorExitDiscardButton).waitFor();
  }

  /** The exit prompt's "Keep Editing": the prompt goes, the editor stays. */
  async keepEditing(): Promise<void> {
    await this.page.locator(this.s.editorExitKeepEditingButton).click();
    await this.page.locator(this.s.editorExitDiscardButton).waitFor({ state: 'detached' });
  }

  /** The exit prompt's "Discard Changes and Exit": the editor closes. */
  async discardEditor(): Promise<void> {
    await this.page.locator(this.s.editorExitDiscardButton).click();
    await this.page.locator(this.s.editorDialog).waitFor({ state: 'detached' });
  }

  /**
   * In the open PDF editor: chooses the file the block shows, waiting for the
   * `PUT blocks/<key>/assets/…` that stores it as an asset of the block.
   */
  async uploadPdfInEditor(file: { name: string; buffer: Buffer }): Promise<Response> {
    const input = this.page.locator(this.s.editorPdfFileInput);
    await input.waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });
    return waitForWrite(
      this.page,
      { method: 'PUT', urlIncludes: '/assets/', timeout: TIMEOUTS.contentWrite },
      () => input.setInputFiles({ ...file, mimeType: 'application/pdf' }),
    );
  }

  /**
   * "Advanced / Other" then the advanced type whose button shows `displayName`
   * — the `display_name` the library's `block_types` API reports for the type
   * (the MFE renders exactly that string), so the match is against platform
   * data the spec fetched, not copy written into the suite. Like the basic
   * types, the MFE opens the block's editor first and creates the block when
   * it saves ({@link saveNewComponent}); the response's `block_type` is the
   * spec's check that the right entry was clicked.
   */
  async addAdvancedComponent(displayName: string): Promise<void> {
    // "Advanced / Other" renders only once the block types have loaded.
    const buttons = this.page.locator(this.s.addContentButtonAfterRule);
    await buttons.nth(this.s.addComponentIndex.advanced).waitFor();
    await this.page
      .waitForResponse((r) => r.url().includes('/block_types/'), {
        timeout: TIMEOUTS.optionalOverlay,
      })
      .catch(() => undefined);
    await buttons.nth(this.s.addComponentIndex.advanced).click();
    const list = this.page.locator(this.s.advancedTypeButton);
    await list.first().waitFor();
    await list.filter({ hasText: displayName }).first().click();
    await this.page.locator(this.s.editorDialog).last().waitFor({ timeout: TIMEOUTS.navigation });
  }

  /** "Paste From Clipboard" (the last button below the rule), waiting for `POST <lib>/paste_clipboard/`. */
  async pasteFromClipboard(): Promise<Response> {
    return waitForWrite(
      this.page,
      // A library item pastes through `paste_clipboard/`; staged course content
      // may instead arrive as a `POST <lib>/blocks/` with `staged_content`.
      {
        method: 'POST',
        predicate: (r) => /\/(paste_clipboard|blocks)\/$/.test(new URL(r.url()).pathname),
        timeout: TIMEOUTS.contentWrite,
      },
      async () => {
        // "Paste From Clipboard" appears after "Advanced / Other" once the
        // clipboard query has answered; wait for that slot rather than the
        // list's last button, which is "Advanced / Other" until then.
        const paste = this.page
          .locator(this.s.addContentButtonAfterRule)
          .nth(this.s.addComponentIndex.advanced + 1);
        await paste.waitFor();
        // A previous paste's toast overlays the panel foot and intercepts the
        // click. Toasts stack and do not always auto-fade in time, so dismiss any
        // that are showing before clicking — by the close control's class: the
        // toast is `aria-hidden` (so roles are out) and its label is localized.
        const toasts = this.page.locator(this.s.toast);
        for (let guard = 0; guard < 5 && (await toasts.count()) > 0; guard += 1) {
          await this.page
            .locator(this.s.toastCloseButton)
            .first()
            .click({ timeout: TIMEOUTS.optionalOverlay })
            .catch(() => undefined);
          await toasts
            .first()
            .waitFor({ state: 'hidden' })
            .catch(() => undefined);
        }
        await paste.click();
      },
    );
  }

  /** "Existing Library Content" (first button above the rule on a collection / container page). */
  async openAddExisting(): Promise<void> {
    await this.addBeforeRule().first().click();
  }

  // --- search, sort, filter ------------------------------------------------------
  // None of these awaits a search response: the MFE's search client answers
  // repeated queries from its cache with no request, so specs assert the card
  // set with `toHaveCount` / `expect.poll`, which retry while the index answers.

  /** Types a search term; the spec asserts the card set with a retrying matcher (see above). */
  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    // While focused the field expands over the filter row and would intercept
    // clicks on the refinement toggles.
    await this.searchInput.blur();
  }

  /**
   * Clears the search field and waits for the unfiltered results. Done by
   * emptying the field: the "×" reset button sits under the focused field's
   * expanded overlay and cannot be clicked without forcing.
   */
  async clearSearch(): Promise<void> {
    // An emptied query may be answered from the search client's cache with no
    // request, so nothing is awaited here; the spec's `toHaveCount` retries.
    await this.searchInput.fill('');
    await this.searchInput.blur();
  }

  /**
   * The search box's "×": clears the term. Clickable only once the field has
   * lost focus ({@link search} blurs it) — while focused, the field expands
   * over its own reset button.
   */
  async resetSearch(): Promise<void> {
    await this.page.locator(this.s.searchResetButton).click();
  }

  /** The highlighted keyword matches inside the card titled `title`. */
  highlightsIn(title: string): Locator {
    return this.cardFor(title).locator(this.s.cardHighlight);
  }

  /**
   * Picks a sort option. Options are located from the end of the menu, since
   * "Most Relevant" is prepended (only) while a search term is typed — asking
   * for it without one throws rather than clicking the wrong option.
   */
  async sortBy(option: keyof typeof LIBRARY_SELECTORS.sortOption): Promise<void> {
    await this.page.locator(this.s.sortToggle).click();
    const items = this.page.locator(this.s.sortMenuItem);
    await items.first().waitFor();
    const index = (await items.count()) - this.s.sortOption[option];
    if (index < 0) {
      throw new Error(`The sort menu does not offer '${option}' (no search term is typed).`);
    }
    await items.nth(index).click();
  }

  private async openFilter(which: keyof typeof LIBRARY_SELECTORS.filter): Promise<void> {
    await this.page.locator(this.s.filterToggle).nth(this.s.filter[which]).click();
  }

  /** Toggles one block type in the "Type" filter (opens the menu if needed). */
  async toggleTypeFilter(blockType: string): Promise<void> {
    const box = this.page.locator(this.s.typeFilterCheckbox(blockType));
    if (!(await box.isVisible())) await this.openFilter('type');
    await box.click();
  }

  /** Toggles one status in the "Publish Status" filter. */
  async togglePublishStatusFilter(status: 'published' | 'modified' | 'never'): Promise<void> {
    const box = this.page.locator(this.s.publishStatusCheckbox(status));
    if (!(await box.isVisible())) await this.openFilter('publishStatus');
    await box.click();
  }

  /** Opens the "Tags" filter and toggles the item at `index`. */
  async toggleTagFilter(index: number): Promise<void> {
    const item = this.page.locator(this.s.tagFilterItem).nth(index);
    if (!(await item.isVisible())) await this.openFilter('tags');
    await item.click();
  }

  /**
   * Opens the "Tags" filter and toggles the facet node whose value is `facetValue`
   * (our data — a taxonomy name or a tag value). The root facet is the taxonomy, so
   * a taxonomy name selects all content tagged in it. Waits for the node to appear:
   * the facet reflects the search index, which reindexes a just-tagged block
   * asynchronously. No assertion here — the spec owns those.
   */
  async toggleTagFilterByValue(facetValue: string): Promise<void> {
    const box = this.page.locator(this.s.tagFilterCheckbox(facetValue));
    if (!(await box.isVisible())) await this.openFilter('tags');
    await box.waitFor({ state: 'visible', timeout: TIMEOUTS.librarySearch });
    await box.click();
  }

  /**
   * Opens the "Tags" filter and toggles the node at `path` (taxonomy name, then
   * each tag down to the wanted one — our own data), expanding each ancestor
   * that is still collapsed on the way. Waits like {@link toggleTagFilterByValue}.
   */
  async toggleTagFilterByPath(path: readonly string[]): Promise<void> {
    const row = (depth: number) =>
      this.page.locator(this.s.tagFilterRowByPath(path.slice(0, depth)));
    if (!(await row(1).isVisible())) await this.openFilter('tags');
    await row(1).waitFor({ state: 'visible', timeout: TIMEOUTS.librarySearch });
    for (let depth = 2; depth <= path.length; depth += 1) {
      if (!(await row(depth).isVisible())) {
        await row(depth - 1)
          .locator(this.s.tagFilterRowExpandButton)
          .click();
      }
      await row(depth).waitFor({ state: 'visible', timeout: TIMEOUTS.librarySearch });
    }
    await row(path.length).locator(this.s.tagFilterRowCheckbox).click();
  }

  /** "Clear Filter" inside the given refinement menu (opened if needed). */
  async clearFilter(which: keyof typeof LIBRARY_SELECTORS.filter): Promise<void> {
    const clear = this.page.locator(this.s.clearFiltersButton);
    if (!(await clear.isVisible())) await this.openFilter(which);
    // The unfiltered result set may come from the search client's cache with no
    // request, so nothing is awaited; the spec's `toHaveCount` retries.
    await clear.first().click();
  }

  /** Closes any open menu by clicking the page header away from it. */
  async dismissMenu(): Promise<void> {
    await this.page.locator('header.sub-header h2').first().click();
    await this.page
      .locator(this.s.openMenu)
      .waitFor({ state: 'hidden' })
      .catch(() => undefined);
  }

  // --- cards ----------------------------------------------------------------------

  /** The card whose title is `title` — the test's own data, so matching it is allowed. */
  cardFor(title: string): Locator {
    return this.cards.filter({ has: this.page.locator(this.s.cardTitle, { hasText: title }) });
  }

  /** Clicks a card, opening its info panel in the sidebar. */
  async openCard(title: string): Promise<void> {
    await this.cardFor(title).first().click();
    await this.sidebar.root.waitFor();
  }

  /** Opens a card's kebab menu (component, container or collection). */
  async openCardMenu(title: string): Promise<Locator> {
    const card = this.cardFor(title).first();
    await card
      .locator(
        `${this.s.componentCardMenuToggle}, ${this.s.containerCardMenuToggle}, ${this.s.collectionCardMenuToggle}`,
      )
      .first()
      .click();
    const menu = this.page.locator(this.s.openMenu);
    await menu.waitFor();
    return menu;
  }

  /** Card menu → "Copy to clipboard" (second item), waiting for the content-staging write. */
  async copyCardToClipboard(title: string): Promise<Response> {
    await this.openCardMenu(title);
    return waitForWrite(this.page, { method: 'POST', urlIncludes: CLIPBOARD_PATH }, () =>
      this.page.locator(this.s.openMenuItem).nth(this.s.componentMenu.copy).click(),
    );
  }

  /**
   * Card menu → "Delete" — opens the confirmation without answering it (for
   * its Cancel path and its warning). On a component card "Delete" is the last
   * item (after a divider); on a top-level container card the menu has no
   * divider and "Delete" is the third item.
   */
  async openCardDelete(title: string): Promise<void> {
    const menu = await this.openCardMenu(title);
    const hasDivider = (await menu.locator('.dropdown-divider').count()) > 0;
    const item = hasDivider
      ? this.page.locator(this.s.menuLastItem)
      : this.page.locator(this.s.openMenuItem).nth(this.s.containerMenu.delete);
    await item.click();
    await this.page.locator(this.s.deleteModal).last().waitFor();
  }

  /** Card menu → "Delete" → confirm, waiting for the `DELETE`. */
  async deleteCard(title: string): Promise<Response> {
    await this.openCardDelete(title);
    return this.confirmDialog('DELETE', LIBRARIES_V2_PATH);
  }

  /**
   * The delete confirmation's warning that courses use the item (see
   * `deleteDialogDownstreamWarning`): empty for an item no course reuses.
   */
  get deleteDownstreamWarning(): Locator {
    return this.page
      .locator(this.s.deleteModal)
      .last()
      .locator(this.s.deleteDialogDownstreamWarning);
  }

  /** On a collection page: card menu → "Remove from collection" (no confirmation), waiting for the items `DELETE`. */
  async removeCardFromCollection(title: string): Promise<Response> {
    await this.openCardMenu(title);
    return waitForWrite(
      this.page,
      { method: 'DELETE', urlIncludes: '/items/', timeout: TIMEOUTS.contentWrite },
      () =>
        this.page
          .locator(this.s.openMenuItem)
          .nth(this.s.collectionCardMenu.removeFromCollection)
          .click(),
    );
  }

  /** Card menu → "Add to collection" (component: third item; container: fourth). */
  async openCardAddToCollection(title: string, kind: 'component' | 'container'): Promise<void> {
    await this.openCardMenu(title);
    const index =
      kind === 'component'
        ? this.s.componentMenu.addToCollection
        : this.s.containerMenu.addToCollection;
    await this.page.locator(this.s.openMenuItem).nth(index).click();
  }

  /**
   * In the item sidebar's Manage Collections view (which a card's "Add to
   * collection" opens): tick the collection with `collectionKey` (its checkbox
   * value) → Confirm, waiting for the block's collections `PATCH`.
   */
  async chooseCollection(collectionKey: string): Promise<Response> {
    const view = this.page.locator(this.s.manageCollectionsView);
    // A card's "Add to collection" opens the view itself (after the collections
    // load); from the Manage tab the collapsible's button opens it.
    try {
      await view.waitFor({ timeout: TIMEOUTS.optionalOverlay });
    } catch {
      await this.page.locator(this.s.manageAddToCollectionButton).first().click();
      await view.waitFor();
    }
    await view.locator(this.s.manageCollectionsOption(collectionKey)).first().click();
    return waitForWrite(
      this.page,
      // From the item's side the membership write is `PATCH blocks/<usage>/collections/`.
      { method: 'PATCH', urlIncludes: '/collections/', timeout: TIMEOUTS.contentWrite },
      () => view.locator(this.s.manageCollectionsConfirm).click(),
    );
  }

  /** Confirms the open Paragon confirmation dialog, waiting for the write it fires. */
  async confirmDialog(method: 'DELETE' | 'POST' | 'PATCH', urlIncludes: string): Promise<Response> {
    const dialog = this.page.locator(this.s.deleteModal).last();
    await dialog.waitFor();
    return waitForWrite(this.page, { method, urlIncludes, timeout: TIMEOUTS.contentWrite }, () =>
      dialog.locator(this.s.dialogConfirmButton).last().click(),
    );
  }

  /** Cancels the open confirmation dialog. */
  async cancelDialog(): Promise<void> {
    const dialog = this.page.locator(this.s.deleteModal).last();
    await dialog.locator(this.s.dialogCancelButton).click();
    await dialog.waitFor({ state: 'detached' });
  }
}
