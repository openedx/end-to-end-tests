import type { Locator, Page } from '@playwright/test';

import { STUDIO_TEXTBOOKS_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { authoringCourseBaseUrl } from '../authoring-base';
import { waitForWrite } from '../wait-for-write';

/** A textbook to add through the form (one chapter, given by title and PDF path). */
export interface NewTextbook {
  readonly tabTitle: string;
  readonly chapterTitle: string;
  readonly chapterUrl: string;
}

/**
 * The Studio Textbooks page — add, edit and delete course PDF textbooks. The
 * spec asserts against the textbooks API and the learner's course tabs; this
 * object drives the form (its three inputs go by order: tab title, chapter
 * title, chapter PDF path) and the card actions.
 */
export class TextbooksPage {
  private readonly s = STUDIO_TEXTBOOKS_SELECTORS;
  private base?: string;
  readonly cards: Locator;
  readonly emptyPlaceholder: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.cards = page.locator(this.s.card);
    this.emptyPlaceholder = page.locator(this.s.emptyPlaceholder);
  }

  async goto(courseKey: string): Promise<void> {
    this.base ??= await authoringCourseBaseUrl(this.page, this.config, courseKey);
    await this.page.goto(`${this.base}/textbooks`, { waitUntil: 'domcontentloaded' });
    await this.page
      .locator(`${this.s.emptyPlaceholder}, ${this.s.card}`)
      .first()
      .waitFor({ timeout: TIMEOUTS.navigation });
  }

  /** Opens the form (from the empty placeholder), fills it and saves a textbook. */
  async addTextbook(textbook: NewTextbook): Promise<void> {
    await this.page.locator(this.s.newFromEmpty).click();
    await this.page.locator(this.s.form).waitFor();
    const inputs = this.page.locator(this.s.formInputs);
    await inputs.nth(0).fill(textbook.tabTitle);
    await inputs.nth(1).fill(textbook.chapterTitle);
    await inputs.nth(2).fill(textbook.chapterUrl);
    await waitForWrite(
      this.page,
      { method: 'POST', urlIncludes: '/textbooks/', timeout: TIMEOUTS.contentWrite },
      () => this.page.locator(this.s.formSave).click(),
    );
    await this.page.locator(this.s.card).first().waitFor();
  }

  /** Edits the (single) textbook: adds a second chapter, then saves. */
  async addChapter(chapterTitle: string, chapterUrl: string): Promise<void> {
    await this.page.locator(this.s.editButton).first().click();
    await this.page.locator(this.s.form).waitFor();
    await this.page.locator(this.s.addChapterButton).click();
    const inputs = this.page.locator(this.s.formInputs);
    const count = await inputs.count();
    await inputs.nth(count - 2).fill(chapterTitle);
    await inputs.nth(count - 1).fill(chapterUrl);
    await waitForWrite(
      this.page,
      { method: 'PUT', urlIncludes: '/textbooks/', timeout: TIMEOUTS.contentWrite },
      () => this.page.locator(this.s.formSave).click(),
    );
  }

  /** Edits the textbook and deletes its last chapter, then saves. */
  async deleteLastChapter(): Promise<void> {
    await this.page.locator(this.s.editButton).first().click();
    await this.page.locator(this.s.form).waitFor();
    const dels = this.page.locator(this.s.chapterDeleteButton);
    await dels.last().click();
    await waitForWrite(
      this.page,
      { method: 'PUT', urlIncludes: '/textbooks/', timeout: TIMEOUTS.contentWrite },
      () => this.page.locator(this.s.formSave).click(),
    );
  }

  /** Deletes the (single) textbook via its card, confirming the dialog. */
  async deleteTextbook(): Promise<void> {
    await this.page.locator(this.s.deleteButton).first().click();
    await this.page.locator(this.s.deleteModal).waitFor();
    await waitForWrite(
      this.page,
      { method: 'DELETE', urlIncludes: '/textbooks/', timeout: TIMEOUTS.contentWrite },
      () => this.page.locator(this.s.deleteConfirm).click(),
    );
  }
}
