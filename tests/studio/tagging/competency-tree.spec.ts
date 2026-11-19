import type { APIRequestContext, Locator } from '@playwright/test';

import { listTaxonomyTags } from '../../../src/api';
import { VIEWPORTS, viewportUse, type AppConfig } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import type {
  CompetencyManagementPage,
  TreeLayoutReading,
  TreeNodeReading,
} from '../../../src/pages/studio/taxonomies/competency-management.page';
import { COMPETENCY } from '../../../src/steps';

/**
 * The competency tree on the Competency Management page
 * (`/taxonomy/<id>/competencies`): the tree's starting state, opening and closing
 * one node, Expand All / Collapse All, each tag's Competency ID and the page being
 * read-only, and the tree on a phone-sized window (openedx-core #680). The hover and
 * click tests come from openedx-core #821 (frontend-app-authoring #3260 and #3291):
 * the whole node box is the target. The scroll test comes from openedx-core #835
 * (frontend-app-authoring #3277): the tree scrolls inside its column. No BTR case
 * maps to these.
 *
 * The tests share one Competency taxonomy per worker ({@link competencyTree}, the
 * suite's twelve-tag tree file; the scroll test's 104-tag one is
 * {@link competencyScrollTree}), seeded by the admin at worker level and opened as
 * the worker author, so no test holds the admin lock. Sharing is safe because the
 * tree is read-only and its expanded and selected state is React state, reset by
 * each test's own `goto`. The content-tagging API's tag list, read on the author's
 * session, is the oracle for what the tree must show. The page's access rules are
 * `competency-route-guard.spec.ts`, which also scans this page for accessibility.
 *
 * Not covered: a tag created without an ID (openedx-core #758 gives it one) and a
 * row without a badge, which no longer exists since openedx-core #825. The visual details of
 * openedx-core #821 (row striping, arrow spacing, alignment) and #835's column heights, fixed
 * course-panel height and pointer cursor belong to other checks.
 */
