import type { Locator, Page } from '@playwright/test';

import { STUDIO_IMPORT_SELECTORS, STUDIO_STEPPER_STATE, type AppConfig } from '../../../config';
import { studioOrigin } from '../../../api';

/**
 * Course Import in the authoring MFE (`/import/<key>` on Studio, redirected to
 * the MFE). Dropping an OLX tarball on the dropzone starts the MFE's own chunked
 * multipart upload to `/import/<key>`, then a CMS-worker task unpacks it while
 * the page steps a progress bar. The spec decides the outcome against the
 * import-status API (`waitForCourseImport`); this page performs the upload (the
 * write path being verified) and exposes the rendered progress.
 */
export class StudioImportPage {
  readonly page: Page;
  readonly fileInput: Locator;
  readonly steps: Locator;
  readonly successButton: Locator;

  constructor(
    page: Page,
    private readonly config: AppConfig,
  ) {
    this.page = page;
    const s = STUDIO_IMPORT_SELECTORS;
    this.fileInput = page.locator(s.fileInput);
    this.steps = page.locator(s.step);
    this.successButton = page.locator(s.successButton);
  }

  url(courseKey: string): string {
    return `${studioOrigin(this.config)}/import/${courseKey}`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    await this.page.locator(STUDIO_IMPORT_SELECTORS.page).waitFor();
  }

  /**
   * Uploads an OLX tarball by handing its bytes to the dropzone's file input, so
   * the MFE runs its real chunked upload. The `name` must end in `.tar.gz` — the
   * dropzone accepts only that, and the import task is keyed on it.
   */
  async uploadArchive(name: string, buffer: Buffer): Promise<void> {
    await this.fileInput.setInputFiles({
      name,
      mimeType: 'application/gzip',
      buffer,
    });
  }

  /** Whether the last progress step shows as done — the page's success signal. */
  async lastStepDone(): Promise<boolean> {
    const cls = (await this.steps.last().getAttribute('class')) ?? '';
    return cls.split(/\s+/).includes(STUDIO_STEPPER_STATE.done);
  }
}
