import type { Locator, Page } from '@playwright/test';

import { STUDIO_PAGES_RESOURCES_SELECTORS, type AppConfig } from '../../../config';
import { COURSE_APPS_PATH } from '../../../api';
import { authoringCourseBaseUrl } from '../authoring-base';

/**
 * Pages & Resources in the authoring MFE. Reached on the apps origin (Studio does
 * not redirect here), so the page derives the authoring-MFE base for the course
 * and builds its URLs from it. An app is switched through its own settings modal,
 * keyed on the app id — never the grid card, which has no structural hook.
 *
 * The spec decides the outcome against `course_apps` and the LMS course-home tabs;
 * this page drives the toggle and, when needed, reports whether the session may
 * view the page at all.
 */
export class StudioPagesResourcesPage {
  readonly page: Page;
  private base?: string;

  constructor(
    page: Page,
    private readonly config: AppConfig,
  ) {
    this.page = page;
  }

  /** Resolves (and caches) the authoring-MFE base for the course. */
  private async courseBase(courseKey: string): Promise<string> {
    this.base ??= await authoringCourseBaseUrl(this.page, this.config, courseKey);
    return this.base;
  }

  async goto(courseKey: string): Promise<void> {
    const base = await this.courseBase(courseKey);
    await this.page.goto(`${base}/pages-and-resources`);
    // Either the grid or the permission-denied alert settles the load.
    await this.page
      .locator(
        `${STUDIO_PAGES_RESOURCES_SELECTORS.page}, ${STUDIO_PAGES_RESOURCES_SELECTORS.permissionDenied}`,
      )
      .first()
      .waitFor();
  }

  /** Whether the MFE rendered the "not authorized" alert instead of the grid. */
  async isPermissionDenied(): Promise<boolean> {
    return (await this.page.locator(STUDIO_PAGES_RESOURCES_SELECTORS.permissionDenied).count()) > 0;
  }

  /** The "View live" link to the learner-facing course. */
  get viewLiveLink(): Locator {
    return this.page.locator(STUDIO_PAGES_RESOURCES_SELECTORS.viewLiveLink).first();
  }

  /**
   * Switches an app on or off through its settings modal, waiting for the
   * `PATCH course_apps` the Save fires. Returns that write's status.
   */
  async setAppEnabled(courseKey: string, appId: string, enabled: boolean): Promise<number> {
    const s = STUDIO_PAGES_RESOURCES_SELECTORS;
    const base = await this.courseBase(courseKey);
    await this.page.goto(`${base}/pages-and-resources/${appId}/settings`);

    const toggle = this.page.locator(s.enableToggle(appId));
    await toggle.waitFor();
    // Already in the desired state: saving would send no `PATCH`, so report success
    // without waiting for one (the caller's API read still confirms the state).
    if ((await toggle.isChecked()) === enabled) {
      return 200;
    }
    await toggle.setChecked(enabled);

    const [response] = await Promise.all([
      // Match the path only — the MFE URL-encodes the course key's `:`/`+`, so the
      // raw key would not appear verbatim in the request URL.
      this.page.waitForResponse(
        (r) => r.url().includes(COURSE_APPS_PATH) && r.request().method() === 'PATCH',
      ),
      this.page.locator(s.modalSaveButton).click(),
    ]);
    return response.status();
  }
}