test.describe(
  'Competency tree',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@taxonomies', '@competencies'] },
  () => {
    test('opens with the root expanded and every group below it collapsed', async ({
      competencyTree,
      config,
    }) => {
      const { competency, request, taxonomy } = competencyTree;

      await competency.goto(taxonomy.id);

      await expect(competency.rootRow).toBeVisible();
      await expect(competency.rootDisclosure).toHaveAttribute('aria-expanded', 'true');
      await expect
        .poll(() => startMismatches(competency, request, config, taxonomy.id))
        .toEqual([]);
      await expect(competency.nestedNodes).toHaveCount(0);
      await expect(competency.toggleButton).toBeEnabled();
      await expect(competency.toggleButton).toHaveAttribute('aria-pressed', 'false');
      await expect(competency.errorAlert).toHaveCount(0);
    });

    test('expands and collapses one node on its own and indents each level further', async ({
      competencyTree,
      config,
    }) => {
      const { competency, request, taxonomy } = competencyTree;
      await competency.goto(taxonomy.id);
      const technical = competency.node(COMPETENCY.technical.value);
      const communication = competency.node(COMPETENCY.communication.value);

      await competency.disclosureOf(technical).click();

      await expect(technical).toHaveAttribute('aria-expanded', 'true');
      await expect
        .poll(async () => {
          const tags = await listTaxonomyTags(request, config, taxonomy.id);
          const shown = sorted(
            await competency.labelOf(competency.childrenOf(technical)).allTextContents(),
          );
          const expected = sorted(
            tags.filter((t) => t.parentValue === COMPETENCY.technical.value).map((t) => t.value),
          );
          return shown.join('|') === expected.join('|') ? [] : [{ shown, expected }];
        })
        .toEqual([]);
      await expect(communication).toHaveAttribute('aria-expanded', 'false');
      await expect(competency.childrenOf(communication)).toHaveCount(0);

      await competency.disclosureOf(competency.node(COMPETENCY.python.value)).click();

      const django = competency.node(COMPETENCY.django.value);
      await expect(django).toBeVisible();
      const python = competency.node(COMPETENCY.python.value);
      const technicalX = await labelX(competency, technical);
      const pythonX = await labelX(competency, python);
      const djangoX = await labelX(competency, django);
      expect(pythonX).toBeGreaterThan(technicalX);
      expect(djangoX).toBeGreaterThan(pythonX);

      await competency.disclosureOf(technical).click();

      await expect(technical).toHaveAttribute('aria-expanded', 'false');
      await expect(competency.descendantsOf(technical)).toHaveCount(0);
    });

    test('indents each of the six levels deeper than its parent', async ({ competencyTree }) => {
      const { competency, taxonomy } = competencyTree;
      await competency.goto(taxonomy.id);

      for (const link of COMPETENCY.chain.slice(0, -1)) {
        await competency.disclosureOf(competency.node(link.value)).click();
      }

      await expect(competency.node(COMPETENCY.chain[5].value)).toBeVisible();
      let parentX = -Infinity;
      for (const link of COMPETENCY.chain) {
        const linkX = await labelX(competency, competency.node(link.value));
        expect(linkX, `${link.value} sits right of the level above`).toBeGreaterThan(parentX);
        parentX = linkX;
      }
    });

    test('Expand All opens every node, Collapse All closes them including the root', async ({
      competencyTree,
      config,
    }) => {
      const { competency, request, taxonomy } = competencyTree;
      await competency.goto(taxonomy.id);

      await competency.toggleAll();

      await expect(competency.toggleButton).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => treeMismatches(competency, request, config, taxonomy.id)).toEqual([]);

      await competency.toggleAll();

      await expect(competency.nodes).toHaveCount(0);
      await expect(competency.rootDisclosure).toHaveAttribute('aria-expanded', 'false');
      await expect(competency.toggleButton).toHaveAttribute('aria-pressed', 'false');

      await competency.toggleAll();

      await expect(competency.toggleButton).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => treeMismatches(competency, request, config, taxonomy.id)).toEqual([]);
    });

    test("shows each tag's Competency ID, equal to its external_id, on groups and leaves", async ({
      competencyTree,
      config,
    }) => {
      const { competency, request, taxonomy } = competencyTree;
      const tags = await listTaxonomyTags(request, config, taxonomy.id);
      expect(tags.filter((t) => !t.externalId).map((t) => t.value)).toEqual([]);
      await competency.goto(taxonomy.id);

      await competency.toggleAll();

      await expect.poll(() => treeMismatches(competency, request, config, taxonomy.id)).toEqual([]);
      await expect
        .poll(() => badgeCountMismatches(competency, request, config, taxonomy.id))
        .toEqual([]);
      await expect(competency.rootBadge).toHaveCount(0);
    });

    test('is read-only: no edit controls, and interacting with the tree writes nothing', async ({
      competencyTree,
      config,
    }) => {
      const { competency, request, taxonomy } = competencyTree;
      const before = await listTaxonomyTags(request, config, taxonomy.id);
      await competency.goto(taxonomy.id);
      const writes = competency.recordWrites();
      const verbal = competency.node(COMPETENCY.verbal.value);

      await competency.toggleAll();
      await competency.labelOf(verbal).dblclick();
      await competency.clickNodeAt(verbal, 'center');
      await expect(verbal).toHaveAttribute('aria-selected', 'true');
      await verbal.press('Enter');
      await expect(verbal).toHaveAttribute('aria-selected', 'true');

      await expect(competency.editFields).toHaveCount(0);
      await expect(competency.textboxes).toHaveCount(0);
      // The pressable buttons are the root row's and every group's chevron, and the
      // toolbar's toggle; a leaf's chevron is a disabled placeholder.
      await expect
        .poll(
          async () =>
            (await competency.enabledButtons.count()) - (await competency.disclosures.count()),
        )
        .toBe(1);
      expect(writes).toEqual([]);
      const after = await listTaxonomyTags(request, config, taxonomy.id);
      expect(after.map(describeTag).sort()).toEqual(before.map(describeTag).sort());
    });

    test('highlights a row on hover over its whole area, bottom and edges included', async ({
      competencyTree,
    }) => {
      const { competency, taxonomy } = competencyTree;
      await competency.goto(taxonomy.id);
      await competency.toggleAll();

      // The group's box is bigger than its header row: padding around the row and a gap
      // above the child list belong to it, so its four edges are the case that matters.
      const cases = [
        { tag: COMPETENCY.verbal, positions: ['bottom', 'right', 'left'] },
        { tag: COMPETENCY.technical, positions: ['top', 'bottom', 'left', 'right'] },
      ] as const;
      for (const { tag, positions } of cases) {
        const node = competency.node(tag.value);
        await competency.moveMouseAway();
        const resting = await competency.rowBackground(node);
        await competency.hoverNodeAt(node, 'center');
        await expect
          .poll(() => competency.rowBackground(node), {
            message: `${tag.value} changes color on hover`,
          })
          .not.toBe(resting);
        const highlighted = await competency.rowBackground(node);
        for (const position of positions) {
          await competency.moveMouseAway();
          await competency.hoverNodeAt(node, position);
          await expect
            .poll(() => competency.rowBackground(node), {
              message: `${tag.value} has the hover color at its ${position} edge`,
            })
            .toBe(highlighted);
        }
      }
    });

    test('selects a row when clicked anywhere on it, bottom edge included', async ({
      competencyTree,
    }) => {
      const { competency, taxonomy } = competencyTree;
      await competency.goto(taxonomy.id);
      await competency.toggleAll();
      const selected = competency.selectedNodes;
      const other = competency.node(COMPETENCY.written.value);

      for (const position of ['center', 'bottom', 'right', 'top', 'left'] as const) {
        const leaf = competency.node(COMPETENCY.verbal.value);
        await competency.clickNodeAt(other, 'center');
        await expect(
          other,
          `the other leaf is selected before the ${position} click`,
        ).toHaveAttribute('aria-selected', 'true');

        await competency.clickNodeAt(leaf, position);

        await expect(leaf, `a click at the ${position} selects the leaf`).toHaveAttribute(
          'aria-selected',
          'true',
        );
        await expect(other).toHaveAttribute('aria-selected', 'false');
        await expect(selected).toHaveCount(1);
      }

      const group = competency.node(COMPETENCY.technical.value);
      for (const position of ['center', 'top', 'bottom', 'left', 'right'] as const) {
        await competency.clickNodeAt(other, 'center');
        await expect(other).toHaveAttribute('aria-selected', 'true');

        await competency.clickNodeAt(group, position);

        await expect(group, `a click at the group's ${position} selects it`).toHaveAttribute(
          'aria-selected',
          'true',
        );
        await expect(selected).toHaveCount(1);
      }
    });

    test.describe('on a desktop-sized window', () => {
      test.use(viewportUse(VIEWPORTS.desktop));

      test('scrolls a fully expanded tree inside its column instead of growing the page', async ({
        competencyScrollTree,
        config,
      }) => {
        const { competency, request, taxonomy } = competencyScrollTree;
        await competency.goto(taxonomy.id);
        // openedx-core #835 states the scroll requirement with a competency selected, which
        // opens the course panel and gives the tree a fixed height. Without a selection the
        // tree is not capped that way, a state the ticket does not describe, so only the
        // selected state is checked.
        const firstRoot = competency.topLevelNodes.first();
        await competency.clickNodeAt(firstRoot, 'center');
        await expect(firstRoot).toHaveAttribute('aria-selected', 'true');
        const before = await competency.readLayout();
        const scrollYBefore = before.scrollY;

        await competency.toggleAll();

        await expect(competency.toggleButton).toHaveAttribute('aria-pressed', 'true');
        await expect
          .poll(() => treeMismatches(competency, request, config, taxonomy.id))
          .toEqual([]);
        await expect
          .poll(async () =>
            expandedLayoutProblems(await competency.readLayout(), before.documentScrollHeight),
          )
          .toEqual([]);

        await competency.scrollToEnd();

        await expect
          .poll(async () => scrolledLayoutProblems(await competency.readLayout(), scrollYBefore))
          .toEqual([]);

        await competency.toggleAll();

        await expect(competency.toggleButton).toHaveAttribute('aria-pressed', 'false');
        await expect
          .poll(async () => {
            const { container } = await competency.readLayout();
            return container.scrollHeight - container.clientHeight;
          })
          .toBeLessThanOrEqual(0);
      });
    });

    test.describe('on a phone-sized window', () => {
      test.use(viewportUse(VIEWPORTS.phone));

      test('keeps the tree and its badges inside the container on a phone screen', async ({
        competencyTree,
        config,
      }) => {
        const { competency, request, taxonomy } = competencyTree;
        await competency.goto(taxonomy.id);

        await competency.toggleAll();

        await expect(competency.toggleButton).toHaveAttribute('aria-pressed', 'true');
        await expect
          .poll(() => treeMismatches(competency, request, config, taxonomy.id))
          .toEqual([]);
        await expect
          .poll(async () => phoneLayoutProblems(await competency.readLayout()))
          .toEqual([]);
      });
    });
  },
);

