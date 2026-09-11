import type { Locator, Page } from '@playwright/test';

import {
  STUDIO_OUTLINE_PAGE_SELECTORS,
  TIMEOUTS,
  outlineMenuItem,
  type AppConfig,
} from '../../config';
import { XBLOCK_PATH } from '../../api';
import { waitForWrite } from './wait-for-write';

type OutlineLevel = 'section' | 'subsection' | 'unit';

const MENU_BUTTON: Record<OutlineLevel, string> = {
  section: STUDIO_OUTLINE_PAGE_SELECTORS.sectionMenuButton,
  subsection: STUDIO_OUTLINE_PAGE_SELECTORS.subsectionMenuButton,
  unit: STUDIO_OUTLINE_PAGE_SELECTORS.unitMenuButton,
};

/**
 * The "Configure" dialog an author opens from an outline card's menu — where
 * release dates, visibility, grading and subsection prerequisites are set.
 *
 * One dialog is open at a time, so its controls are page-scoped. Locators and
 * single-surface actions only; the spec asserts, against `xblock/outline` and
 * the learner's readings. {@link save} waits for the `PATCH /xblock/<key>` the
 * dialog's Save triggers, so the spec judges the write before reading it back.
 *
 * Tab positions (labels are localized, so tabs are chosen by index): Basic 0,
 * Visibility 1, and — for a subsection — Advanced 2; a unit's dialog is tab-less.
 */
export class StudioOutlineConfigureDialog {
  private readonly s = STUDIO_OUTLINE_PAGE_SELECTORS;
  readonly modal: Locator;
  readonly saveButton: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    void this.config;
    this.modal = page.locator(this.s.configureModal);
    this.saveButton = page.locator(this.s.configureSaveButton);
  }

  /** Opens the Configure dialog for a card and waits for it to render. */
  async open(card: Locator, level: OutlineLevel): Promise<void> {
    await card.locator(MENU_BUTTON[level]).click();
    // Menu items render inside each card's own menu container (hidden until
    // open), so scope to the card — the page holds one per card of this level.
    await card.locator(outlineMenuItem(level, 'configure')).click();
    await this.modal.waitFor();
  }

  private tab(index: number): Locator {
    return this.page.locator(this.s.configureTab).nth(index);
  }

  private async openTab(index: number): Promise<void> {
    await this.tab(index).click();
  }

  // --- Release date (Basic tab) --------------------------------------------

  /**
   * Sets the release date/time from an ISO instant, scoped inside the release
   * date stack (a subsection's dialog has an identically-named due-date stack).
   * The date field is a react-datepicker committed with Enter, as on Schedule &
   * Details.
   */
  async setReleaseDate(isoInstant: string): Promise<void> {
    const when = new Date(isoInstant);
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${pad(when.getUTCMonth() + 1)}/${pad(when.getUTCDate())}/${when.getUTCFullYear()}`;
    const time = `${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}`;
    const stack = this.page.locator(this.s.releaseDateStack);
    const dateInput = stack.locator(this.s.configureDateInput);
    const timeInput = stack.locator(this.s.configureTimeInput);
    await this.commitDate(dateInput, date);
    await timeInput.fill(time);
    await timeInput.press('Tab');
  }

  /**
   * Types a react-datepicker date and commits it with Enter, waiting for the
   * calendar to detach — the DOM signal that the value has reached the form model
   * before a save reads it. Retries so a keystroke lost to the calendar re-render
   * heals. Mirrors `StudioScheduleDetailsPage.commitDate`.
   */
  private async commitDate(field: Locator, value: string): Promise<void> {
    const calendar = this.page.locator('.react-datepicker');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await field.fill(value);
      await field.press('Enter');
      try {
        await calendar.waitFor({ state: 'detached', timeout: TIMEOUTS.action });
      } catch {
        // Calendar may already be closed; fall through to the value check.
      }
      if ((await field.inputValue()) === value) return;
    }
    throw new Error(`Could not set the datepicker field to "${value}".`);
  }

  // --- Grading (Basic tab) -------------------------------------------------

  /** Sets a subsection's "Grade as" assignment type (a course-defined type name). */
  async setGradedAs(assignmentType: string): Promise<void> {
    await this.page.locator(this.s.graderTypeSelect).selectOption({ label: assignmentType });
  }

  // --- Visibility ----------------------------------------------------------

  /** Sets a section's "Hide from learners" (Visibility tab). */
  async setSectionHidden(hidden: boolean): Promise<void> {
    await this.openTab(1);
    await this.setChecked(this.page.locator(this.s.sectionVisibilityCheckbox), hidden);
  }

  /** Sets a subsection's visibility radio (Visibility tab): hidden picks "hide". */
  async setSubsectionHidden(hidden: boolean): Promise<void> {
    await this.openTab(1);
    await this.page.locator(this.s.subsectionVisibilityRadio(hidden ? 'hide' : 'show')).check();
  }

  /** Sets a unit's "Hide from learners" (the unit dialog is tab-less). */
  async setUnitHidden(hidden: boolean): Promise<void> {
    await this.setChecked(this.page.locator(this.s.unitVisibilityCheckbox), hidden);
  }

  // --- Prerequisites (subsection Advanced tab) -----------------------------

  /** Marks a subsection "available as a prerequisite" (Advanced tab). */
  async markAvailableAsPrerequisite(): Promise<void> {
    await this.openTab(2);
    await this.setChecked(this.page.locator(this.s.availableAsPrerequisiteCheckbox), true);
  }

  /**
   * Requires a prerequisite of the subsection being configured (Advanced tab):
   * picks it by usage key and sets the minimum score and completion percentages.
   */
  async requirePrerequisite(
    prerequisiteUsageKey: string,
    thresholds: { minScore: number; minCompletion: number },
  ): Promise<void> {
    await this.openTab(2);
    await this.page.locator(this.s.prerequisiteSelect).selectOption(prerequisiteUsageKey);
    await this.page.locator(this.s.prerequisiteMinScore).fill(String(thresholds.minScore));
    await this.page
      .locator(this.s.prerequisiteMinCompletion)
      .fill(String(thresholds.minCompletion));
  }

  // --- Save ----------------------------------------------------------------

  /** Saves the dialog and waits for the xblock write it triggers. */
  async save(): Promise<void> {
    await waitForWrite(
      this.page,
      {
        method: ['POST', 'PATCH'],
        predicate: (r) => new RegExp(`${XBLOCK_PATH}block-v1:`).test(r.url()),
        timeout: TIMEOUTS.studioSettingsSave,
      },
      () => this.saveButton.click(),
    );
    await this.modal.waitFor({ state: 'detached' });
  }

  private async setChecked(checkbox: Locator, checked: boolean): Promise<void> {
    if ((await checkbox.isChecked()) !== checked) {
      await checkbox.setChecked(checked);
    }
  }
}
