import { expect, test } from '../../../src/fixtures';
import { checkA11y } from '../../../src/a11y';
import { LIBRARY_ROLES, listRoles } from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { issue, knownGap, testId } from '../../../src/reporting';
import { RBAC_TAGS, ADMIN_CONSOLE_A11Y_BASELINE } from '../helpers';

/**
 * The console's **Roles and Permissions** tab — the static matrix of what each
 * role may do, in a Courses half and a Libraries half.
 *
 * Nothing here reads a label: the columns, the functional-area headings and the
 * per-cell "Permission granted in <Role> role" are all localized copy
 * (`RBAC-001`). The matrix's *content* is checked against the platform instead:
 * `roles/?scope=<library>` publishes each library role's permission list, and
 * the Libraries half renders exactly one row per permission, so each column's
 * granted cells must equal that role's permission count. The Courses half is
 * curated rather than one row per permission — 32 rows against `course_admin`'s
 * 33 permissions, some grouped and one ("Create course") outside course scope —
 * so it is asserted structurally and its counts are recorded in the plan
 * instead of encoded here.
 *
 * The tab is not flag-gated, but `roles/?scope=` is permission-gated, so the
 * viewer must hold a role in the scope the console was opened on (§1.8.12): the
 * worker author is its library's `library_admin`, which is why these run on a
 * library scope.
 */
test.describe(
  'Roles and Permissions console — permission matrix',
  { tag: ['@regression', ...RBAC_TAGS, '@content-libraries'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'matrixes both scope types, marking the roles that are not yet available',
      {
        annotation: [
          testId('TC-00569'),
          issue('https://github.com/openedx/wg-build-test-release/issues/609'),
        ],
      },
      async ({ page, adminConsole, authoringLibrary, studioAuthorSession }) => {
        void studioAuthorSession;
        const matrix = adminConsole.matrix;
        await adminConsole.console.goto(authoringLibrary.id);
        await matrix.open();

        // Courses is the half the tab opens on, with four role columns after the
        // row-label column.
        expect(await matrix.shownGroup()).toBe('courses');
        await expect(matrix.headers).toHaveCount(5);

        // Two of those four are offered but not implemented — the sheet's
        // "coming soon" pair. They are greyed and their labels carry a help
        // cursor that opens an explanation on hover.
        await expect(matrix.comingSoonHeaders).toHaveCount(2);
        await expect(matrix.tooltip).toHaveCount(0);
        await matrix.hoverComingSoonHeader();
        await expect(matrix.tooltip).toHaveCount(1);

        // Every functional area carries an info icon with its own tooltip.
        await expect(matrix.groupRows.first()).toBeVisible();
        await matrix.hoverGroupInfo();
        await expect(matrix.tooltip).toHaveCount(1);

        // No cell is left blank: each of the four columns states something for
        // every row, whether that is granted, not granted, or greyed out.
        const courseRows = await matrix.rows.count();
        expect(courseRows).toBeGreaterThan(0);
        for (const column of [1, 2, 3, 4]) {
          const states = await matrix.columnStates(column);
          expect(states.marked).toBe(courseRows);
        }
        // The two live columns say granted or not granted; the coming-soon pair
        // renders both states greyed, so only their presence is assertable.
        expect((await matrix.columnStates(1)).comingSoon).toBe(0);
        expect((await matrix.columnStates(3)).comingSoon).toBe(courseRows);

        // The Libraries half: the four library roles, none of them held back.
        await matrix.showGroup('libraries');
        expect(await matrix.shownGroup()).toBe('libraries');
        await expect(matrix.headers).toHaveCount(5);
        await expect(matrix.comingSoonHeaders).toHaveCount(0);
        await expect(matrix.groupRows).toHaveCount(4);

        // Every cell states something here too, and the roles are ordered as the
        // API orders them: each role grants a superset of the next one's.
        const libraryRows = await matrix.rows.count();
        const granted: number[] = [];
        for (const [index] of LIBRARY_ROLES.entries()) {
          const states = await matrix.columnStates(index + 1);
          expect(states.marked).toBe(libraryRows);
          expect(states.comingSoon).toBe(0);
          granted.push(states.granted);
        }
        expect(granted).toEqual([...granted].sort((a, b) => b - a));

        await checkA11y(page, {
          label: 'admin-console-permission-matrix',
          additionalBaseline: ADMIN_CONSOLE_A11Y_BASELINE,
        });
      },
    );

    test.fixme(
      'keeps the matrix headers in view while it is scrolled',
      {
        annotation: [
          testId('TC-00569'),
          knownGap(
            'The column headers are sticky, but the row-header column scrolls away horizontally and ' +
              'the tab offers no scroll-to-top control (`RBAC-009`) — two clauses of the case this ' +
              'build does not implement.',
          ),
        ],
      },
      async ({ adminConsole, authoringLibrary, studioAuthorSession }) => {
        void studioAuthorSession;
        const matrix = adminConsole.matrix;
        await adminConsole.console.goto(authoringLibrary.id);
        await matrix.open();

        // Implemented: the column headers stay put as the table scrolls.
        expect(await matrix.cellPosition(matrix.headers.first())).toBe('sticky');

        // Asked for by the case, and missing: the row labels should stay in view
        // when the matrix is scrolled sideways, and a control should return the
        // reader to the top.
        expect(await matrix.cellPosition(matrix.column(0).first())).toBe('sticky');
        await expect(matrix.panel.locator('button')).not.toHaveCount(
          await matrix.groupButtons.count(),
        );
      },
    );

    test(
      'renders one library permission per row, as the API lists them',
      {
        tag: '@rbac-matrix-parity',
        annotation: [
          testId('TC-00569'),
          issue('https://github.com/openedx/wg-build-test-release/issues/609'),
        ],
      },
      async ({ page, config, adminConsole, authoringLibrary, studioAuthorSession }) => {
        void studioAuthorSession;
        const matrix = adminConsole.matrix;
        await adminConsole.console.goto(authoringLibrary.id);
        await matrix.open();
        await matrix.showGroup('libraries');

        // The Libraries half is a rendering of `roles/?scope=`: one row per
        // library permission, and each role column's ticks are exactly the
        // permissions that role holds. (`verawood` renders three rows more than
        // the API advertises — wg#609 — which is why this is capability-gated.)
        const advertised = await listRoles(page.request, config, authoringLibrary.id);
        const permissionCount = (role: string) =>
          advertised.find((entry) => entry.role === role)?.permissions.length ?? -1;
        const libraryRows = await matrix.rows.count();
        expect(libraryRows).toBe(permissionCount('library_admin'));
        for (const [index, role] of LIBRARY_ROLES.entries()) {
          const states = await matrix.columnStates(index + 1);
          expect(
            { role, ...states },
            `column ${index + 1} should render ${role}'s ${permissionCount(role)} permissions`,
          ).toEqual({
            role,
            granted: permissionCount(role),
            denied: libraryRows - permissionCount(role),
            comingSoon: 0,
            marked: libraryRows,
          });
        }
      },
    );
  },
);
