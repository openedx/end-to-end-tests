import type { Locator, Page } from '@playwright/test';

import { STUDIO_EXPORT_SELECTORS, STUDIO_STEPPER_STATE, type AppConfig } from '../../../config';
import { EXPORT_PATH, studioOrigin } from '../../../api';

/**
 * Course Export in the authoring MFE (`/export/<key>` on Studio, redirected to
 * the MFE). Pressing "Export course content" starts a CMS-worker task and the
 * page steps a progress bar to completion, then reveals a download link. The
 * spec decides the outcome against the export-status API (`waitForCourseExport`);
 * this page drives the button and exposes the rendered progress and link.
 */
export class StudioExportPage {
  readonly page: Page;
  readonly startButton: Locator;
  readonly steps: Locator;
  readonly downloadLink: Locator;

  constructor(
    page: Page,
    private readonly config: AppConfig,
  ) {
    this.page = page;
    const s = STUDIO_EXPORT_SELECTORS;
    this.startButton = page.locator(s.startButton);
    this.steps = page.locator(s.step);
    this.downloadLink = page.locator(s.downloadLink);
  }

  url(courseKey: string): string {
    return `${studioOrigin(this.config)}/export/${courseKey}`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.page.locator(STUDIO_EXPORT_SELECTORS.page).waitFor();
    await this.startButton.waitFor();
  }

  /**
   * Presses "Export course content" and waits for the `POST /export` the button
   * fires, returning its status. The tarball is built asynchronously on the CMS
   * worker afterwards — poll `waitForCourseExport` for that.
   */
  async startExport(courseKey: string): Promise<{ status: number }> {
    const path = `${EXPORT_PATH}/${courseKey}`;
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().includes(path) && r.request().method() === 'POST'),
      this.startButton.click(),
    ]);
    return { status: response.status() };
  }

  /** Whether the last progress step shows as done — the page's success signal. */
  async lastStepDone(): Promise<boolean> {
    const last = this.steps.last();
    const cls = (await last.getAttribute('class')) ?? '';
    return cls.split(/\s+/).includes(STUDIO_STEPPER_STATE.done);
  }
}
