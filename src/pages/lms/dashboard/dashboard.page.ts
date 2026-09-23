import { errors, type Locator, type Page, type Response } from '@playwright/test';

import { DASHBOARD_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';

/**
 * The learner dashboard (`frontend-app-learner-dashboard`). Locators and
 * navigation only — specs own the assertions.
 *
 * Reached at the LMS `/dashboard` route, which redirects to the MFE, so that is
 * the URL a learner (and the header's "Courses" link) actually uses.
 */
export class DashboardPage {
  readonly content: Locator;
  readonly courseCards: Locator;
  readonly dialog: Locator;
  readonly emailSwitch: Locator;
  readonly masqueradeInput: Locator;
  readonly masqueradeChip: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.content = page.locator(DASHBOARD_SELECTORS.content);
    this.courseCards = page.locator(DASHBOARD_SELECTORS.courseCard);
    this.dialog = page.locator(DASHBOARD_SELECTORS.dialog);
    this.emailSwitch = page.locator(DASHBOARD_SELECTORS.emailSwitch);
    this.masqueradeInput = page.locator(DASHBOARD_SELECTORS.masqueradeInput);
    this.masqueradeChip = page.locator(DASHBOARD_SELECTORS.masqueradeChip);
  }

  get url(): string {
    return `${this.config.baseUrls.lms}/dashboard`;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.content.waitFor();
  }

  /** The card for one course, anchored by the course key in its title link. */
  courseCard(courseKey: string): Locator {
    return this.courseCards.filter({
      has: this.page.locator(`a[href*="${courseKey}"]`),
    });
  }

  /** The course-name link on a course's card. */
  courseCardTitle(courseKey: string): Locator {
    return this.courseCard(courseKey).locator(DASHBOARD_SELECTORS.courseCardTitle);
  }

  /**
   * Follows the card's primary call to action into the course.
   *
   * The control is a link with `href="#"` whose navigation happens in JavaScript,
   * so waiting for the URL to change is the only reliable completion signal —
   * there is no href to predict and no load event to attach to.
   */
  async beginCourse(courseKey: string): Promise<void> {
    await this.courseCard(courseKey).locator(DASHBOARD_SELECTORS.courseCardCta).click();
    await this.page.waitForURL((url) => url.pathname.includes(courseKey));
  }

  /** Opens a course card's kebab menu. */
  async openCardMenu(courseKey: string): Promise<void> {
    await this.courseCard(courseKey).locator(DASHBOARD_SELECTORS.cardActions).click();
    await this.page
      .locator(`${DASHBOARD_SELECTORS.unenrollItem}, ${DASHBOARD_SELECTORS.emailSettingsItem}`)
      .first()
      .waitFor();
  }

  /** The kebab item offering e-mail settings — present only where course e-mail is on. */
  emailSettingsItem(): Locator {
    return this.page.locator(DASHBOARD_SELECTORS.emailSettingsItem);
  }

  /**
   * Unenrolls from a course through its card: kebab, "Unenroll", the dialog's
   * confirmation and — where the platform asks why — its survey, returning the
   * unenroll request's response.
   */
  async unenroll(courseKey: string): Promise<Response> {
    await this.openUnenrollDialog(courseKey);
    const sent = this.page.waitForResponse(
      (r) =>
        r.url().startsWith(`${this.config.baseUrls.lms}/change_enrollment`) &&
        r.request().method() === 'POST',
    );
    const confirm = this.page.locator(DASHBOARD_SELECTORS.dialogConfirm);
    await confirm.click();
    // With the survey on (`SHOW_UNENROLL_SURVEY`), the confirmation opens the
    // survey and the request waits for the survey's own submit. The survey wait
    // is bounded, so it settles on its own when the request comes first.
    const survey = this.page
      .locator(DASHBOARD_SELECTORS.unenrollReasons)
      .waitFor({ timeout: TIMEOUTS.optionalOverlay })
      .then(
        () => 'survey' as const,
        () => 'none' as const,
      );
    if ((await Promise.race([sent.then(() => 'sent' as const), survey])) === 'survey') {
      await confirm.click();
    }
    const response = await sent;
    // The dialog closes with the card; where it stays on its "unenrolled"
    // pane instead, that pane's one action closes it.
    try {
      await this.dialog.waitFor({ state: 'detached', timeout: TIMEOUTS.optionalOverlay });
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
      await confirm.click();
      await this.dialog.waitFor({ state: 'detached' });
    }
    return response;
  }

  /** Opens the Unenroll dialog and dismisses it without unenrolling. */
  async cancelUnenroll(courseKey: string): Promise<void> {
    await this.openUnenrollDialog(courseKey);
    await this.dismissDialog();
  }

  private async openUnenrollDialog(courseKey: string): Promise<void> {
    await this.openCardMenu(courseKey);
    await this.page.locator(DASHBOARD_SELECTORS.unenrollItem).click();
    await this.dialog.waitFor();
  }

  /** Opens a course's "Email settings" dialog from its card. */
  async openEmailSettings(courseKey: string): Promise<void> {
    await this.openCardMenu(courseKey);
    await this.emailSettingsItem().click();
    await this.emailSwitch.waitFor();
  }

  /**
   * Saves the e-mail settings dialog and waits for the opt-in/out it sends
   * (`POST /api/change_email_settings`), returning that response.
   */
  async saveEmailSettings(): Promise<Response> {
    const sent = this.page.waitForResponse(
      (r) => r.url().includes('/api/change_email_settings') && r.request().method() === 'POST',
    );
    await this.page.locator(DASHBOARD_SELECTORS.dialogConfirm).click();
    const response = await sent;
    await this.dialog.waitFor({ state: 'detached' });
    return response;
  }

  /** Dismisses the open dialog ("Cancel", "Never mind"). */
  async dismissDialog(): Promise<void> {
    await this.page.locator(DASHBOARD_SELECTORS.dialogDismiss).click();
    await this.dialog.waitFor({ state: 'detached' });
  }

  /**
   * Views the dashboard as another learner (global staff only): submits the
   * "View as" bar and waits for the dashboard data it loads for them.
   */
  async masqueradeAs(user: string): Promise<Response> {
    const loaded = this.page.waitForResponse((r) =>
      r.url().includes(`/api/learner_home/init?user=${encodeURIComponent(user)}`),
    );
    await this.masqueradeInput.fill(user);
    await this.page.locator(DASHBOARD_SELECTORS.masqueradeSubmit).click();
    return loaded;
  }
}
