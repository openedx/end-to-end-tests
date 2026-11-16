import type { Locator, Page } from '@playwright/test';

import { TAXONOMY_SELECTORS, TIMEOUTS, type AppConfig } from '../../../config';
import { TAGGING_BASE } from '../../../api';

/** Where on a node's header area a pointer lands. */
type NodePosition = 'center' | 'bottom' | 'right' | 'left' | 'top';

/** One tag of the rendered tree, as the page shows it. */
interface TreeNodeReading {
  readonly value: string;
  /** The Competency ID badge's text, or `null` for a row with no badge. */
  readonly externalId: string | null;
  /** The number of ancestor `treeitem`s inside the tree: 0 for a node under the root row. */
  readonly depth: number;
  readonly parentValue: string | null;
}

/** The sizes and positions of the tree and its rows, in CSS pixels. */
export interface TreeLayoutReading {
  readonly viewportWidth: number;
  readonly documentScrollHeight: number;
  readonly scrollY: number;
  readonly treeHeight: number;
  /** The tree's computed `max-height` in pixels, or `null` when it is `none`. */
  readonly treeMaxHeight: number | null;
  readonly container: {
    readonly right: number;
    readonly bottom: number;
    readonly scrollHeight: number;
    readonly clientHeight: number;
    readonly scrollWidth: number;
    readonly clientWidth: number;
    readonly scrollTop: number;
    readonly overflowY: string;
  };
  /** The bottom edge of the last row in DOM order. */
  readonly lastRowBottom: number | null;
  /** The rows that have a badge, with the badge's right edge. */
  readonly badgedRows: readonly {
    readonly value: string;
    readonly badgeRight: number;
  }[];
}

