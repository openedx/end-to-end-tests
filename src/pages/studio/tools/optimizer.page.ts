import type { Locator, Page, Response } from '@playwright/test';

import { STUDIO_OPTIMIZER_SELECTORS, type AppConfig } from '../../../config';
import { studioOrigin } from '../../../api';
import { authoringCourseBaseUrl } from '../authoring-base';
import { waitForWrite } from '../wait-for-write';

/**
 * The Course Optimizer in the authoring MFE (`<course base>/optimizer`), which
 * scans a course for broken links. Studio has no alias for it and the course
 * header links to it only behind a waffle flag, so it is reached by URL. Locators
 * and single-surface actions; the spec decides the outcome against
 * `fetchLinkCheck`, the platform's own reading of the check.
 */
export class StudioOptimizerPage {
  readonly page: Page;
  readonly scanButton: Locator;
  readonly resultSections: Locator;

  constructor(
    page: Page,
    private readonly config: AppConfig,
  ) {
    this.page = page;
    const s = STUDIO_OPTIMIZER_SELECTORS;
    this.scanButton = page.locator(s.scanButton);
    this.resultSections = page.locator(s.resultSection);
  }

  async goto(courseKey: string): Promise<void> {
    const base = await authoringCourseBaseUrl(this.page, this.config, courseKey);
    await this.page.goto(`${base}/optimizer`);
    await this.page.locator(STUDIO_OPTIMIZER_SELECTORS.page).waitFor();
  }

  /**
   * Presses "Scan course" and returns Studio's answer to the request that queues
   * the check: the one write the page sends to Studio for this course, whatever
   * API generation the MFE build uses.
   */
  async scan(courseKey: string): Promise<Response> {
    await this.scanButton.waitFor();
    return waitForWrite(
      this.page,
      {
        method: 'POST',
        predicate: (response) =>
          response.url().startsWith(studioOrigin(this.config)) &&
          response.url().includes(courseKey),
      },
      () => this.scanButton.click(),
    );
  }

  /** The result section for the section titled `displayName` (the author's own title). */
  resultSection(displayName: string): Locator {
    return this.resultSections.filter({
      has: this.page.locator(STUDIO_OPTIMIZER_SELECTORS.resultSectionTitle, {
        hasText: displayName,
      }),
    });
  }

  /** Opens the result section titled `displayName`, revealing its flagged links. */
  async openResultSection(displayName: string): Promise<void> {
    await this.resultSection(displayName)
      .locator(STUDIO_OPTIMIZER_SELECTORS.resultSectionToggle)
      .click();
  }

  /**
   * The flagged link whose URL contains `fragment` inside the result section
   * titled `displayName`.
   */
  flaggedLink(displayName: string, fragment: string): Locator {
    return this.resultSection(displayName).locator(
      STUDIO_OPTIMIZER_SELECTORS.flaggedLink(fragment),
    );
  }
}
