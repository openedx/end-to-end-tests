import type { Locator, Page, Response } from '@playwright/test';

import {
  STUDIO_OUTLINE_PAGE_SELECTORS,
  STUDIO_OUTLINE_SELECTORS,
  STUDIO_SHELL_SELECTORS,
  TIMEOUTS,
  outlineMenuItem,
  sectionCardContaining,
  subsectionCardContaining,
  unitCardFor,
  type AppConfig,
} from '../../config';
import { CLIPBOARD_PATH, XBLOCK_PATH, studioOrigin } from '../../api';
import { waitForWrite } from './wait-for-write';

type OutlineLevel = 'section' | 'subsection' | 'unit';

/** Per-level anchors, indexed type-safely (a template-keyed lookup is `string | undefined`). */
const EDIT_FIELD: Record<OutlineLevel, string> = {
  section: STUDIO_OUTLINE_PAGE_SELECTORS.sectionEditField,
  subsection: STUDIO_OUTLINE_PAGE_SELECTORS.subsectionEditField,
  unit: STUDIO_OUTLINE_PAGE_SELECTORS.unitEditField,
};
const EDIT_BUTTON: Record<OutlineLevel, string> = {
  section: STUDIO_OUTLINE_PAGE_SELECTORS.sectionEditButton,
  subsection: STUDIO_OUTLINE_PAGE_SELECTORS.subsectionEditButton,
  unit: STUDIO_OUTLINE_PAGE_SELECTORS.unitEditButton,
};
const MENU_BUTTON: Record<OutlineLevel, string> = {
  section: STUDIO_OUTLINE_PAGE_SELECTORS.sectionMenuButton,
  subsection: STUDIO_OUTLINE_PAGE_SELECTORS.subsectionMenuButton,
  unit: STUDIO_OUTLINE_PAGE_SELECTORS.unitMenuButton,
};

/**
 * The course outline in the authoring MFE — where an author builds the section /
 * subsection / unit tree and publishes it.
 *
 * Locators and single-surface actions only; the spec asserts, against the
 * `xblock/outline` API (author side) and the learner's Blocks API (the round
 * trip). Each create/rename/publish action **waits for the xblock write it
 * triggers** and, where the platform's response names the new block, returns its
 * usage key — so the spec never guesses which block it just made.
 *
 * Cards carry no usage key in their markup, so a card is located either by the
 * usage key in a contained unit's title-link `href` ({@link section},
 * {@link subsection}, {@link unit}) or, while building fresh structure that has
 * no units yet, as the only/first card of its level.
 */
