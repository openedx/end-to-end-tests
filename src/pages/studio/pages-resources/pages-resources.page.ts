import type { Locator, Page } from '@playwright/test';

import { STUDIO_PAGES_RESOURCES_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { COURSE_APPS_PATH } from '../../../api';
import { authoringCourseBaseUrl } from '../authoring-base';
import { waitForWrite } from '../wait-for-write';

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
    return this.page
      .locator(STUDIO_PAGES_RESOURCES_SELECTORS.viewLiveLink(this.config.mfeUrls.learning))
      .first();
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

    // Match the path only — the MFE URL-encodes the course key's `:`/`+`, so the
    // raw key would not appear verbatim in the request URL.
    const response = await waitForWrite(
      this.page,
      { method: 'PATCH', urlIncludes: COURSE_APPS_PATH },
      () => this.page.locator(s.modalSaveButton).click(),
    );
    return response.status();
  }

  /**
   * Hides or shows the Discussion tab with the "Hide discussion tab" switch of
   * the Discussion app's dialog (confirming the "Hide the discussion tab?"
   * modal when hiding), waiting for the settings write that follows. Returns
   * that write's status.
   *
   * The tab must currently stand the other way. The dialog draws the switch
   * from the course's discussion settings, and a read made right after a write
   * can still carry the previous value (measured on Tutor `main`, 2026-11-24:
   * `enabled: true` straight after a save of `false`), so the dialog is
   * reopened until the switch shows the state being left — a click on a stale
   * switch would ask for the change the wrong way round.
   */
  async setDiscussionTabHidden(courseKey: string, hidden: boolean): Promise<number> {
    const base = await this.courseBase(courseKey);
    const toggle = this.page.locator(STUDIO_PAGES_RESOURCES_SELECTORS.hideDiscussionSwitch);
    const standsOtherWay = toggle.and(this.page.locator(hidden ? ':not(:checked)' : ':checked'));
    const deadline = Date.now() + TIMEOUTS.studioSettingsSave;
    for (;;) {
      const settings = this.page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          /\/api\/discussions\/v\d+\/course\/[^/]+\/settings/.test(new URL(r.url()).pathname),
      );
      await this.page.goto(`${base}/pages-and-resources/discussion`);
      const { enabled } = (await (await settings).json()) as { enabled: boolean };
      if (enabled === hidden || Date.now() > deadline) break;
    }
    // Fails here, naming the switch, if the settings never showed that state.
    await standsOtherWay.waitFor();
    const response = await waitForWrite(
      this.page,
      {
        method: ['POST', 'PATCH', 'PUT'],
        predicate: (r) => new URL(r.url()).pathname.includes('/api/discussions/'),
      },
      async () => {
        // The switch is drawn from the saved state, so it moves only once the
        // write lands: a plain click, not `setChecked`, which expects it to
        // move at once. Hiding asks for confirmation first.
        await toggle.click();
        if (hidden) {
          await this.page
            .locator(STUDIO_PAGES_RESOURCES_SELECTORS.hideDiscussionConfirmButton)
            .click();
        }
      },
    );
    return response.status();
  }

  /**
   * Switches Flexible Peer Grading on or off in the ORA settings modal and
   * saves, waiting for the Advanced Settings write the Save fires. Returns that
   * write's status, or 200 without writing when the switch already stands as
   * asked. The course must hold an open response assessment for the modal to
   * exist.
   */
  async setFlexiblePeerGrading(courseKey: string, enabled: boolean): Promise<number> {
    const s = STUDIO_PAGES_RESOURCES_SELECTORS;
    const base = await this.courseBase(courseKey);
    await this.page.goto(`${base}/pages-and-resources/ora_settings/settings`);
    const toggle = this.page.locator(s.flexiblePeerGradingSwitch);
    await toggle.waitFor();
    if ((await toggle.isChecked()) === enabled) {
      return 200;
    }
    await toggle.setChecked(enabled);
    const response = await waitForWrite(
      this.page,
      { method: 'PATCH', urlIncludes: '/advanced_settings/' },
      () => this.page.locator(s.modalSaveButton).click(),
    );
    return response.status();
  }
}
