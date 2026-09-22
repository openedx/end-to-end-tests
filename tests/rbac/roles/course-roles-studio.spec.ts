import { expect, test } from '../../../src/fixtures';
import {
  assignRole,
  canI,
  fetchCourseIndex,
  listRoleUsers,
  revokeRole,
  updateXBlock,
} from '../../../src/api';
import { STUDIO_OUTLINE_PAGE_SELECTORS, TIMEOUTS } from '../../../src/config';
import { seedScopeAssignments } from '../../../src/steps';
import { issue, knownGap, testId } from '../../../src/reporting';
import { STUDIO_AUTHZ_TAGS } from '../studio-authz/helpers';
import { writableSection } from './helpers';

/**
 * The two authoring course roles, held **in AuthZ**, driving Studio
 * (`TC-00576`–`TC-00578`).
 *
 * `course_admin` and `course_staff` are identical everywhere except team
 * management, so that is where these cases separate them: both author the
 * course, only the admin may change who else can. What the console *offers* is
 * not the discriminator — it offers Assign Role to everyone (wg#603) — so the
 * platform's own answer is: `permissions/validate/me` for the right, and a real
 * `PUT roles/users/` for the outcome.
 */
test.describe(
  'AuthZ course roles in Studio',
  { tag: ['@regression', ...STUDIO_AUTHZ_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'lets course staff author the course but not manage its team',
      {
        annotation: [
          testId('TC-00576'),
          issue('https://github.com/openedx/wg-build-test-release/issues/603'),
        ],
      },
      async (
        { page, config, authzTarget, studioAuthorSession, resyncStudioAuthor, studioColleague },
        testInfo,
      ) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const staff = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          courseKey,
          [staff.identity.username],
          ['course_staff'],
        );
        await resyncStudioAuthor();
        const writableBlock = await writableSection(
          page.request,
          config,
          courseKey,
          `E2E staff ${testInfo.testId.slice(-6)}`,
        );

        // Authoring: the course opens and its content takes an edit.
        expect(await fetchCourseIndex(staff.request, config, courseKey)).toBeDefined();
        await updateXBlock(staff.request, config, writableBlock, {
          metadata: { display_name: `E2E renamed by staff ${testInfo.testId.slice(-6)}` },
        });
        await staff.page.goto(`${config.baseUrls.apps}/authoring/course/${courseKey}`, {
          waitUntil: 'domcontentloaded',
        });
        await expect(
          staff.page.locator(STUDIO_OUTLINE_PAGE_SELECTORS.sectionCard).first(),
        ).toBeVisible({ timeout: TIMEOUTS.navigation });

        // Team management: refused, both as a right and as a write.
        expect(await canI(staff.request, config, 'courses.manage_course_team', courseKey)).toBe(
          false,
        );
        const other = await studioColleague();
        await expect(
          assignRole(staff.request, config, {
            role: 'course_staff',
            scopes: [courseKey],
            users: [other.identity.username],
          }),
        ).rejects.toMatchObject({ status: 403 });
        expect(
          (await listRoleUsers(page.request, config, courseKey, { pageSize: 100 })).members.map(
            (row) => row.username,
          ),
        ).not.toContain(other.identity.username);
      },
    );

    test(
      'lets a course admin manage the team as well',
      { annotation: testId('TC-00577') },
      async ({ page, config, authzTarget, studioAuthorSession, studioColleague }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const admin = await studioColleague();
        const newcomer = await studioColleague();
        await seedScopeAssignments(
          page.request,
          config,
          courseKey,
          [admin.identity.username],
          ['course_admin'],
        );

        // Everything staff may do…
        expect(await fetchCourseIndex(admin.request, config, courseKey)).toBeDefined();
        expect(await canI(admin.request, config, 'courses.manage_course_team', courseKey)).toBe(
          true,
        );

        // …plus adding somebody, as the admin itself.
        const assigned = await assignRole(admin.request, config, {
          role: 'course_staff',
          scopes: [courseKey],
          users: [newcomer.identity.username],
        });
        expect(assigned.errors).toEqual([]);
        await expect
          .poll(
            async () =>
              (
                await listRoleUsers(page.request, config, courseKey, { pageSize: 100 })
              ).members.find((row) => row.username === newcomer.identity.username)?.roles ?? [],
            { timeout: TIMEOUTS.rbacMigration },
          )
          .toEqual(['course_staff']);
        expect(await fetchCourseIndex(newcomer.request, config, courseKey)).toBeDefined();

        // …and taking it away again. (The console's own removal control is
        // disabled for a course scope — `RBAC-014`, held in `team-sync.spec.ts` —
        // so the outcome is driven through the API the console would call.)
        await revokeRole(admin.request, config, {
          role: 'course_staff',
          scope: courseKey,
          users: [newcomer.identity.username],
        });
        await expect
          .poll(
            async () =>
              (await listRoleUsers(page.request, config, courseKey, { pageSize: 100 })).members.map(
                (row) => row.username,
              ),
            { timeout: TIMEOUTS.rbacMigration },
          )
          .not.toContain(newcomer.identity.username);
        await expect(fetchCourseIndex(newcomer.request, config, courseKey)).rejects.toMatchObject({
          status: 403,
        });
      },
    );

    test(
      'refuses Studio to an account with no course role',
      { annotation: testId('TC-00578') },
      async ({ config, authzTarget, studioAuthorSession, studioColleague }) => {
        void studioAuthorSession;
        const courseKey = authzTarget.courseKey;
        const outsider = await studioColleague();

        await expect(fetchCourseIndex(outsider.request, config, courseKey)).rejects.toMatchObject({
          status: 403,
        });
        await outsider.page.goto(`${config.baseUrls.apps}/authoring/course/${courseKey}`, {
          waitUntil: 'domcontentloaded',
        });
        await expect(outsider.page.locator(STUDIO_OUTLINE_PAGE_SELECTORS.sectionCard)).toHaveCount(
          0,
          {
            timeout: TIMEOUTS.navigation,
          },
        );
      },
    );

    test.fixme(
      'keeps a course out of the Studio home list of an account with no role',
      {
        annotation: [
          testId('TC-00578'),
          issue('https://github.com/openedx/wg-build-test-release/issues/613'),
          knownGap(
            'Studio Home lists a course to an account that holds no role in it; opening it is then ' +
              'refused. The case asks for it to be absent from the list (wg#613).',
          ),
        ],
      },
      async ({ authzTarget, studioAuthorSession, studioColleague }) => {
        void studioAuthorSession;
        const outsider = await studioColleague();
        await outsider.studioHomePage.goto();
        await expect(outsider.studioHomePage.courseCardLink(authzTarget.courseKey)).toHaveCount(0);
      },
    );
  },
);
