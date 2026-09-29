import type { Locator, Page, Response } from '@playwright/test';

import {
  STUDIO_ANALYTICS_SELECTORS,
  TIMEOUTS,
  outlineCardHeader,
  type AppConfig,
} from '../../../config';
import { narrowInContextDashboard, type InContextDashboard } from '../../../api';

/** What opening an element's analytics made the sidebar ask the LMS for. */
export interface InContextLoad {
  /** The key the dashboard config was asked for (a course key or a block's usage key). */
  readonly key: string;
  readonly status: number;
  /** The config, when the LMS answered 200. */
  readonly dashboard: InContextDashboard | undefined;
}

/**
 * Aspects' in-context metrics in the authoring sidebar (the "Analytics" page),
 * on the course outline or the unit page, and the outline cards' Analytics
 * buttons. Every action that opens an element's analytics waits for the
 * `superset_in_context_dashboard` request it causes and returns it: which
 * dashboard the sidebar embeds is the LMS's answer, not the rendered charts.
 *
 * The plugin's LMS calls are session-authed, so the page must hold an LMS
 * session (a Studio colleague), not only the worker author's JWT.
 */
export class AnalyticsSidebar {
  private readonly s = STUDIO_ANALYTICS_SELECTORS;
  readonly panel: Locator;
  readonly title: Locator;
  readonly backButton: Locator;
  readonly embedFrame: Locator;
  readonly lists: Locator;
  readonly emptyState: Locator;

  constructor(
    private readonly page: Page,
    config: AppConfig,
  ) {
    void config;
    this.panel = page.locator(this.s.panel);
    this.title = page.locator(this.s.title);
    this.backButton = page.locator(this.s.backButton);
    this.embedFrame = page.locator(this.s.embedFrame);
    this.lists = page.locator(this.s.list);
    this.emptyState = page.locator(this.s.emptyState);
  }

  /** The rail's Analytics button. */
  get railButton(): Locator {
    return this.page.locator(this.s.railButton);
  }

  /** Runs `action` and returns the in-context dashboard request it causes. */
  private async loading(action: () => Promise<unknown>): Promise<InContextLoad> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes('/aspects/superset_in_context_dashboard/'),
        {
          timeout: TIMEOUTS.supersetEmbed,
        },
      ),
      action(),
    ]);
    return this.loadOf(response);
  }

  private async loadOf(response: Response): Promise<InContextLoad> {
    const key = decodeURIComponent(
      new URL(response.url()).pathname.split('/superset_in_context_dashboard/')[1] ?? '',
    ).replace(/\/$/, '');
    const dashboard = response.ok() ? narrowInContextDashboard(await response.json()) : undefined;
    return { key, status: response.status(), dashboard };
  }

  /**
   * Opens the Analytics page from the rail. On the outline it loads the course's
   * dashboard (returned); on a unit page it lists the unit's elements and loads
   * nothing, so `undefined` comes back once the panel shows.
   */
  async open(options: { expectDashboard: boolean }): Promise<InContextLoad | undefined> {
    if (!options.expectDashboard) {
      await this.railButton.click();
      await this.panel.waitFor();
      return undefined;
    }
    const load = await this.loading(() => this.railButton.click());
    await this.panel.waitFor();
    return load;
  }

  /** The display names a list shows (the test's own data), in order. */
  async listNames(index: number): Promise<readonly string[]> {
    return this.lists.nth(index).locator(this.s.listItem).allTextContents();
  }

  /** Expands a list past its first five elements. */
  async showMore(index: number): Promise<void> {
    const before = await this.lists.nth(index).locator(this.s.listItem).count();
    await this.lists.nth(index).locator(this.s.showMore).click();
    await this.lists.nth(index).locator(this.s.listItem).nth(before).waitFor();
  }

  /** Collapses an expanded list back to its first five elements. */
  async showLess(index: number): Promise<void> {
    await this.lists.nth(index).locator(this.s.showMore).click();
    await this.lists.nth(index).locator(this.s.listItem).nth(5).waitFor({ state: 'detached' });
  }

  /** Whether a list offers "Show more" / "Show less". */
  showMoreToggle(index: number): Locator {
    return this.lists.nth(index).locator(this.s.showMore);
  }

  /** Drills into the element with this display name and returns its dashboard request. */
  async drillInto(displayName: string): Promise<InContextLoad> {
    const item = this.panel.locator(this.s.listItem).filter({ hasText: displayName }).first();
    const load = await this.loading(() => item.click());
    await this.title.filter({ hasText: displayName }).waitFor();
    return load;
  }

  /** Goes back from an element to the course's (or unit's) view. */
  async back(): Promise<void> {
    // The outline scrolls with the element clicked; bring the panel's title row
    // (where Back is) into view first.
    await this.backButton.first().scrollIntoViewIfNeeded();
    await this.backButton.first().click();
    await this.backButton.first().waitFor({ state: 'detached' });
  }

  /** The embedded dashboard's `src`, once it is attached. */
  async embedSrc(): Promise<string> {
    await this.embedFrame.waitFor({ timeout: TIMEOUTS.supersetEmbed });
    return (await this.embedFrame.getAttribute('src')) ?? '';
  }

  /** An outline card's Analytics button, on the card whose title is `displayName`. */
  cardButton(level: 'subsection' | 'unit', displayName: string): Locator {
    return this.page
      .locator(outlineCardHeader(level))
      .filter({ hasText: displayName })
      .first()
      .locator(this.s.cardButton);
  }

  /**
   * Opens an element's analytics from its outline card and returns the dashboard
   * request made for that element (`key`, its usage key). Opening the panel can
   * load the course's dashboard first; that request is not the one returned.
   */
  async openFromCard(
    level: 'subsection' | 'unit',
    displayName: string,
    key: string,
  ): Promise<InContextLoad> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes('/aspects/superset_in_context_dashboard/') &&
          decodeURIComponent(r.url()).includes(key),
        { timeout: TIMEOUTS.supersetEmbed },
      ),
      this.cardButton(level, displayName).click(),
    ]);
    return this.loadOf(response);
  }

  /**
   * Opens a unit's analytics from its outline card: the unit's title and a list
   * of its problems and videos (a unit has no dashboard of its own).
   */
  async openUnitFromCard(displayName: string): Promise<void> {
    await this.cardButton('unit', displayName).click();
    await this.title.filter({ hasText: displayName }).waitFor();
  }
}
