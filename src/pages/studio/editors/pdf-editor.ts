import type { Page, Response } from '@playwright/test';

import {
  PDF_EDITOR_SELECTORS,
  STUDIO_EDITOR_SELECTORS,
  TIMEOUTS,
  type AppConfig,
} from '../../../config';
import { XBLOCK_PATH } from '../../../api';
import { waitForWrite } from '../wait-for-write';

/** A file the editor uploads: a name of the test's own and the bytes. */
export interface PdfFile {
  readonly name: string;
  readonly buffer: Buffer;
}

/**
 * The PDF component's editor (`PdfEditor`), which the MFE opens right after the
 * Advanced tile adds a PDF, and from the component's Edit. Choosing a file
 * uploads it to the course's Files at once; Save writes the block's fields.
 * Its labels are localized, so every control is anchored by id or name.
 */
export class StudioPdfEditor {
  private readonly s = PDF_EDITOR_SELECTORS;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    void this.config;
  }

  /**
   * Chooses the file the component shows — first time, or in place of the
   * current one ("Replace" opens the same input) — waiting for the upload to
   * the course's Files it causes. Returns that upload's response.
   */
  async chooseFile(file: PdfFile): Promise<Response> {
    const input = this.page.locator(this.s.fileInput);
    await input.waitFor({ state: 'attached', timeout: TIMEOUTS.navigation });
    return waitForWrite(
      this.page,
      { method: 'POST', urlIncludes: '/assets/', timeout: TIMEOUTS.studioSettingsSave },
      () => input.setInputFiles({ ...file, mimeType: 'application/pdf' }),
    );
  }

  async setAllowDownload(allowed: boolean): Promise<void> {
    await this.page.locator(this.s.allowDownload).setChecked(allowed);
  }

  async setSource(url: string, text: string): Promise<void> {
    await this.page.locator(this.s.sourceUrl).fill(url);
    await this.page.locator(this.s.sourceText).fill(text);
  }

  /** Saves, waiting for the block write (`POST /xblock/<pdf>`); returns its response. */
  async save(): Promise<Response> {
    const response = await waitForWrite(
      this.page,
      {
        method: 'POST',
        urlIncludes: `${XBLOCK_PATH}block-v1:`,
        timeout: TIMEOUTS.xblockEditorSave,
      },
      () => this.page.locator(STUDIO_EDITOR_SELECTORS.saveButton).click(),
    );
    await this.page
      .locator(STUDIO_EDITOR_SELECTORS.editorDialog)
      .waitFor({ state: 'detached', timeout: TIMEOUTS.navigation });
    return response;
  }
}
