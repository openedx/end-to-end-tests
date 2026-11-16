import type { APIRequestContext, Page } from '@playwright/test';

import { listTaxonomyTags } from '../../../src/api';
import { TIMEOUTS, VIEWPORTS, viewportUse, type AppConfig } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import type {
  CompetencyManagementPage,
  TreeLayoutReading,
} from '../../../src/pages/studio/taxonomies/competency-management.page';
import {
  COMPETENCY,
  competencyScrollTreeImportFile,
  competencyTreeImportFile,
} from '../../../src/steps';

/**
 * The competency tree on the Competency Management page
 * (`/taxonomy/<id>/competencies`): the tree's starting state, opening and closing
 * one node, and Expand All / Collapse All (openedx-core #680). No BTR case maps to
 * these.
 *
 * The admin ({@link competencyTaxonomyAdmin}) seeds a Competency taxonomy from the
 * suite's twelve-tag tree file and opens the page; the content-tagging API's tag
 * list is the oracle for what the tree must show. The page's access rules are
 * `competency-route-guard.spec.ts`, which also scans this page for accessibility.
 */
test.describe(
  'Competency tree',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@taxonomies', '@competencies'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test('opens with the root expanded and every group below it collapsed', async ({
      competencyTaxonomyAdmin,
      config,
    }) => {
      const { competency, request, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({
        type: 'competency',
        label: 'tree-start',
        file: competencyTreeImportFile(),
      });
      const tags = await listTaxonomyTags(request, config, taxonomy.id);

      await competency.goto(taxonomy.id);

      await expect(competency.rootRow).toBeVisible();
      await expect(competency.rootDisclosure).toHaveAttribute('aria-expanded', 'true');
      await expect(competency.topLevelNodes).toHaveCount(tags.filter((t) => t.depth === 0).length);
      await expect(competency.tree.locator('li li')).toHaveCount(0);
      for (const tag of tags.filter((t) => t.depth === 0 && t.childCount > 0)) {
        await expect(competency.node(tag.value)).toHaveAttribute('aria-expanded', 'false');
      }
      await expect(competency.toggleButton).toBeEnabled();
      await expect(competency.toggleButton).toHaveAttribute('aria-pressed', 'false');
      await expect(competency.errorAlert).toHaveCount(0);
    });

    test('expands and collapses one node on its own and indents each level further', async ({
      competencyTaxonomyAdmin,
      config,
    }) => {
      const { competency, request, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({
        type: 'competency',
        label: 'tree-node',
        file: competencyTreeImportFile(),
      });
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
      await expect(technical.locator('li')).toHaveCount(0);
    });

    test('indents each of the six levels deeper than its parent', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { competency, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({
        type: 'competency',
        label: 'tree-chain',
        file: competencyTreeImportFile(),
      });
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
      competencyTaxonomyAdmin,
      config,
    }) => {
      const { competency, request, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({
        type: 'competency',
        label: 'tree-all',
        file: competencyTreeImportFile(),
      });
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
      competencyTaxonomyAdmin,
      config,
    }) => {
      const { competency, request, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({
        type: 'competency',
        label: 'tree-ids',
        file: competencyTreeImportFile(),
      });
      const tags = await listTaxonomyTags(request, config, taxonomy.id);
      expect(tags.filter((t) => !t.externalId).map((t) => t.value)).toEqual([]);
      await competency.goto(taxonomy.id);

      await competency.toggleAll();

      await expect.poll(() => treeMismatches(competency, request, config, taxonomy.id)).toEqual([]);
      await expect(competency.badges).toHaveCount(tags.length);
      await expect(competency.rootBadge).toHaveCount(0);
    });

    test('is read-only: no edit controls, and interacting with the tree writes nothing', async ({
      competencyTaxonomyAdmin,
      config,
    }) => {
      const { competency, page, request, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({
        type: 'competency',
        label: 'tree-readonly',
        file: competencyTreeImportFile(),
      });
      const before = await listTaxonomyTags(request, config, taxonomy.id);
      await competency.goto(taxonomy.id);
      const writes = recordContentTaggingWrites(page);
      const verbal = competency.node(COMPETENCY.verbal.value);

      await competency.toggleAll();
      await competency.labelOf(verbal).dblclick();
      await competency.clickNodeAt(verbal, 'center');
      await expect(verbal).toHaveAttribute('aria-selected', 'true');
      await verbal.press('Enter');
      await expect(verbal).toHaveAttribute('aria-selected', 'true');

      const editable = competency.tree.locator(
        'input, textarea, [contenteditable]:not([contenteditable="false"])',
      );
      await expect(editable).toHaveCount(0);
      await expect(competency.tree.getByRole('textbox')).toHaveCount(0);
      // The root row and every group have a chevron, and the toolbar has the toggle.
      const expandable = 1 + before.filter((t) => t.childCount > 0).length;
      await expect(competency.tree.locator('button:enabled')).toHaveCount(expandable + 1);
      expect(writes).toEqual([]);
      const after = await listTaxonomyTags(request, config, taxonomy.id);
      expect(after.map(describeTag).sort()).toEqual(before.map(describeTag).sort());
    });

    test('highlights a row on hover over its whole area, bottom and edges included', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { competency, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({
        type: 'competency',
        label: 'tree-hover',
        file: competencyTreeImportFile(),
      });
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
        const highlighted = await competency.rowBackground(node);
        expect(highlighted, `${tag.value} changes color on hover`).not.toBe(resting);
        for (const position of positions) {
          await competency.moveMouseAway();
          await competency.hoverNodeAt(node, position);
          expect(
            await competency.rowBackground(node),
            `${tag.value} has the hover color at its ${position} edge`,
          ).toBe(highlighted);
        }
      }
    });

    test('selects a row when clicked anywhere on it, bottom edge included', async ({
      competencyTaxonomyAdmin,
    }) => {
      const { competency, seed } = competencyTaxonomyAdmin;
      const taxonomy = await seed({
        type: 'competency',
        label: 'tree-click',
        file: competencyTreeImportFile(),
      });
      await competency.goto(taxonomy.id);
      await competency.toggleAll();
      const selected = competency.tree.locator('li[aria-selected="true"]');
      const other = competency.node(COMPETENCY.written.value);

      for (const position of ['center', 'bottom', 'right', 'top'] as const) {
        const leaf = competency.node(COMPETENCY.verbal.value);
        await competency.clickNodeAt(other, 'center');
        await expect(
          other,
          `Written Communication is selected before the ${position} click`,
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
        competencyTaxonomyAdmin,
        config,
      }) => {
        const { competency, request, seed } = competencyTaxonomyAdmin;
        const taxonomy = await seed({
          type: 'competency',
          label: 'tree-scroll',
          file: competencyScrollTreeImportFile(),
        });
        const tagCount = (await listTaxonomyTags(request, config, taxonomy.id)).length;
        await competency.goto(taxonomy.id);
        const scrollYBefore = (await competency.readLayout()).scrollY;

        await competency.toggleAll();

        await expect(competency.toggleButton).toHaveAttribute('aria-pressed', 'true');
        await expect(competency.nodes).toHaveCount(tagCount);
        await expect
          .poll(async () => expandedLayoutProblems(await competency.readLayout()))
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
        competencyTaxonomyAdmin,
        config,
      }) => {
        const { competency, request, seed } = competencyTaxonomyAdmin;
        const taxonomy = await seed({
          type: 'competency',
          label: 'tree-phone',
          file: competencyTreeImportFile(),
        });
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
function describeTag(t: {
  value: string;
  externalId: string | null;
  depth: number;
  parentValue: string | null;
}): string {
  return `${t.value} (id ${t.externalId}, depth ${t.depth}, parent ${t.parentValue})`;
}

/** Records the writes the page sends to the content-tagging API; the array fills as they happen. */
function recordContentTaggingWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) &&
      pathname.includes('/api/content_tagging/')
    ) {
      writes.push(`${request.method()} ${pathname}`);
    }
  });
  return writes;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

/** The left edge of a node's name, which moves right with each level of nesting. */
async function labelX(
  competency: CompetencyManagementPage,
  node: ReturnType<CompetencyManagementPage['node']>,
): Promise<number> {
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
  const shownTags = new Set(shown.map(describeTag));
  const apiTags = new Set(api.map(describeTag));
  return [
    ...[...shownTags].filter((t) => !apiTags.has(t)).map((t) => `only on the page: ${t}`),
    ...[...apiTags].filter((t) => !shownTags.has(t)).map((t) => `only in the API: ${t}`),
  ].sort();
}

/** What is wrong with a fully expanded tree that should scroll inside its box; empty when nothing. */
function expandedLayoutProblems(layout: TreeLayoutReading): string[] {
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
  if (layout.treeMaxHeight === null || layout.treeHeight > layout.treeMaxHeight + 1) {
    problems.push(
      `the tree is ${layout.treeHeight} px tall, its max-height ${layout.treeMaxHeight}`,
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
    if (row.badgeTop >= row.labelBottom || row.badgeBottom <= row.labelTop) {
      problems.push(`${row.value}: the badge is not on the same line as its name`);
    }
  }
  return problems;
}
