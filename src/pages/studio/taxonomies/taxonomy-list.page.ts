import type { Download, Locator, Page } from '@playwright/test';

import { TAXONOMY_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import type { ImportableTaxonomyType } from '../../../api';
import { ImportWizardBlock, importedTaxonomyId, type ImportFile } from './import-wizard.block';
import { menuItemTestIds, waitForCompetencyRoute } from './menu';

/**
 * The taxonomy list page (`/taxonomies`) — staff only. Drives the new-taxonomy
 * import wizard, the template downloads and navigation into a taxonomy's detail
 * page. The URL is built from the configured authoring MFE mount
 * (`config.mfeUrls.authoring`).
 *
 * Locators and single actions only; the spec asserts against the content-tagging
 * API (the new taxonomy's tags), the download events and the author's drawer.
 */
export class TaxonomyListPage {
  private readonly s = TAXONOMY_SELECTORS;
  readonly importButton: Locator;
  readonly templateToggle: Locator;
  /** The new-taxonomy import wizard the Import button opens. */
  readonly wizard: ImportWizardBlock;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.importButton = page.locator(this.s.importButton);
    this.templateToggle = page.locator(this.s.templateToggle);
    this.wizard = new ImportWizardBlock(page);
  }

  /**
   * Opens the taxonomy list (`/taxonomies`). A cold load of the route occasionally
   * settles on Studio home before the router registers the tagging routes, so this
   * reloads once if the Import button has not appeared, which the router has by
   * then registered.
   */
  async goto(): Promise<void> {
    const url = `${this.config.mfeUrls.authoring}/taxonomies`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    const appeared = await this.importButton
      .waitFor({ timeout: TIMEOUTS.action })
      .then(() => true)
      .catch(() => false);
    if (!appeared) {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await this.importButton.waitFor();
    }
  }

  /** Every taxonomy card on the list page. */
  get cards(): Locator {
    return this.page.locator(this.s.cardAny);
  }

  /** A taxonomy's card on the list page, by id. */
  card(id: number): Locator {
    return this.page.locator(this.s.card(id));
  }

  /** The icons of the given type on one taxonomy's card. */
  cardTypeIcon(id: number, type: ImportableTaxonomyType): Locator {
    return this.card(id).locator(this.s.typeIcon(type));
  }

  /** Every type icon inside one taxonomy's card (a card holds exactly one). */
  cardTypeIcons(id: number): Locator {
    return this.card(id).locator(this.s.anyTypeIcon);
  }

  /**
   * Reads every card on the page in one browser call: its link (`href`) and how
   * many type icons it holds. One read, so cards that another test adds or
   * deletes meanwhile cannot make the card list and the icon counts disagree.
   */
  async cardIconCounts(): Promise<{ card: string; icons: number }[]> {
    return this.cards.evaluateAll(
      (cards, iconSelector) =>
        cards.map((card) => ({
          card: card.getAttribute('href') ?? '',
          icons: card.querySelectorAll(iconSelector).length,
        })),
      this.s.anyTypeIcon,
    );
  }

  /** A card's own menu toggle (the three-dot button). */
  private cardMenuButton(id: number): Locator {
    return this.card(id).locator(this.s.menuButton);
  }

  /** The items of one card's open menu, in DOM order. */
  cardMenuItems(id: number): Locator {
    return this.card(id).locator(this.s.menuItems);
  }

  /** The footer of one card (present only for a Competency taxonomy the user may tag with). */
  cardFooter(id: number): Locator {
    return this.card(id).locator(this.s.cardFooter);
  }

  /** The one button in a card's footer. */
  cardFooterButton(id: number): Locator {
    return this.card(id).locator(this.s.cardFooterButton);
  }

  /**
   * Opens one card's menu and waits for it. Leaves an already open menu open,
   * because the toggle would close it.
   */
  async openCardMenu(id: number): Promise<void> {
    const toggle = this.cardMenuButton(id);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await this.card(id).locator(this.s.menu).waitFor();
  }

  /** Reads the `data-testid` of every item in one card's open menu, in DOM order. */
  async cardMenuItemIds(id: number): Promise<string[]> {
    return menuItemTestIds(this.cardMenuItems(id));
  }

  /**
   * Chooses "Apply Competencies" in a card's menu and waits for the Competency
   * Management route.
   */
  async applyFromMenu(id: number): Promise<void> {
    await this.openCardMenu(id);
    await this.card(id).locator(this.s.menuApplyCompetencies).click();
    await waitForCompetencyRoute(this.page);
  }

  /** Clicks the "Apply Competencies" button in a card's footer and waits for the same route. */
  async applyFromFooter(id: number): Promise<void> {
    await this.cardFooterButton(id).click();
    await waitForCompetencyRoute(this.page);
  }

  /** Clicks the card's body, outside its menu and footer, and waits for the taxonomy page. */
  async openCard(id: number): Promise<void> {
    await this.card(id).locator(this.s.cardBody).click();
    // `verawood` routes to `/taxonomy/<id>/`, `main` without the trailing slash.
    await this.page.waitForURL((url) => new RegExp(`/taxonomy/${id}/?$`).test(url.pathname), {
      timeout: TIMEOUTS.navigation,
    });
  }

  /**
   * Opens the import wizard, drops `file` and advances upload → populate. Leaves
   * the wizard on the populate step.
   */
  async openImportToPopulate(file: ImportFile): Promise<void> {
    await this.importButton.click();
    await this.wizard.waitForUpload();
    await this.wizard.uploadToPopulate(file);
  }

  /**
   * Imports a new taxonomy from `file`, naming it `name` and, when `type` is
   * given, choosing that Taxonomy Type. Returns the created taxonomy's id from the
   * `POST import/` response.
   */
  async importNewTaxonomy(
    file: ImportFile,
    name: string,
    type?: ImportableTaxonomyType,
  ): Promise<number> {
    await this.openImportToPopulate(file);
    await this.wizard.fillPopulate(name, { type });
    return importedTaxonomyId(await this.wizard.submitImport());
  }

  /** Downloads an import template, returning the browser download event. */
  async downloadTemplate(format: 'csv' | 'json'): Promise<Download> {
    await this.templateToggle.click();
    const item = this.page.locator(format === 'csv' ? this.s.templateCsv : this.s.templateJson);
    const [download] = await Promise.all([this.page.waitForEvent('download'), item.click()]);
    return download;
  }
}
