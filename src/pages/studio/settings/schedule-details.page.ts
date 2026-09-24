import type { Locator, Page } from '@playwright/test';

import {
  STUDIO_SCHEDULE_DETAILS_SELECTORS,
  STUDIO_SETTINGS_SAVE_BAR_SELECTORS,
  TIMEOUTS,
  type AppConfig,
} from '../../../config';
import { studioOrigin } from '../../../api';
import { isSettingsWrite, waitForWrite } from '../wait-for-write';

/** A UTC instant split the way the page's paired date and time fields take it. */
export interface DateTimeFields {
  /** `MM/DD/YYYY`. */
  readonly date: string;
  /** `HH:MM`, 24-hour. */
  readonly time: string;
}

/**
 * Splits an ISO instant into the page's `MM/DD/YYYY` and `HH:MM` fields, in UTC —
 * which is what the page reads and writes (its help text says so, and the saved
 * value comes back as a `Z` timestamp).
 */
export function toDateTimeFields(instant: Date): DateTimeFields {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${pad(instant.getUTCMonth() + 1)}/${pad(instant.getUTCDate())}/${instant.getUTCFullYear()}`,
    time: `${pad(instant.getUTCHours())}:${pad(instant.getUTCMinutes())}`,
  };
}

/**
 * Schedule & Details in the authoring MFE (`/settings/details/<key>` on Studio,
 * redirected to the MFE). Locators and single-surface actions; the spec asserts,
 * against `fetchCourseDetails` and the LMS course APIs.
 *
 * Every edit surfaces the save bar; `save()` submits it and returns the status
 * of the `PUT course_details` it causes, so the spec judges the save before
 * reading the result back.
 */
export class StudioScheduleDetailsPage {
  readonly instructorPacedRadio: Locator;
  readonly selfPacedRadio: Locator;
  readonly startDate: Locator;
  readonly startTime: Locator;
  readonly endDate: Locator;
  readonly endTime: Locator;
  readonly enrollmentStartDate: Locator;
  readonly enrollmentStartTime: Locator;
  readonly enrollmentEndDate: Locator;
  readonly enrollmentEndTime: Locator;
  readonly certificateAvailableDate: Locator;
  readonly certificateBehaviorDropdown: Locator;
  readonly courseImageFileInput: Locator;
  readonly courseImagePath: Locator;
  readonly introVideoId: Locator;
  readonly introVideoFrame: Locator;
  readonly deleteIntroVideoButton: Locator;
  readonly effort: Locator;
  readonly prerequisiteDropdown: Locator;
  readonly saveBar: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    const s = STUDIO_SCHEDULE_DETAILS_SELECTORS;
    const bar = STUDIO_SETTINGS_SAVE_BAR_SELECTORS;
    this.instructorPacedRadio = page.locator(s.instructorPacedRadio);
    this.selfPacedRadio = page.locator(s.selfPacedRadio);
    this.startDate = page.locator(s.startDate);
    this.startTime = page.locator(s.startTime);
    this.endDate = page.locator(s.endDate);
    this.endTime = page.locator(s.endTime);
    this.enrollmentStartDate = page.locator(s.enrollmentStartDate);
    this.enrollmentStartTime = page.locator(s.enrollmentStartTime);
    this.enrollmentEndDate = page.locator(s.enrollmentEndDate);
    this.enrollmentEndTime = page.locator(s.enrollmentEndTime);
    this.certificateAvailableDate = page.locator(s.certificateAvailableDate);
    this.certificateBehaviorDropdown = page.locator(s.certificateBehaviorDropdown);
    this.courseImageFileInput = page.locator(s.courseImageFileInput);
    this.courseImagePath = page.locator(s.courseImagePath);
    this.introVideoId = page.locator(s.introVideoId);
    this.introVideoFrame = page.locator(s.introVideoFrame);
    this.deleteIntroVideoButton = page.locator(s.deleteIntroVideoButton);
    this.effort = page.locator(s.effort);
    this.prerequisiteDropdown = page.locator(s.prerequisiteDropdown);
    this.saveBar = page.locator(bar.bar);
    this.saveButton = page.locator(bar.saveButton);
    this.cancelButton = page.locator(bar.cancelButton);
  }

  /** The Studio URL an author types; the platform redirects it to the MFE. */
  url(courseKey: string): string {
    return `${studioOrigin(this.config)}/settings/details/${courseKey}`;
  }

  async goto(courseKey: string): Promise<void> {
    await this.page.goto(this.url(courseKey));
    // The pacing radios render only once the details have loaded.
    await this.instructorPacedRadio.waitFor();
  }

  /** Picks a pacing; the radios are Paragon's, so the click lands on the input. */
  async setPacing(pacing: 'instructor' | 'self'): Promise<void> {
    await (pacing === 'self' ? this.selfPacedRadio : this.instructorPacedRadio).check();
  }

  /**
   * Fills a paired date/time control. The date field is a plain text input behind
   * a `react-datepicker` calendar that opens on focus; the value is typed and
   * committed there (see {@link commitDate}), then the time is filled.
   */
  private async fillDateTime(date: Locator, time: Locator, value: DateTimeFields): Promise<void> {
    await this.commitDate(date, value.date);
    await time.fill(value.time);
    await time.press('Tab');
  }

  /** Clears a paired date/time control (`null` on the API). */
  private async clearDateTime(date: Locator, time: Locator): Promise<void> {
    await time.fill('');
    await time.press('Tab');
    await this.commitDate(date, '');
  }

  /**
   * Sets a `react-datepicker` date field to `value` (empty to clear).
   *
   * Types the value and commits it with Enter, which closes the calendar (Tab and
   * Escape do not). The commit matters twice over: it is what updates the form
   * model the save reads, and it is asynchronous, so a save clicked before it
   * lands sends the field's *previous* value — a race that surfaces only under
   * load. Waiting for the calendar to detach after Enter is that commit's own DOM
   * signal, so the field's value has reached the model before anything saves.
   * Retries the whole entry so a keystroke lost to the calendar's re-render heals.
   */
  private async commitDate(date: Locator, value: string): Promise<void> {
    const calendar = this.page.locator('.react-datepicker');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await date.click();
      await date.press('ControlOrMeta+a');
      await date.press('Delete');
      if (value) await date.pressSequentially(value);
      await date.press('Enter');
      await calendar.waitFor({ state: 'detached' }).catch(() => {});
      if ((await date.inputValue()) === value) return;
    }
    throw new Error(`The date field did not settle on "${value}" after three attempts.`);
  }

  async setCourseStart(value: DateTimeFields): Promise<void> {
    await this.fillDateTime(this.startDate, this.startTime, value);
  }

  async setCourseEnd(value: DateTimeFields | null): Promise<void> {
    await (value
      ? this.fillDateTime(this.endDate, this.endTime, value)
      : this.clearDateTime(this.endDate, this.endTime));
  }

  async setEnrollmentStart(value: DateTimeFields | null): Promise<void> {
    await (value
      ? this.fillDateTime(this.enrollmentStartDate, this.enrollmentStartTime, value)
      : this.clearDateTime(this.enrollmentStartDate, this.enrollmentStartTime));
  }

  async setEnrollmentEnd(value: DateTimeFields | null): Promise<void> {
    await (value
      ? this.fillDateTime(this.enrollmentEndDate, this.enrollmentEndTime, value)
      : this.clearDateTime(this.enrollmentEndDate, this.enrollmentEndTime));
  }

  /**
   * Replaces the course overview's HTML through its editor's "Source code"
   * dialog (the toolbar's overflow drawer first, where it is folded away), and
   * waits for the dialog to apply it. The page's own Save still has to follow.
   */
  async setOverviewSource(html: string): Promise<void> {
    const s = STUDIO_SCHEDULE_DETAILS_SELECTORS;
    const source = this.page.locator(s.overviewSourceButton);
    await this.page.locator(s.overviewToolbarOverflow).or(source).first().waitFor();
    if (!(await source.isVisible())) await this.page.locator(s.overviewToolbarOverflow).click();
    await source.click();
    const dialog = this.page.locator(s.overviewSourceDialog);
    await dialog.locator(s.overviewSourceEditor).fill(html);
    await dialog.locator(s.overviewSourceApply).click();
    await dialog.waitFor({ state: 'detached' });
  }

  /**
   * Picks the certificates display behaviour. The dropdown's items carry no
   * value and their labels are localized, but the authoring MFE always lists
   * them in the same order (`CertificateDisplayRow`'s options), so an item is
   * chosen by its place in that order.
   */
  async chooseCertificateDisplayBehavior(behavior: CertificateDisplayBehavior): Promise<void> {
    await this.certificateBehaviorDropdown.click();
    await this.page
      .locator('.dropdown-menu.show .dropdown-item')
      .nth(CERTIFICATE_DISPLAY_BEHAVIORS.indexOf(behavior))
      .click();
  }

  /** Sets the certificate available date (`MM/DD/YYYY`; the field has no time). */
  async setCertificateAvailableDate(date: string): Promise<void> {
    await this.commitDate(this.certificateAvailableDate, date);
  }

  /**
   * Uploads a course card image through the drop zone and waits for the asset
   * upload it triggers, after which the path field carries the new asset.
   */
  async uploadCourseImage(file: {
    name: string;
    mimeType: string;
    buffer: Buffer;
  }): Promise<{ status: number }> {
    const response = await waitForWrite(
      this.page,
      { method: 'POST', urlIncludes: '/assets/' },
      () => this.courseImageFileInput.setInputFiles(file),
    );
    return { status: response.status() };
  }

  async setIntroVideoId(videoId: string): Promise<void> {
    await this.introVideoId.fill(videoId);
    await this.introVideoId.press('Tab');
  }

  async setEffort(effort: string): Promise<void> {
    await this.effort.fill(effort);
    await this.effort.press('Tab');
  }

  /** The prerequisite dropdown's entries; the first is the "none" choice. */
  prerequisiteOptions(): Locator {
    return this.page.locator(STUDIO_SCHEDULE_DETAILS_SELECTORS.dropdownItem);
  }

  /**
   * Opens the prerequisite dropdown and picks the entry at `index` (0 is the
   * "none" choice; the rest are the courses the session may choose, in the
   * order the MFE lists them).
   */
  async choosePrerequisite(index: number): Promise<void> {
    await this.prerequisiteDropdown.click();
    await this.prerequisiteOptions().nth(index).click();
  }

  /**
   * Presses "Save changes" and returns the status of the resulting details-save
   * write, which is what decides whether the save took.
   */
  async save(): Promise<{ status: number }> {
    // The save bar and its stateful button mount together when a field changes;
    // wait for the button before clicking so the click cannot miss it, and give
    // the write a budget above `action` for a busy shared CMS.
    await this.saveButton.waitFor({ state: 'visible' });
    const response = await waitForWrite(
      this.page,
      {
        // The details-save endpoint drifts by version across releases: `main`'s
        // authoring MFE PUTs `.../v3/course_details/<key>/`, older releases PUT
        // `.../v1/course_details/<key>`. Match the resource with any write method
        // (the wait is scoped to this page's own course). See `STUDIO-009`.
        predicate: (r) => isSettingsWrite(r) && r.url().includes('/course_details/'),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => this.saveButton.click(),
    );
    return { status: response.status() };
  }

  /** Presses "Cancel" on the save bar, reverting unsaved edits. */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}

/** The certificates display behaviours, in the order the authoring MFE lists them. */
export const CERTIFICATE_DISPLAY_BEHAVIORS = ['early_no_info', 'end', 'end_with_date'] as const;
export type CertificateDisplayBehavior = (typeof CERTIFICATE_DISPLAY_BEHAVIORS)[number];
