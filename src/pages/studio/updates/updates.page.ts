import type { Page } from '@playwright/test';

import { TIMEOUTS, type AppConfig } from '../../../config';
import { authoringCourseBaseUrl } from '../authoring-base';
import { waitForWrite } from '../wait-for-write';

const S = {
  handouts: '[data-testid="course-handouts"]',
  handoutsEdit: '[data-testid="course-handouts-edit-button"]',
  newUpdate: 'button.btn.btn-primary.btn-sm',
  postOrSave: 'button.btn.btn-primary:not(.btn-sm)',
  tinyMceFrame: 'iframe.tox-edit-area__iframe',
  /** The visible editor pane; clicking it focuses TinyMCE (whose body starts collapsed). */
  editArea: '.tox-edit-area:visible',
} as const;

/**
 * The Course Updates page (`/course/<key>/course_info`): dated updates and the
 * handouts sidebar, both edited in an inline TinyMCE. The spec asserts against
 * the updates and handouts APIs; this object drives the editor. The Post/Save
 * button is the only non-small primary button while an editor is open.
 */
export class UpdatesPage {
  private base?: string;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {}

  async goto(courseKey: string): Promise<void> {
    this.base ??= await authoringCourseBaseUrl(this.page, this.config, courseKey);
    await this.page.goto(`${this.base}/course_info`, { waitUntil: 'domcontentloaded' });
    await this.page.locator(S.handouts).waitFor({ timeout: TIMEOUTS.navigation });
  }

  /** Focuses the visible editor (its TinyMCE body starts collapsed, so click the pane). */
  private async focusEditor(): Promise<void> {
    await this.page.locator(S.editArea).click();
  }

  /** Replaces the open editor's content with `text`. */
  private async typeIntoEditor(text: string): Promise<void> {
    await this.focusEditor();
    await this.page.keyboard.press('ControlOrMeta+a');
    await this.page.keyboard.type(text);
  }

  /** Creates a new update carrying `text`, waiting for the create write. */
  async newUpdate(text: string): Promise<void> {
    await this.page.locator(S.newUpdate).first().click();
    await this.typeIntoEditor(text);
    await waitForWrite(
      this.page,
      { method: 'POST', urlIncludes: '/course_info_update/', timeout: TIMEOUTS.contentWrite },
      () => this.page.locator(S.postOrSave).first().click(),
    );
  }

  /**
   * Creates a new update carrying `text` in bold (Ctrl+B over the selection),
   * exercising the editor's formatting; waits for the create write.
   */
  async newBoldUpdate(text: string): Promise<void> {
    await this.page.locator(S.newUpdate).first().click();
    await this.focusEditor();
    await this.page.keyboard.press('ControlOrMeta+a');
    await this.page.keyboard.type(text);
    await this.page.keyboard.press('ControlOrMeta+a');
    await this.page.keyboard.press('ControlOrMeta+b');
    await waitForWrite(
      this.page,
      { method: 'POST', urlIncludes: '/course_info_update/', timeout: TIMEOUTS.contentWrite },
      () => this.page.locator(S.postOrSave).first().click(),
    );
  }

  /** Edits the handouts with `text`, waiting for the handouts xblock write. */
  async editHandouts(text: string): Promise<void> {
    await this.page.locator(S.handoutsEdit).click();
    await this.typeIntoEditor(text);
    await waitForWrite(
      this.page,
      { method: 'PUT', urlIncludes: 'block@handouts', timeout: TIMEOUTS.contentWrite },
      () => this.page.locator(S.postOrSave).first().click(),
    );
  }
}
