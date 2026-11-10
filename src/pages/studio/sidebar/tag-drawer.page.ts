import type { Locator, Page } from '@playwright/test';

import { TAG_DRAWER_SELECTORS, TIMEOUTS, encodedTagValue, type AppConfig } from '../../../config';
import { TAGGING_BASE } from '../../../api';
import { waitForWrite } from '../wait-for-write';

/**
 * The content tag drawer, embedded in the Verawood Align sidebar. Drives one
 * taxonomy at a time (found by its name — our data): expand it, open its tag
 * selector, check tags by their encoded lineage, commit and save. Page-object
 * actions only; the spec asserts against the `object_tags` API and, where the
 * rendering is the case, the applied-tags tree and count.
 *
 * The drawer opens from a card's "Manage tags" kebab (outline) or the Align rail
 * (course); the openers live on the outline page and the sidebar, so this object
 * assumes the drawer is already open.
 */
export class TagDrawer {
  private readonly s = TAG_DRAWER_SELECTORS;
  readonly drawer: Locator;
  readonly saveButton: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.drawer = page.locator(this.s.drawer);
    this.saveButton = page.locator(this.s.saveButton);
  }

  /** Waits for the drawer to render. */
  async waitOpen(): Promise<void> {
    await this.drawer.waitFor();
  }

  /**
   * Enters edit mode. The drawer opens in a read view with a "Manage tags"
   * button; clicking it reveals the editable taxonomy cards (and the Save
   * footer). If the drawer is already in edit mode the button is absent and this
   * is a no-op.
   */
  async beginEditing(): Promise<void> {
    const enter = this.page.locator(this.s.enterEditButton);
    // The read-view "Manage tags" button may render a moment after the drawer;
    // wait for it (bounded), and click it when present. A drawer already in edit
    // mode has no such button, so a timeout here is fine.
    await enter.waitFor({ timeout: TIMEOUTS.action }).catch(() => {});
    if (await enter.isVisible().catch(() => false)) {
      await enter.click();
    }
    await this.page.locator(this.s.taxonomyCollapsible).first().waitFor();
  }

  /** The collapsible card for the taxonomy named `name` (found by its heading text). */
  private async collapsible(name: string): Promise<Locator> {
    const all = this.page.locator(this.s.taxonomyCollapsible);
    await all.first().waitFor();
    // One round trip for every heading: a card list that re-renders between a
    // count and a per-card read would leave a locator waiting for a card that is gone.
    const headings = await all.evaluateAll(
      (cards, selector) => cards.map((card) => card.querySelector(selector)?.textContent?.trim()),
      this.s.collapsibleHeading,
    );
    const index = headings.indexOf(name);
    if (index === -1) throw new Error(`The tag drawer has no taxonomy named "${name}".`);
    return all.nth(index);
  }

  /** The names of the taxonomies the drawer lists (their headings). */
  async taxonomyNames(): Promise<string[]> {
    const headings = await this.page.locator(this.s.collapsibleHeading).allTextContents();
    return headings.map((h) => h.trim());
  }

  /** Expands a taxonomy's collapsible if it is collapsed. */
  async expandTaxonomy(name: string): Promise<void> {
    const card = await this.collapsible(name);
    const trigger = card.locator(this.s.collapsibleTrigger).first();
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
      await trigger.click();
    }
  }

  /** Opens a taxonomy's tag react-select menu. */
  async openTagSelector(name: string): Promise<void> {
    await this.expandTaxonomy(name);
    await (await this.collapsible(name)).locator(this.s.tagSelectControl).first().click();
  }

  /** Types into a taxonomy's open tag search input (filters the menu). */
  async searchTags(name: string, text: string): Promise<void> {
    const input = (await this.collapsible(name)).locator(this.s.tagSelectInput).first();
    await input.fill(text);
  }

  /** The tag values currently offered in a taxonomy's open menu (their encoded box values). */
  async visibleTagValues(name: string): Promise<string[]> {
    const boxes = (await this.collapsible(name)).locator(`${this.s.anySelectableBox} input`);
    // Read every value in one round trip. A search re-renders the menu, and a
    // count followed by per-box reads left a read waiting the whole action
    // timeout for a box the filter had removed, outlasting the caller's poll.
    return boxes.evaluateAll((inputs) =>
      inputs
        .map((input) => input.getAttribute('value'))
        .filter((value): value is string => value !== null),
    );
  }

  /** Expands a parent tag's children inside a taxonomy's open menu. */
  async expandTagChildren(name: string, parent: string): Promise<void> {
    const card = await this.collapsible(name);
    const encoded = encodedTagValue(parent);
    await card
      .locator(
        `.dropdown-selector-tag-encapsulator:has(> div input[value="${encoded}"]) ${this.s.arrowDropdown}`,
      )
      .first()
      .click();
  }

  /** Checks a tag's box in a taxonomy's open menu, by its lineage (parent…child). */
  async checkTag(name: string, ...lineage: readonly string[]): Promise<void> {
    const card = await this.collapsible(name);
    await card
      .locator(this.s.selectableBox(encodedTagValue(...lineage)))
      .first()
      .click();
  }

  /** Commits a taxonomy's staged tags into its applied list ("Add tags"). */
  async commitStaged(name: string): Promise<void> {
    await (await this.collapsible(name)).locator(this.s.addStagedButton).first().click();
  }

  /** How many applied tags a taxonomy shows (its delete buttons — the primary oracle is the API). */
  async appliedTagCount(name: string): Promise<number> {
    const card = await this.collapsible(name);
    return card.locator(this.s.deleteTagButton).count();
  }

  /**
   * Removes an applied tag from a taxonomy's tree by its value (our data), by
   * matching the delete button whose row text is the value.
   */
  async deleteAppliedTag(name: string, value: string): Promise<void> {
    const card = await this.collapsible(name);
    const dels = card.locator(this.s.deleteTagButton);
    const count = await dels.count();
    for (let i = 0; i < count; i += 1) {
      const del = dels.nth(i);
      const rowText = (await del.evaluate((el) => el.parentElement?.textContent ?? ''))?.trim();
      if (rowText === value) {
        await del.click();
        return;
      }
    }
    throw new Error(`No applied tag "${value}" to delete in taxonomy "${name}".`);
  }

  /** Saves the drawer, waiting for the `PUT object_tags` write. */
  async save(): Promise<void> {
    await waitForWrite(
      this.page,
      {
        method: 'PUT',
        urlIncludes: `${TAGGING_BASE}/object_tags/`,
        timeout: TIMEOUTS.contentWrite,
      },
      () => this.saveButton.click(),
    );
  }
}