/** A node's own text, exact: the tag values are the suite's data. */
function exactText(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/**
 * The Competency Management page (`/taxonomy/<id>/competencies`). Opening it by
 * URL has three outcomes (the page, a redirect to `/taxonomy/<id>`, the
 * connection-error alert), so `open` waits for none of them and the spec asserts
 * the one it expects. `goto` opens a page that is expected to render and waits
 * for its tree.
 *
 * The tree is one `treeitem` per tag, nested under its parent's while the parent
 * is expanded. A node is found by its own name, which is the tag's value.
 *
 * The id may be a string so a case can pass `abc` or a zero-padded id.
 */
export class CompetencyManagementPage {
  private readonly s = TAXONOMY_SELECTORS;
  /** The page's competency tree root. */
  readonly tree: Locator;
  /** The connection-error alert both this page and the taxonomy page show. */
  readonly errorAlert: Locator;
  /** The Expand All / Collapse All button; `aria-pressed` is its state. */
  readonly toggleButton: Locator;
  /** The tree's scrolling box. */
  private readonly scrollContainer: Locator;
  /** The taxonomy's own row at the top of the tree. */
  readonly rootRow: Locator;
  /** The root row's expand/collapse button. */
  readonly rootDisclosure: Locator;
  /** The nodes right under the root row. */
  readonly topLevelNodes: Locator;
  /** Every rendered tag. */
  readonly nodes: Locator;
  /** The nodes nested under another node, at any depth. */
  readonly nestedNodes: Locator;
  /** The nodes that are selected. */
  readonly selectedNodes: Locator;
  /** Anything in the tree a user could type into. */
  readonly editFields: Locator;
  /** Text boxes by role, in the tree. */
  readonly textboxes: Locator;
  /** The buttons in the tree that can be pressed. */
  readonly enabledButtons: Locator;
  /** Every Competency ID badge in the tree. */
  readonly badges: Locator;
  /** The root row's badge, which a taxonomy's own row does not have. */
  readonly rootBadge: Locator;

  constructor(
    private readonly page: Page,
    private readonly config: AppConfig,
  ) {
    this.tree = page.locator(this.s.competencyPage);
    this.errorAlert = page.locator(this.s.connectionError);
    this.toggleButton = this.tree.locator(this.s.competencyToggle);
    this.scrollContainer = page.locator(this.s.competencyScroll);
    this.rootRow = page.locator(this.s.competencyRootRow);
    this.rootDisclosure = this.rootRow.locator(this.s.competencyDisclosure);
    this.topLevelNodes = this.tree.locator(this.s.competencyTopLevelNodes);
    this.nodes = this.tree.locator(this.s.competencyNode);
    this.nestedNodes = this.nodes.locator(this.s.competencyNode);
    this.selectedNodes = this.tree.locator(this.s.competencySelectedNode);
    this.editFields = this.tree.locator(this.s.competencyEditField);
    this.textboxes = this.tree.getByRole('textbox');
    this.enabledButtons = this.tree.locator(this.s.competencyEnabledButton);
    this.badges = this.tree.locator(this.s.competencyBadge);
    this.rootBadge = this.rootRow.locator(this.s.competencyBadge);
  }

  /** Opens `/taxonomy/<idSegment>/competencies` by URL without waiting for an outcome. */
  async open(idSegment: number | string): Promise<void> {
    await this.page.goto(`${this.config.mfeUrls.authoring}/taxonomy/${idSegment}/competencies`, {
      waitUntil: 'domcontentloaded',
    });
  }

  /**
   * Opens a taxonomy's page and waits until its tags have loaded and the root row
   * is drawn. Fails on a tags response that is not a success.
   */
  async goto(id: number): Promise<void> {
    const tagsPath = `${TAGGING_BASE}/taxonomies/${id}/tags/`;
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith(tagsPath),
        { timeout: TIMEOUTS.navigation },
      ),
      this.open(id),
    ]);
    if (!response.ok()) {
      throw new Error(`Listing the tags of taxonomy ${id} failed: ${response.status()}`);
    }
    await this.rootRow.waitFor();
  }

  /** The tag whose own name is exactly `value`, at any depth. */
  node(value: string): Locator {
    return this.nodes.filter({
      has: this.page.locator(`${this.s.competencyRowOf} > ${this.s.competencyLabel}`, {
        hasText: exactText(value),
      }),
    });
  }

  /** A node's own header row, without its children. */
  private rowOf(node: Locator): Locator {
    return node.locator(this.s.competencyRowOf);
  }

  /** A node's name. */
  labelOf(node: Locator): Locator {
    return this.rowOf(node).locator(this.s.competencyLabel);
  }

  /** A node's expand/collapse button; a leaf has none. */
  disclosureOf(node: Locator): Locator {
    return this.rowOf(node).locator(this.s.competencyDisclosure);
  }

  /** Every node below a node, at any depth. */
  descendantsOf(node: Locator): Locator {
    return node.locator(this.s.competencyNode);
  }

  /** A node's direct children. */
  childrenOf(node: Locator): Locator {
    return node.locator(this.s.competencyChildrenOf);
  }

  /** Clicks Expand All, or Collapse All when every node is already open. */
  async toggleAll(): Promise<void> {
    await this.toggleButton.click();
  }

  /** Reads every rendered tag in one pass, so the rows are from one moment. */
  async readTree(): Promise<TreeNodeReading[]> {
    return this.nodes.evaluateAll(
      (items, s) =>
        items.map((item) => {
          const labelOf = (li: Element): string =>
            li.querySelector(`${s.rowOf} > ${s.label}`)?.textContent ?? '';
          const tree = item.closest(s.tree);
          let depth = 0;
          let parent = item.parentElement?.closest(s.node) ?? null;
          const parentValue = parent === null ? null : labelOf(parent);
          while (parent !== null && tree?.contains(parent)) {
            depth += 1;
            parent = parent.parentElement?.closest(s.node) ?? null;
          }
          return {
            value: labelOf(item),
            externalId: item.querySelector(`${s.rowOf} > ${s.badge}`)?.textContent?.trim() ?? null,
            depth,
            parentValue,
          };
        }),
      {
        tree: this.s.competencyPage,
        node: this.s.competencyNode,
        rowOf: this.s.competencyRowOf,
        label: this.s.competencyLabel,
        badge: this.s.competencyBadge,
      },
    );
  }

  /** Reads the tree's sizes and its rows' edges in one pass. */
  async readLayout(): Promise<TreeLayoutReading> {
    return this.page.evaluate(
      (s) => {
        const tree = document.querySelector(s.tree);
        const container = document.querySelector(s.container);
        if (tree === null || container === null) {
          throw new Error('The competency tree is not on the page.');
        }
        const box = container.getBoundingClientRect();
        const maxHeight = Number.parseFloat(getComputedStyle(tree).maxHeight);
        const rows = [...tree.querySelectorAll(s.node)].flatMap((li) => {
          const row = li.querySelector(s.rowOf);
          return row === null ? [] : [row];
        });
        const badgedRows = rows.flatMap((row) => {
          const label = row.querySelector(s.label);
          const badge = row.querySelector(s.badge);
          if (label === null || badge === null) return [];
          return [
            { value: label.textContent ?? '', badgeRight: badge.getBoundingClientRect().right },
          ];
        });
        return {
          viewportWidth: window.innerWidth,
          documentScrollHeight: document.documentElement.scrollHeight,
          scrollY: window.scrollY,
          treeHeight: tree.getBoundingClientRect().height,
          treeMaxHeight: Number.isNaN(maxHeight) ? null : maxHeight,
          container: {
            right: box.right,
            bottom: box.bottom,
            scrollHeight: container.scrollHeight,
            clientHeight: container.clientHeight,
            scrollWidth: container.scrollWidth,
            clientWidth: container.clientWidth,
            scrollTop: container.scrollTop,
            overflowY: getComputedStyle(container).overflowY,
          },
          lastRowBottom: rows.at(-1)?.getBoundingClientRect().bottom ?? null,
          badgedRows,
        };
      },
      {
        tree: this.s.competencyPage,
        container: this.s.competencyScroll,
        node: this.s.competencyNode,
        rowOf: this.s.competencyRowOf,
        label: this.s.competencyLabel,
        badge: this.s.competencyBadge,
      },
    );
  }

  /** Scrolls the tree's box to its end. */
  async scrollToEnd(): Promise<void> {
    await this.scrollContainer.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
  }

  /** A node's computed background color, which the hover and selected styles change. */
  async rowBackground(node: Locator): Promise<string> {
    return node.evaluate((el) => getComputedStyle(el).backgroundColor);
  }

  /**
   * Starts recording the writes (POST, PUT, PATCH, DELETE) the page sends to the
   * content-tagging API, as `METHOD /path` lines. The returned array fills as the
   * requests are sent. The recorder only observes: nothing is routed, delayed or
   * answered (ADR-0003). Call it before the interaction under test.
   */
  recordWrites(): string[] {
    const writes: string[] = [];
    this.page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) &&
        pathname.includes(TAGGING_BASE)
      ) {
        writes.push(`${request.method()} ${pathname}`);
      }
    });
    return writes;
  }

  /** Moves the pointer off the tree, so no node is hovered. */
  async moveMouseAway(): Promise<void> {
    await this.page.mouse.move(0, 0);
  }

  /** Hovers a node's header area at `position`; see {@link pointInNode}. */
  async hoverNodeAt(node: Locator, position: NodePosition): Promise<void> {
    await node.hover({ position: await this.pointInNode(node, position) });
  }

  /** Clicks a node's header area at `position`; see {@link pointInNode}. */
  async clickNodeAt(node: Locator, position: NodePosition): Promise<void> {
    await node.click({ position: await this.pointInNode(node, position) });
  }

  /**
   * The point of `position` on a node's header area, relative to the node's `li`, which is
   * what the hover style and the click handler sit on. The area is the `li`'s box down to
   * its child list (or to its bottom edge without one), so for an expanded group it
   * includes the padding around the header row and the gap above the children, not only
   * the row's own box. Points sit 2 px inside the box, and the box is measured in one pass.
   */
  private async pointInNode(
    node: Locator,
    position: NodePosition,
  ): Promise<{ x: number; y: number }> {
    const m = await node.evaluate(
      (li, s) => {
        const box = li.getBoundingClientRect();
        const row = li.querySelector(s.rowOf)?.getBoundingClientRect();
        const children = li.querySelector(s.childList)?.getBoundingClientRect();
        if (row === undefined) throw new Error('The node has no header row.');
        return {
          width: box.width,
          headerBottom: (children?.top ?? box.bottom) - box.top,
          rowCenterY: row.top + row.height / 2 - box.top,
          borderLeft: li.clientLeft,
          borderTop: li.clientTop,
        };
      },
      { rowOf: this.s.competencyRowOf, childList: this.s.competencyChildList },
    );
    const edge = 2;
    // `position` is measured from the padding box, inside the border.
    const at = (x: number, y: number) => ({ x: x - m.borderLeft, y: y - m.borderTop });
    switch (position) {
      case 'center':
        return at(m.width / 2, m.rowCenterY);
      case 'top':
        return at(m.width / 2, edge);
      case 'bottom':
        return at(m.width / 2, m.headerBottom - edge);
      case 'left':
        return at(edge, m.rowCenterY);
      case 'right':
        return at(m.width - edge, m.rowCenterY);
    }
  }
}
