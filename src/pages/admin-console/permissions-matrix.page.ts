import type { Locator, Page } from '@playwright/test';

import { ADMIN_CONSOLE_SELECTORS, TIMEOUTS } from '../../config';

/** The matrix's two halves, as the scope switch orders them. */
export const MATRIX_GROUPS = { courses: 0, libraries: 1 } as const;

export type MatrixGroup = keyof typeof MATRIX_GROUPS;

/**
 * The console's **Roles and Permissions** tab: a static matrix of what each
 * role may do, in two halves (course roles, library roles).
 *
 * Every label in it is localized copy — the role columns, the functional-area
 * headings, and the per-cell "Permission granted in <Role> role" — so nothing
 * here reads text. What the matrix says is read instead from its structure: a
 * cell is granted or denied by the marker it carries, a column is "coming soon"
 * by being greyed, and which half is shown by which switch button is Paragon's
 * primary variant.
 *
 * The tab is not flag-gated, but the role catalog (`roles/`) is
 * permission-gated, so the viewer must hold a role in the scope the console was
 * opened on: a library's admin, or a migrated course's `course_admin`.
 *
 * The halves are told apart by **position** in the scope switch (Courses, then
 * Libraries), because nothing else in the DOM names them. That holds only
 * while both are rendered: `verawood` always renders both, but from
 * frontend-app-admin-console#268 a half exists only for a scope type the
 * viewer may see a team for. So this object refuses to guess — it throws when
 * the switch does not offer both — and the specs make the viewer one who sees
 * both (the `matrixBothHalves` fixture).
 */
export class PermissionsMatrix {
  private readonly s = ADMIN_CONSOLE_SELECTORS;

  readonly tab: Locator;
  readonly panel: Locator;
  readonly table: Locator;
  readonly groupButtons: Locator;
  readonly activeGroupButton: Locator;
  /** Header cells: the row-label column, then one per role. */
  readonly headers: Locator;
  /** The role columns this build offers but has not implemented. */
  readonly comingSoonHeaders: Locator;
  /** The functional-area heading rows, and the permission rows between them. */
  readonly groupRows: Locator;
  readonly rows: Locator;
  /** Paragon's tooltip — asserted by presence, never by its copy. */
  readonly tooltip: Locator;
  /** The card that scrolls the matrix when the window is too narrow for it. */
  readonly scroller: Locator;
  /** The scroll-to-top button, present only once the page has scrolled far enough. */
  readonly scrollToTopButton: Locator;

  constructor(readonly page: Page) {
    this.tab = page.locator(this.s.permissionsTab);
    this.panel = page.locator(this.s.activePanel);
    this.table = this.panel.locator(this.s.permissionTable);
    this.groupButtons = this.panel.locator(this.s.matrixGroupButton);
    this.activeGroupButton = this.panel.locator(this.s.matrixGroupButtonActive);
    this.headers = this.panel.locator(this.s.matrixHeader);
    this.comingSoonHeaders = this.panel.locator(this.s.matrixHeaderComingSoon);
    this.groupRows = this.panel.locator(this.s.matrixGroupRow);
    this.rows = this.panel.locator(this.s.matrixRow);
    this.tooltip = page.locator(this.s.tooltip);
    this.scroller = this.panel.locator(this.s.matrixScroller);
    this.scrollToTopButton = page.locator(this.s.matrixScrollToTop);
  }

  /** Opens the tab from an already-loaded console and waits for the matrix. */
  async open(): Promise<void> {
    await this.tab.click();
    await this.table.waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
    await this.rows.first().waitFor({ state: 'visible', timeout: TIMEOUTS.navigation });
  }

  /**
   * The switch's buttons, once it is known to offer both halves. A switch with
   * one button cannot be read by position, and answering as if it could is how
   * a Libraries half passes for Courses.
   */
  private async bothGroupButtons(): Promise<Locator> {
    const offered = await this.groupButtons.count();
    if (offered !== Object.keys(MATRIX_GROUPS).length) {
      throw new Error(
        `The permission matrix offers ${offered} scope type(s), not both, so its halves cannot ` +
          'be told apart by position. This console renders a half only for a scope type the ' +
          'viewer may see a team for: take the `matrixBothHalves` fixture, so the viewer holds ' +
          'a course role as well as a library one.',
      );
    }
    return this.groupButtons;
  }

