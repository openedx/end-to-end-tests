import type { Locator, Page, Response } from '@playwright/test';

import { XBLOCK_PATH } from '../../../api';
import { LIBRARY_PICKER_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { waitForWrite } from '../wait-for-write';

/**
 * The "Select component" picker (`LibraryAndComponentPicker`) the course unit
 * page opens from its "Library Content" add-component tile (and the outline's
 * Add sidebar for units / subsections / sections): step one lists the
 * libraries the user may reuse from as radio cards; step two embeds the
 * library page, with an "Add" button per card. Also used inside a library by
 * "Existing Library Content".
 */
export class LibraryPickerDialog {
  private readonly s = LIBRARY_PICKER_SELECTORS;
  readonly root: Locator;
  readonly embeddedPage: Locator;
  readonly cards: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    void this.config;
    this.root = page.locator(this.s.modal).last();
    this.embeddedPage = page.locator(this.s.embeddedPage);
    this.cards = page.locator(this.s.card);
  }

  /** A library's radio card on step one — present only for libraries this user may reuse from. */
  libraryRadio(libraryKey: string): Locator {
    return this.page.locator(this.s.libraryRadio(libraryKey));
  }

  async searchLibraries(term: string): Promise<void> {
    await this.page.locator(this.s.librarySearchInput).fill(term);
  }

  /** Picks a library on step one; the embedded library page follows. */
  async selectLibrary(libraryKey: string): Promise<void> {
    // The radio input is visually hidden behind its card; clicking the card selects it.
    await this.page
      .locator('[role="dialog"] .pgn__card')
      .filter({
        has: this.page.locator(`input[name="selected-library"][value="${libraryKey}"]`),
      })
      .first()
      .click();
    await this.embeddedPage.waitFor({ timeout: TIMEOUTS.navigation });
  }

  /** The embedded page's card titled `title` (our own data). */
  cardFor(title: string): Locator {
    return this.cards.filter({ hasText: title });
  }

  /**
   * "Add" on a card, waiting for the `POST /xblock/` that imports it into the
   * course; returns that response (its body carries the new block's locator).
   */
  async addToCourse(title: string): Promise<Response> {
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => new URL(r.url()).pathname === XBLOCK_PATH,
        timeout: TIMEOUTS.contentWrite,
      },
      () => this.cardFor(title).first().locator(this.s.cardAddButton).first().click(),
    );
  }

  /**
   * "Add" on a card inside a library's own "Existing Library Content" picker,
   * waiting for the container children `POST`.
   */
  async addToContainer(title: string): Promise<Response> {
    return waitForWrite(
      this.page,
      { method: 'POST', urlIncludes: '/children/', timeout: TIMEOUTS.contentWrite },
      () => this.cardFor(title).first().locator(this.s.cardAddButton).first().click(),
    );
  }

  async close(): Promise<void> {
    await this.page.locator(this.s.closeButton).last().click();
    await this.root.waitFor({ state: 'detached' });
  }
}