export class StudioCourseOutlinePage {
  readonly courseLockUp: Locator;
  readonly expandCollapseAllButton: Locator;
  readonly sectionCards: Locator;
  readonly subsectionCards: Locator;
  readonly unitCards: Locator;
  readonly emptyPlaceholder: Locator;
  readonly viewLiveLink: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    const s = STUDIO_OUTLINE_PAGE_SELECTORS;
    this.courseLockUp = page.locator(STUDIO_SHELL_SELECTORS.courseLockUp);
    this.expandCollapseAllButton = page.locator(s.expandCollapseAllButton);
    this.sectionCards = page.locator(s.sectionCard);
    this.subsectionCards = page.locator(s.subsectionCard);
    this.unitCards = page.locator(s.unitCard);
    this.emptyPlaceholder = page.locator(STUDIO_OUTLINE_SELECTORS.emptyPlaceholder);
    this.viewLiveLink = page.locator(s.viewLiveLink);
  }

  /** The Studio URL for a course; the platform redirects it to the MFE. */
  url(courseKey: string): string {
    return `${studioOrigin(this.config)}/course/${courseKey}`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.waitForCourse(courseKey);
  }

  /**
   * Waits until the outline for `courseKey` is on screen: the URL carries the key
   * and the header lock-up links back to this course.
   */
  async waitForCourse(courseKey: string): Promise<void> {
    await this.page.waitForURL((url) => url.pathname.includes(`/course/${courseKey}`));
    await this.courseLockUp.waitFor();
  }

  // --- Card locators -------------------------------------------------------

  /** The section card containing the unit with `unitUsageKey`. */
  section(unitUsageKey: string): Locator {
    return this.page.locator(sectionCardContaining(unitUsageKey));
  }

  /** The subsection card containing the unit with `unitUsageKey`. */
  subsection(unitUsageKey: string): Locator {
    return this.page.locator(subsectionCardContaining(unitUsageKey));
  }

  /** The unit card for `unitUsageKey`. */
  unit(unitUsageKey: string): Locator {
    return this.page.locator(unitCardFor(unitUsageKey));
  }

  // --- Expand / collapse ---------------------------------------------------

  /**
   * Drives the header's "Expand all" / "Collapse all" toggle so that sections'
   * children are shown (`expanded`) or hidden.
   *
   * The expand chevrons carry no `aria-expanded`, and the toggle's two labels are
   * localized, so the state is read structurally from whether subsection cards
   * are visible. The outline loads expanded, so this is usually a no-op for
   * `true`; a click that goes the wrong way is corrected by clicking again.
   */
  async setAllExpanded(expanded: boolean): Promise<void> {
    await this.sectionCards.first().waitFor();
    const inState = async () =>
      (await this.subsectionCards
        .first()
        .isVisible()
        .catch(() => false)) === expanded;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await inState()) return;
      await this.expandCollapseAllButton.click();
      try {
        await this.subsectionCards
          .first()
          .waitFor({ state: expanded ? 'visible' : 'hidden', timeout: 5000 });
        return;
      } catch {
        // Wrong direction or still settling; re-check and retry.
      }
    }
    throw new Error(`Could not ${expanded ? 'expand' : 'collapse'} the outline's sections.`);
  }

  /**
   * Ensures `card`'s children are visible before acting on them — clicks the
   * expand chevron only when the child container is hidden. The outline loads
   * expanded, so this is usually a no-op; a card with no children yet (a
   * just-created, empty subsection) shows its "New …" button without expanding.
   */
  private async expand(card: Locator, level: 'section' | 'subsection'): Promise<void> {
    const container = card
      .locator(
        level === 'section'
          ? STUDIO_OUTLINE_PAGE_SELECTORS.sectionSubsections
          : STUDIO_OUTLINE_PAGE_SELECTORS.subsectionUnits,
      )
      .first();
    await card.scrollIntoViewIfNeeded();
    if (await container.isVisible().catch(() => false)) return;
    const expandButton =
      level === 'section'
        ? STUDIO_OUTLINE_PAGE_SELECTORS.sectionExpandButton
        : STUDIO_OUTLINE_PAGE_SELECTORS.subsectionExpandButton;
    const button = card.locator(expandButton);
    if ((await button.count()) === 0) return;
    // In a large shared outline the click and its re-render lag, so wait for the
    // child container to actually appear rather than assume one click sufficed.
    await button.click();
    await container.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
  }

  // --- Creation ------------------------------------------------------------

  /**
   * Clicks "New section" and returns the new chapter's usage key. The section is
   * created with the platform's default name; {@link rename} names it.
   */
  async addSection(): Promise<string> {
    const button = this.page.locator(STUDIO_OUTLINE_PAGE_SELECTORS.newSectionButton).first();
    return this.createChild(button);
  }

  /**
   * Expands `sectionCard`, clicks its "New subsection", and returns the new
   * sequential's usage key. Reliable while the section has no subsections yet
   * (the button is then the first in its container); pass the section that was
   * just created.
   */
  async addSubsection(sectionCard: Locator): Promise<string> {
    await this.expand(sectionCard, 'section');
    const button = sectionCard
      .locator(STUDIO_OUTLINE_PAGE_SELECTORS.sectionSubsections)
      .locator(STUDIO_OUTLINE_PAGE_SELECTORS.addChildButton)
      .first();
    return this.createChild(button);
  }

  /**
   * Expands `subsectionCard`, clicks its "New unit", and returns the new
   * vertical's usage key.
   *
   * Unlike "New section" / "New subsection" (which stay on the outline), "New
   * unit" **navigates to the new unit's page**, so this waits for that URL and
   * reads the key from it rather than from the create response (which the
   * navigation races). The caller is left on the unit page; return to the outline
   * with {@link goto} to continue there.
   */
  async addUnit(subsectionCard: Locator): Promise<string> {
    await this.expand(subsectionCard, 'subsection');
    const button = subsectionCard
      .locator(STUDIO_OUTLINE_PAGE_SELECTORS.subsectionUnits)
      .locator(STUDIO_OUTLINE_PAGE_SELECTORS.addChildButton)
      .first();
    await button.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    const unitKeyPattern = /container\/(block-v1:[^/?#]*type@vertical[^/?#]+)/;
    await Promise.all([this.page.waitForURL(unitKeyPattern), button.click()]);
    const key = unitKeyPattern.exec(this.page.url())?.[1];
    if (key === undefined) {
      throw new Error(`Creating a unit did not land on a unit page: ${this.page.url()}`);
    }
    return decodeURIComponent(key);
  }

  private async createChild(button: Locator): Promise<string> {
    await button.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    // Paste stages the copied OLX under the new parent, which is slower than a
    // plain create under load, so allow the settings-save budget.
    const response = await waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().endsWith(XBLOCK_PATH),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => button.click(),
    );
    return locatorFromResponse(response);
  }

  // --- Rename --------------------------------------------------------------

  /**
   * Renames a card to `name`: opens its inline edit field, replaces the text and
   * commits with Enter, then waits for the metadata write. `card` is a
   * level-appropriate locator (from {@link section} / {@link subsection} /
   * {@link unit}, or the `*Cards` collections).
   */
  async rename(card: Locator, level: OutlineLevel, name: string): Promise<void> {
    // The edit field renders in a portal outside the card's DOM subtree, so it is
    // located at page scope; only one card is ever in edit mode at a time.
    const field = this.page.locator(EDIT_FIELD[level]);
    // A just-created card can open in edit mode already; clicking the pencil then
    // would toggle the field shut. Only click it when the field is not open.
    if (!(await field.isVisible().catch(() => false))) {
      await card.locator(EDIT_BUTTON[level]).click();
    }
    await field.waitFor();
    await field.fill(name);
    await waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => new RegExp(`${XBLOCK_PATH}block-v1:`).test(r.url()),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => field.press('Enter'),
    );
  }

  // --- Menu actions --------------------------------------------------------

  private async openMenu(card: Locator, level: OutlineLevel): Promise<void> {
    await card.locator(MENU_BUTTON[level]).click();
  }

  /**
   * Publishes a card through its 3-dot menu (Publish item), waiting for the
   * publish write. Use for a subsection or section (which publish their
   * children); a unit publishes the same way.
   */
  async publish(card: Locator, level: OutlineLevel): Promise<void> {
    await this.openMenu(card, level);
    // Menu items render one per card of this level; scope to the card.
    await card.locator(outlineMenuItem(level, 'publish')).click();
    // The menu item opens a confirmation dialog; its primary button is what
    // actually fires the publish write.
    const confirm = this.page.locator(STUDIO_OUTLINE_PAGE_SELECTORS.dialogPrimaryButton);
    await waitForWrite(
      this.page,
      {
        method: ['POST', 'PATCH'],
        predicate: (r) => new RegExp(`${XBLOCK_PATH}block-v1:`).test(r.url()),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => confirm.click(),
    );
  }

  /** Whether a card's menu offers an enabled Publish item (there are unpublished changes). */
  async canPublish(card: Locator, level: OutlineLevel): Promise<boolean> {
    await this.openMenu(card, level);
    const item = card.locator(outlineMenuItem(level, 'publish'));
    const disabled = await item.getAttribute('aria-disabled');
    await this.page.keyboard.press('Escape');
    return disabled !== 'true';
  }

  /**
   * Duplicates a card through its 3-dot menu (Duplicate item) and returns the new
   * block's usage key from the `POST /xblock/` the platform makes. The copy is
   * inserted next to the source under the same parent.
   */
  async duplicate(card: Locator, level: OutlineLevel): Promise<string> {
    await this.openMenu(card, level);
    const response = await waitForWrite(
      this.page,
      { method: 'POST', predicate: (r) => r.url().endsWith(XBLOCK_PATH) },
      () => card.locator(outlineMenuItem(level, 'duplicate')).click(),
    );
    return locatorFromResponse(response);
  }

  /**
   * Deletes a card through its 3-dot menu (Delete item) and confirms the delete
   * dialog, waiting for the `DELETE /xblock/<key>`.
   */
  async delete(card: Locator, level: OutlineLevel): Promise<void> {
    await this.openMenu(card, level);
    await card.locator(outlineMenuItem(level, 'delete')).click();
    const confirm = this.page.locator(STUDIO_OUTLINE_PAGE_SELECTORS.dialogDangerButton);
    await waitForWrite(
      this.page,
      {
        method: 'DELETE',
        predicate: (r) => new RegExp(`${XBLOCK_PATH}block-v1:`).test(r.url()),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => confirm.click(),
    );
  }

  /**
   * Moves a card down (or up) one position among its siblings through its 3-dot
   * menu, waiting for the reorder write (`PUT /xblock/<parent> {children}`). The
   * deterministic counterpart to {@link reorderByKeyboard}: both send the same
   * request.
   */
  async move(card: Locator, level: OutlineLevel, direction: 'up' | 'down'): Promise<void> {
    await this.openMenu(card, level);
    const item = card.locator(outlineMenuItem(level, direction === 'up' ? 'moveUp' : 'moveDown'));
    await waitForWrite(
      this.page,
      {
        method: 'PUT',
        predicate: (r) => new RegExp(`${XBLOCK_PATH}block-v1:`).test(r.url()),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => item.click(),
    );
  }

  /**
   * Copies a unit to the clipboard through its outline 3-dot menu's "Copy to
   * clipboard" item, waiting for the content-staging write. The item is the unit
   * menu's only entry with no test id (so it is anchored as such).
   */
  async copyUnitToClipboard(unitCard: Locator): Promise<void> {
    await this.openMenu(unitCard, 'unit');
    await waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().endsWith(CLIPBOARD_PATH),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => this.page.locator(STUDIO_OUTLINE_PAGE_SELECTORS.copyToClipboardItem).click(),
    );
  }

  /**
   * Pastes the unit currently on the clipboard into `subsectionCard`, via the
   * outline's "Paste unit" button (which appears only while the clipboard holds a
   * unit), and returns the new unit's usage key. The copy is staged beforehand
   * through the content-staging API (`copyToClipboard`); this release's outline
   * 3-dot menu has no Copy item — that lives on the unit page (TC-00204).
   */
  async pasteUnit(subsectionCard: Locator): Promise<string> {
    await this.expand(subsectionCard, 'subsection');
    // The "Paste unit" button is the last add button in the units container,
    // present only while the clipboard holds a unit (New unit, Use … from
    // library, then Paste unit). No test id distinguishes it, so it is the last.
    const button = subsectionCard
      .locator(STUDIO_OUTLINE_PAGE_SELECTORS.subsectionUnits)
      .locator(STUDIO_OUTLINE_PAGE_SELECTORS.addChildButton)
      .last();
    await button.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    // Paste stages the copied OLX under the new parent, which is slower than a
    // plain create under load, so allow the settings-save budget.
    const response = await waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (r) => r.url().endsWith(XBLOCK_PATH),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => button.click(),
    );
    return locatorFromResponse(response);
  }

  /**
   * Clicks a card's "View live" link and returns the LMS tab it opens, for the
   * spec to judge its URL. The outline header also carries a course-level "View
   * live"; pass a card to use that card's link, or omit for the header's.
   */
  async viewLive(card?: Locator): Promise<Page> {
    const link = (card ?? this.page).locator(STUDIO_OUTLINE_PAGE_SELECTORS.viewLiveLink).first();
    const [tab] = await Promise.all([this.page.context().waitForEvent('page'), link.click()]);
    await tab.waitForLoadState('domcontentloaded');
    return tab;
  }
}

/**
 * The usage key an xblock create/duplicate response names. The legacy handler
 * answers `{locator}`; a create that instead bounced to a login page (a decayed
 * Studio session) has no JSON and is surfaced with the body prefix.
 */
async function locatorFromResponse(response: Response): Promise<string> {
  const text = await response.text();
  let body: { locator?: string };
  try {
    body = JSON.parse(text) as { locator?: string };
  } catch {
    throw new Error(
      `Creating an outline block returned HTTP ${response.status()} with a non-JSON body ` +
        `(${text.slice(0, 120).replace(/\s+/g, ' ')}). The Studio session may have decayed.`,
    );
  }
  if (typeof body.locator !== 'string') {
    throw new Error(`Creating an outline block returned no locator: ${text.slice(0, 200)}`);
  }
  return body.locator;
}