  /** Switches halves and waits for the new half to be the one shown. */
  async showGroup(group: MatrixGroup): Promise<void> {
    const button = (await this.bothGroupButtons()).nth(MATRIX_GROUPS[group]);
    await button.click();
    // The switch is Paragon's variant change, so "this half is shown" is the
    // button becoming primary; the table is rebuilt from state, not fetched.
    await button.and(this.activeGroupButton).waitFor({ timeout: TIMEOUTS.action });
    await this.rows.first().waitFor({ state: 'visible', timeout: TIMEOUTS.action });
  }

  /** Which half is shown, by the switch button carrying Paragon's primary variant. */
  async shownGroup(): Promise<MatrixGroup | undefined> {
    const buttons = await this.bothGroupButtons();
    for (const group of Object.keys(MATRIX_GROUPS) as MatrixGroup[]) {
      const classes = (await buttons.nth(MATRIX_GROUPS[group]).getAttribute('class')) ?? '';
      if (/\bbtn-primary\b/.test(classes)) {
        return group;
      }
    }
    return undefined;
  }

  /** The cells of one role column (1-based, the row-label column excluded). */
  column(index: number): Locator {
    return this.panel.locator(this.s.matrixRoleCell(index));
  }

  /** What a role column says, as three counts that must add up to its rows. */
  async columnStates(index: number): Promise<{
    granted: number;
    denied: number;
    comingSoon: number;
    marked: number;
  }> {
    const cells = this.column(index);
    return {
      granted: await cells.locator(this.s.matrixGranted).count(),
      denied: await cells.locator(this.s.matrixDenied).count(),
      comingSoon: await cells.locator(this.s.matrixComingSoonMarker).count(),
      marked: await cells.locator(this.s.matrixCellMarker).count(),
    };
  }

  /** Hovers a coming-soon column's label, whose help cursor carries the tooltip. */
  async hoverComingSoonHeader(index = 0): Promise<void> {
    await this.comingSoonHeaders.nth(index).locator(this.s.matrixHelpCursor).hover();
  }

  /** Hovers the first functional-area heading's info control. */
  async hoverGroupInfo(): Promise<void> {
    await this.groupRows.first().locator(this.s.matrixGroupInfoIcon).first().hover();
  }

  /** The CSS `position` of a cell — how "the headers stay in view" is read. */
  async cellPosition(cell: Locator): Promise<string> {
    return cell.evaluate((el) => getComputedStyle(el).position);
  }

  /**
   * How far the matrix overflows its card, in pixels each way — both zero while
   * the matrix fits and the card is not a scroller.
   */
  async overflow(): Promise<{ x: number; y: number }> {
    return this.scroller.evaluate((el) => ({
      x: el.scrollWidth - el.clientWidth,
      y: el.scrollHeight - el.clientHeight,
    }));
  }

  /** Scrolls the matrix inside its card. */
  async scrollMatrixBy(x: number, y: number): Promise<void> {
    await this.scroller.evaluate((el, by) => el.scrollBy(by.x, by.y), { x, y });
  }

  /** How far the card has scrolled the matrix. */
  async matrixScroll(): Promise<{ x: number; y: number }> {
    return this.scroller.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
  }

  /**
   * The gap, in whole pixels, between the top of the card and the top of the
   * first role column's header — constant while the header row stays pinned,
   * negative once it scrolls away.
   */
  async headerOffset(): Promise<number> {
    const header = await this.headers.nth(1).boundingBox();
    const card = await this.scroller.boundingBox();
    if (header === null || card === null) {
      throw new Error('The permission matrix or its header row is not rendered.');
    }
    return Math.round(header.y - card.y);
  }

  /** Scrolls the page (not the matrix) to `y`. */
  async scrollPageTo(y: number): Promise<void> {
    await this.page.evaluate((top) => window.scrollTo(0, top), y);
  }

  /** How far the page has scrolled. */
  async pageScroll(): Promise<number> {
    return this.page.evaluate(() => Math.round(window.scrollY));
  }
}
