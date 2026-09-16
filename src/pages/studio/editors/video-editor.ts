import type { Locator, Page } from '@playwright/test';

import { STUDIO_EDITOR_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { XBLOCK_PATH } from '../../../api';
import { waitForWrite } from '../wait-for-write';

/**
 * The video component editor the MFE opens after the "Video" add-component tile.
 * Single-surface actions only; the spec asserts on the saved block metadata.
 */
export class StudioVideoEditor {
  private readonly s = STUDIO_EDITOR_SELECTORS;
  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    void this.config;
  }

  /** Sets the video's source URL (e.g. a YouTube watch URL) in the Video source field. */
  async setVideoUrl(url: string): Promise<void> {
    const inputs = this.page.locator(this.s.videoUrlInput);
    await inputs.first().waitFor();
    // "Video ID" is the first field, "Video URL" the second; fill the URL one.
    const urlField = (await inputs.count()) > 1 ? inputs.nth(1) : inputs.first();
    await urlField.fill(url);
    await urlField.press('Tab');
  }

  /** Toggles "Allow video downloads" (an advanced setting). */
  async setAllowDownloads(allow: boolean): Promise<void> {
    const checkbox = this.page.locator(this.s.videoDownloadCheckbox).first();
    if ((await checkbox.isChecked()) !== allow) await checkbox.setChecked(allow);
  }

  /** Saves the editor, waiting for the `POST /xblock/<video>` it triggers. */
  async save(): Promise<void> {
    await waitForWrite(
      this.page,
      {
        method: 'POST',
        urlIncludes: `${XBLOCK_PATH}block-v1:`,
        timeout: TIMEOUTS.xblockEditorSave,
      },
      () => this.saveButton().click(),
    );
  }

  saveButton(): Locator {
    return this.page.locator(this.s.saveButton);
  }

  /** Sets the Duration widget's start and stop times (`hh:mm:ss`). */
  async setStartAndStopTimes(start: string, stop: string): Promise<void> {
    const inputs = this.page.locator(this.s.videoDurationInput);
    await inputs.first().waitFor();
    await inputs.nth(0).fill(start);
    await inputs.nth(0).press('Tab');
    await inputs.nth(1).fill(stop);
    await inputs.nth(1).press('Tab');
  }

  /**
   * Adds a transcript through the Transcripts widget: "Add a transcript", then
   * the `.srt` file input it reveals. The file is handed over as a buffer, so
   * no fixture file is needed.
   */
  async addTranscript(fileName: string, srt: string): Promise<void> {
    await this.page.locator(this.s.videoAddTranscriptButton).first().click();
    const input = this.page.locator(this.s.videoTranscriptFileInput).first();
    await input.waitFor({ state: 'attached' });
    await input.setInputFiles({
      name: fileName,
      mimeType: 'application/x-subrip',
      buffer: Buffer.from(srt),
    });
  }
}
