import type { Locator, Page, Response } from '@playwright/test';

import { NOTIFICATION_TRAY_SELECTORS, type AppConfig } from '../../../config';
import type { NotificationApp } from '../../../api';
import { waitForWrite } from '../../studio/wait-for-write';

/**
 * The notifications tray in the page header, on whatever MFE page the caller is
 * on — dashboard, account, courseware, discussions, Studio. It is not a page of
 * its own, so it has no `goto`: navigate first, then open it.
 *
 * Every action waits for the notifications request it causes and returns that
 * response; the spec decides from the API (`src/api/notifications.ts`), and
 * asserts the rendering only where the rendering is the case (a badge, a dot,
 * the empty state). Opening a tab with unseen rows marks them **seen**; clicking
 * a row or "Mark all as read" marks them **read** — two different states.
 *
 * The legacy mobile header has no tray, so specs that drive it use a desktop
 * viewport.
 */
export class NotificationTray {
  private readonly s = NOTIFICATION_TRAY_SELECTORS;

  readonly bell: Locator;
  readonly bellBadge: Locator;
  readonly tray: Locator;
  readonly gearLink: Locator;
  readonly markAllReadButton: Locator;
  readonly loadMoreButton: Locator;
  readonly listComplete: Locator;
  readonly emptyList: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.bell = page.locator(this.s.bell);
    this.bellBadge = this.bell.locator(this.s.bellBadge);
    this.tray = page.locator(this.s.tray);
    this.gearLink = this.tray.locator(this.s.gearLink);
    this.markAllReadButton = this.tray.locator(this.s.markAllRead);
    this.loadMoreButton = this.tray.locator(this.s.loadMore);
    this.listComplete = this.tray.locator(this.s.listComplete);
    this.emptyList = this.tray.locator(this.s.emptyList);
  }

  private listRequest(app: NotificationApp, page = 1): (response: Response) => boolean {
    return (response) => {
      const url = new URL(response.url());
      return (
        url.origin === this.config.baseUrls.lms &&
        url.pathname === '/api/notifications/' &&
        url.searchParams.get('app_name') === app &&
        url.searchParams.get('page') === String(page)
      );
    };
  }

  /**
   * Opens the tray from the bell and waits for the first page of its default
   * (first) tab — `discussion` on a stock install.
   */
  async open(app: NotificationApp = 'discussion'): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(this.listRequest(app)),
      this.bell.click(),
    ]);
    await this.tray.waitFor();
    return response;
  }

  /** An app's tab, and its unseen badge. */
  tab(app: NotificationApp): Locator {
    return this.tray.locator(this.s.tab(app));
  }

  tabBadge(app: NotificationApp): Locator {
    return this.tab(app).locator(this.s.tabBadge);
  }

  /** An app's panel (only the selected one is shown). */
  panel(app: NotificationApp): Locator {
    return this.tray.locator(this.s.tabPanel(app));
  }

  /**
   * Switches to an app's tab and waits for its first page. The MFE marks the
   * tab's rows seen as it opens (`PUT mark-seen/<app>/`) when it has any unseen;
   * callers read the count from the API afterwards rather than waiting for it.
   */
  async openTab(app: NotificationApp): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(this.listRequest(app)),
      this.tab(app).click(),
    ]);
    return response;
  }

  /** One row, keyed by its notification id. */
  row(id: number): Locator {
    return this.tray.locator(this.s.row(id));
  }

  /** Every row in an app's panel. */
  rows(app: NotificationApp): Locator {
    return this.panel(app).locator(this.s.anyRow);
  }

  /** A row's unread dot. */
  unreadDot(id: number): Locator {
    return this.tray.locator(this.s.unreadDot(id));
  }

  /**
   * Clicks a row. The MFE marks it read (`PATCH read/`) and opens its
   * `content_url` in a **new tab**; this returns that tab, loaded, together with
   * the read response.
   */
  async openRow(id: number): Promise<{ readonly read: Response; readonly opened: Page }> {
    const [opened, read] = await Promise.all([
      this.page.context().waitForEvent('page'),
      this.page.waitForResponse(
        (response) =>
          response.url() === `${this.config.baseUrls.lms}/api/notifications/read/` &&
          response.request().method() === 'PATCH',
      ),
      this.row(id).click(),
    ]);
    await opened.waitForLoadState();
    return { read, opened };
  }

  /** "Mark all as read" on the open tab, waiting for its `PATCH read/`. */
  async markAllRead(): Promise<Response> {
    return waitForWrite(
      this.page,
      { method: 'PATCH', urlIncludes: '/api/notifications/read/' },
      () => this.markAllReadButton.click(),
    );
  }

  /** "Load more notifications", waiting for the next page of `app`. */
  async loadMore(app: NotificationApp, nextPage: number): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(this.listRequest(app, nextPage)),
      this.loadMoreButton.click(),
    ]);
    return response;
  }
}
