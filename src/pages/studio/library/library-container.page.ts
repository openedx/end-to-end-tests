import type { Locator, Page, Response } from '@playwright/test';

import {
  LIBRARY_SELECTORS,
  TIMEOUTS,
  libraryContainerPath,
  type AppConfig,
  type LibraryContainerType,
} from '../../../config';
import { waitForWrite } from '../wait-for-write';
import { LibrarySidebar } from './library-sidebar';

/**
 * A container's landing page in the library MFE — a unit (`/unit/<key>`, its
 * components as cards with previews), a subsection (`/subsection/<key>`, its
 * units) or a section (`/section/<key>`, its subsections). The header has the
 * container's editable title, an Info button and an add button ("Add Content"
 * on a unit, which opens the Add Content panel; "Add Unit" / "Add Subsection"
 * on the others). Child cards carry the same kebab menus as the library page,
 * plus "Remove from <parent>".
 */
export class LibraryContainerPage {
  private readonly s = LIBRARY_SELECTORS;
  readonly root: Locator;
  readonly sidebar: LibrarySidebar;
  /** The container's title label in the header. */
  readonly title: Locator;
  /** The child cards, in order. */
  readonly children: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.root = page.locator(this.s.page);
    this.sidebar = new LibrarySidebar(page);
    this.title = page.locator(`header.sub-header ${this.s.inplaceTitleLabel}`);
    this.children = page.locator(
      `${this.s.unitPage} ${this.s.card}, ${this.s.containerChildren} ${this.s.card}`,
    );
  }

  url(libraryKey: string, type: LibraryContainerType, containerKey: string): string {
    return libraryContainerPath(this.config, libraryKey, type, containerKey);
  }

  async goto(libraryKey: string, type: LibraryContainerType, containerKey: string): Promise<void> {
    await this.page.goto(this.url(libraryKey, type, containerKey));
    await this.root.waitFor();
    await this.title.waitFor();
  }

  /** Renames the container through the header's inline editor, waiting for the `PATCH containers/<key>/`. */
  async rename(displayName: string): Promise<Response> {
    await this.page.locator(`header.sub-header ${this.s.inplaceTitleEditButton}`).click();
    const input = this.page.locator(`header.sub-header ${this.s.inplaceTitleInput}`);
    await input.fill(displayName);
    return waitForWrite(this.page, { method: 'PATCH', urlIncludes: '/containers/' }, () =>
      input.press('Enter'),
    );
  }

  /**
   * The header's Info button ("Unit Info" / "Subsection Info" / "Section
   * Info"). Container pages open with the panel shown and the button toggles
   * it, so this clicks only when the item panel is not already there.
   */
  async openInfo(): Promise<void> {
    // The item panel is recognisable by its Manage tab (a published item has no
    // publish button to look for).
    await this.sidebar.root.waitFor({ timeout: TIMEOUTS.optionalOverlay }).catch(() => undefined);
    if (!(await this.sidebar.tab('manage').isVisible())) {
      await this.page.locator(this.s.headerActionButton).nth(this.s.headerAction.info).click();
    }
    await this.sidebar.tab('manage').waitFor();
  }

  /** A unit's "Add Content" header button — shows the Add Content panel (a toggle). */
  async openAddContent(): Promise<void> {
    const componentButtons = this.page.locator(this.s.addContentButtonAfterRule);
    if (!(await componentButtons.first().isVisible())) {
      await this.page.locator(this.s.headerActionButton).nth(this.s.headerAction.add).click();
    }
    await componentButtons.first().waitFor();
  }

  /**
   * A section's "Add Subsection" / a subsection's "Add Unit" header button
   * opens the Add Content panel scoped to this container ("Existing Library
   * Content" then the one child type); the child-type button opens a naming
   * modal whose submit creates the child — this waits for the
   * `POST <lib>/containers/`.
   */
  async addChildContainer(displayName: string): Promise<Response> {
    await this.page.locator(this.s.headerActionButton).nth(this.s.headerAction.add).click();
    // The panel here has no rule: "Existing Library Content" then the child type.
    const buttons = this.page.locator(this.s.addContentButton);
    await buttons.first().waitFor();
    await buttons.last().click();
    const dialog = this.page.locator(this.s.deleteModal).last();
    await dialog.locator('input.form-control').first().fill(displayName);
    // The MFE creates the child, then attaches it with a `children/` POST.
    const attached = this.page.waitForResponse(
      (r) =>
        ['POST', 'PATCH'].includes(r.request().method()) &&
        new URL(r.url()).pathname.endsWith('/children/'),
      { timeout: TIMEOUTS.contentWrite },
    );
    const created = await waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().endsWith('/containers/'),
        timeout: TIMEOUTS.contentWrite,
      },
      () =>
        dialog
          .locator('button[type="submit"], .pgn__modal-footer button.btn-primary')
          .last()
          .click(),
    );
    await attached;
    return created;
  }

  /** The unit page's footer buttons: "Add New Content" (opens the panel) / "Add Existing Content" (opens the picker). */
  async footerAddNew(): Promise<void> {
    await this.page.locator(this.s.unitFooterButton).nth(this.s.unitFooter.addNew).click();
  }

  async footerAddExisting(): Promise<void> {
    await this.page.locator(this.s.unitFooterButton).nth(this.s.unitFooter.addExisting).click();
  }

  /** The child card titled `title` (our own data). */
  childFor(title: string): Locator {
    return this.children.filter({ has: this.page.locator(this.s.cardTitle, { hasText: title }) });
  }

  /** Clicks a child card, opening its info panel in the sidebar. */
  async openChild(title: string): Promise<void> {
    await this.childFor(title).first().click();
    await this.sidebar.root.waitFor();
  }

  async openChildMenu(title: string): Promise<void> {
    await this.childFor(title)
      .first()
      .locator(`${this.s.componentCardMenuToggle}, ${this.s.containerCardMenuToggle}`)
      .first()
      .click();
    await this.page.locator(this.s.openMenu).waitFor();
  }

  /** Child menu → "Remove from <parent>" → confirm, waiting for the children `DELETE`. */
  async removeChild(title: string): Promise<Response> {
    await this.openChildMenu(title);
    await this.page.locator(this.s.menuRemoveItem).first().click();
    return this.confirm('DELETE', '/children/');
  }

  /** Child menu → "Delete" (last item) → confirm, waiting for the item's `DELETE`. */
  async deleteChild(title: string): Promise<Response> {
    await this.openChildMenu(title);
    await this.page.locator(this.s.menuLastItem).click();
    return this.confirm('DELETE', '/api/libraries/v2/');
  }

  /** Child menu → "Edit" (first item) — opens the component editor. */
  async editChild(title: string): Promise<void> {
    await this.openChildMenu(title);
    await this.page.locator(this.s.openMenuItem).nth(this.s.componentMenu.edit).click();
  }

  private async confirm(method: 'DELETE' | 'POST', urlIncludes: string): Promise<Response> {
    const dialog = this.page.locator(this.s.deleteModal).last();
    await dialog.waitFor();
    return waitForWrite(this.page, { method, urlIncludes, timeout: TIMEOUTS.contentWrite }, () =>
      dialog
        .locator('.pgn__modal-footer button.btn-primary, .pgn__modal-footer button.btn-danger')
        .last()
        .click(),
    );
  }

  /** Cancels an open confirmation dialog. */
  async cancelDialog(): Promise<void> {
    const dialog = this.page.locator(this.s.deleteModal).last();
    await dialog.locator('.pgn__modal-footer button.btn-tertiary').click();
    await dialog.waitFor({ state: 'detached' });
  }
}
