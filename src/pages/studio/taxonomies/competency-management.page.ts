import type { Locator, Page } from '@playwright/test';

import { TAXONOMY_SELECTORS, type AppConfig } from '../../../config';

/**
 * The Competency Management page (`/taxonomy/<id>/competencies`). Opening it by
 * URL has three outcomes (the page, a redirect to `/taxonomy/<id>`, the
 * connection-error alert), so `open` waits for none of them and the spec asserts
 * the one it expects.
 *
 * The id may be a string so a case can pass `abc` or a zero-padded id.
 */
export class CompetencyManagementPage {
  private readonly s = TAXONOMY_SELECTORS;
  /** The page's competency tree root. */
  readonly tree: Locator;
  /** The connection-error alert both this page and the taxonomy page show. */
  readonly errorAlert: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.tree = page.locator(this.s.competencyPage);
    this.errorAlert = page.locator(this.s.connectionError);
  }

  /** Opens `/taxonomy/<idSegment>/competencies` by URL without waiting for an outcome. */
  async open(idSegment: number | string): Promise<void> {
    await this.page.goto(`${this.config.mfeUrls.authoring}/taxonomy/${idSegment}/competencies`, {
      waitUntil: 'domcontentloaded',
    });
  }
}