/** One tag as a line, so a mismatch names the tag and the field that differs. */
function describeTag(
  t: Pick<TreeNodeReading, 'value' | 'externalId' | 'depth' | 'parentValue'>,
): string {
  return `${t.value} (id ${t.externalId}, depth ${t.depth}, parent ${t.parentValue})`;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

/** The left edge of a node's name, which moves right with each level of nesting. */
async function labelX(competency: CompetencyManagementPage, node: Locator): Promise<number> {
  const box = await competency.labelOf(node).boundingBox();
  if (box === null) throw new Error('The node has no name box: it is not rendered.');
  return box.x;
}

/**
 * Compares the rendered tree with the API's tag list, both read together: every tag as
 * `value`, `externalId`, `depth` and `parentValue`. Returns the tags only one side has, or
 * both sides disagree on, so a failure names them. An empty list means the tree is the
 * API's tags.
 */
async function treeMismatches(
  competency: CompetencyManagementPage,
  request: APIRequestContext,
  config: AppConfig,
  taxonomyId: number,
): Promise<string[]> {
  const [shown, api] = await Promise.all([
    competency.readTree(),
    listTaxonomyTags(request, config, taxonomyId),
  ]);
  const shownCounts = countBy(shown.map(describeTag));
  const apiCounts = countBy(api.map(describeTag));
  return [...new Set([...shownCounts.keys(), ...apiCounts.keys()])]
    .filter((tag) => shownCounts.get(tag) !== apiCounts.get(tag))
    .map(
      (tag) =>
        `${tag}: ${shownCounts.get(tag) ?? 0} on the page, ${apiCounts.get(tag) ?? 0} in the API`,
    )
    .sort();
}

function countBy(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/**
 * Compares the tree's starting state with the API, both read together: the top-level nodes
 * shown against the API's depth-0 tags, and each of those with children being collapsed.
 */
async function startMismatches(
  competency: CompetencyManagementPage,
  request: APIRequestContext,
  config: AppConfig,
  taxonomyId: number,
): Promise<string[]> {
  const [shown, api] = await Promise.all([
    competency.readTree(),
    listTaxonomyTags(request, config, taxonomyId),
  ]);
  const shownTop = shown.filter((t) => t.depth === 0);
  const topLevel = api.filter((t) => t.depth === 0);
  const problems: string[] = [];
  if (shownTop.length !== topLevel.length) {
    problems.push(`${shownTop.length} top-level nodes shown, ${topLevel.length} in the API`);
  }
  for (const tag of topLevel.filter((t) => t.childCount > 0)) {
    const node = shownTop.find((t) => t.value === tag.value);
    if (node === undefined) problems.push(`${tag.value} is not shown at the top level`);
    else if (node.expanded !== false) problems.push(`${tag.value} has expanded=${node.expanded}`);
  }
  return problems;
}

/** Compares the number of badges shown with the number of tags in the API, read together. */
async function badgeCountMismatches(
  competency: CompetencyManagementPage,
  request: APIRequestContext,
  config: AppConfig,
  taxonomyId: number,
): Promise<string[]> {
  const [shown, api] = await Promise.all([
    competency.badges.count(),
    listTaxonomyTags(request, config, taxonomyId),
  ]);
  return shown === api.length ? [] : [`${shown} badges shown for ${api.length} tags`];
}

/**
 * What is wrong with a fully expanded tree that should scroll inside its box; empty when
 * nothing is.
 */
function expandedLayoutProblems(layout: TreeLayoutReading, pageHeightBefore: number): string[] {
  const { container } = layout;
  const problems: string[] = [];
  if (!['auto', 'scroll'].includes(container.overflowY)) {
    problems.push(`the container's overflow-y is ${container.overflowY}`);
  }
  if (container.scrollHeight <= container.clientHeight) {
    problems.push(
      `the content (${container.scrollHeight}) does not exceed the box (${container.clientHeight})`,
    );
  }
  if (layout.documentScrollHeight > pageHeightBefore) {
    problems.push(
      `the page grew from ${pageHeightBefore} to ${layout.documentScrollHeight} on Expand All`,
    );
  }
  if (layout.documentScrollHeight >= container.scrollHeight) {
    problems.push(
      `the page (${layout.documentScrollHeight}) grew to the content (${container.scrollHeight})`,
    );
  }
  return problems;
}

/** What is wrong after the tree's box is scrolled to its end; empty when nothing. */
function scrolledLayoutProblems(layout: TreeLayoutReading, scrollYBefore: number): string[] {
  const problems: string[] = [];
  if (layout.container.scrollTop <= 0) problems.push('the container did not scroll');
  if (layout.scrollY !== scrollYBefore) {
    problems.push(`the window scrolled from ${scrollYBefore} to ${layout.scrollY}`);
  }
  if (layout.lastRowBottom === null || layout.lastRowBottom > layout.container.bottom + 1) {
    problems.push(
      `the last row ends at ${layout.lastRowBottom}, below the container's ${layout.container.bottom}`,
    );
  }
  return problems;
}

/** What sticks out of the tree's box on a narrow window; empty when nothing does. */
function phoneLayoutProblems(layout: TreeLayoutReading): string[] {
  const { container } = layout;
  const problems: string[] = [];
  if (container.right > layout.viewportWidth + 1) {
    problems.push(
      `the container ends at ${container.right}, past the window's ${layout.viewportWidth}`,
    );
  }
  if (container.scrollWidth > container.clientWidth) {
    problems.push(
      `the container scrolls sideways (${container.scrollWidth} > ${container.clientWidth})`,
    );
  }
  for (const row of layout.badgedRows) {
    if (row.badgeRight > container.right + 1) {
      problems.push(
        `${row.value}: the badge ends at ${row.badgeRight}, past the container's ${container.right}`,
      );
    }
  }
  return problems;
}
