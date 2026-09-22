import { expect, test } from '../../src/fixtures';
import { TIMEOUTS } from '../../src/config';
import {
  COURSE_ROLES,
  LIBRARY_ROLES,
  assignRole,
  canI,
  fetchStudioUsername,
  fetchWaffleFlagStates,
  isAuthzEnabledForCourse,
  listAuthzOrgs,
  listAuthzUsers,
  listRoleUsers,
  listRoles,
  listScopes,
  listUserAssignments,
  revokeRole,
  validateUsers,
} from '../../src/api';
import { RBAC_TAGS } from './helpers';

/**
 * The authz layer's own contract (Epic 12 plan §3, step 1): the
 * `/api/authz/v1/` client works end to end **with no UI**, so a changed API
 * shape, a permission regression or a session problem is reported here rather
 * than as a confusing failure in a console spec. No BTR case maps to these.
 *
 * It runs in **library scope**, which needs no waffle flag: creating a library
 * makes the worker author its `library_admin`, and that is enough to read the
 * role vocabulary, assign a colleague, read the assignment back and revoke it.
 * The course half only reads the role definitions and the flag-state document,
 * because enforcing course roles means turning the flag on for a course, which
 * belongs to the specs that also migrate it.
 */
test.describe('AuthZ API bootstrap', { tag: ['@regression', ...RBAC_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('the role vocabulary differs by scope type, and the flag document is readable', async ({
    page,
    config,
    authoredCourse,
    authoringLibrary,
    studioAuthorSession,
  }) => {
    void studioAuthorSession;

    // Library scope: the four library roles, with the ladder the console renders.
    const libraryRoles = await listRoles(page.request, config, authoringLibrary.id);
    expect(libraryRoles.map((role) => role.role).sort()).toEqual([...LIBRARY_ROLES].sort());
    const libraryAdmin = libraryRoles.find((role) => role.role === 'library_admin');
    const libraryUser = libraryRoles.find((role) => role.role === 'library_user');
    expect(libraryAdmin?.permissions).toContain('content_libraries.manage_library_team');
    expect(libraryUser?.permissions).not.toContain('content_libraries.manage_library_team');
    expect(libraryUser?.permissions).toContain('content_libraries.view_library');

    // Course scope is refused, and that is the contract, not a defect: the
    // endpoint answers for a scope the caller holds an authz role in, and with
    // `authz.enable_course_authoring` off for this course nobody holds one —
    // not even the author who created it. The course vocabulary is asserted
    // below, as the superuser.
    await expect(listRoles(page.request, config, authoredCourse.courseKey)).rejects.toMatchObject({
      status: 403,
    });

    // The three listings the console's filters are built from, answered to the
    // account itself: the scopes it holds a role in (its library among them),
    // the organizations those scopes belong to, and the users it may see. Each
    // is asserted by shape and by our own data, never by a rendered label.
    const scopes = await listScopes(page.request, config);
    expect(scopes.scopes.map((scope) => scope.externalKey)).toContain(authoringLibrary.id);
    const orgs = await listAuthzOrgs(page.request, config);
    expect(orgs.orgs).toContain(authoringLibrary.id.split(':')[1]);
    const me = await fetchStudioUsername(page.request, config);
    const users = await listAuthzUsers(page.request, config, { search: me });
    expect(users.users.map((user) => user.username)).toContain(me);

    // The flag-state document is readable by any authenticated user — the
    // capability preflight, and the oracle every override write waits on.
    const states = await fetchWaffleFlagStates(page.request, config);
    expect(states.courseOverrides.on).not.toContain(authoredCourse.courseKey);
    expect(await isAuthzEnabledForCourse(page.request, config, authoredCourse.courseKey)).toBe(
      states.global,
    );
  });

  test('the superuser reads the course role vocabulary', async ({
    adminApi,
    config,
    authoredCourse,
  }) => {
    // A superuser is not scope-limited, so this is where the course roles can
    // be read on a target whose courses are still on legacy permissions.
    // Permission *sets* differ by release (1.23 added four `courses.view_*`),
    // so the assertion is the role list plus one permission both carry.
    const courseRoles = await listRoles(adminApi, config, authoredCourse.courseKey);
    expect(courseRoles.map((role) => role.role).sort()).toEqual([...COURSE_ROLES].sort());
    const courseAdmin = courseRoles.find((role) => role.role === 'course_admin');
    const courseStaff = courseRoles.find((role) => role.role === 'course_staff');
    expect(courseAdmin?.permissions).toContain('courses.manage_course_team');
    expect(courseStaff?.permissions).not.toContain('courses.manage_course_team');
    expect(courseStaff?.permissions).toContain('courses.publish_course_content');
  });

  test('the library admin assigns, reads back and revokes a colleague’s role', async ({
    page,
    config,
    authoringLibrary,
    studioAuthorSession,
    studioColleague,
  }) => {
    void studioAuthorSession;
    const colleague = await studioColleague();
    const library = authoringLibrary.id;
    const unknown = 'e2e_no_such_user_zzz';

    // Creating the library made the author its admin, and nobody else holds a role.
    const before = await listRoleUsers(page.request, config, library);
    expect(before.members.map((member) => member.roles).flat()).toEqual(['library_admin']);

    // The wizard's own pre-flight: which identifiers the platform knows.
    const validation = await validateUsers(page.request, config, [
      colleague.identity.username,
      unknown,
    ]);
    expect(validation.validUsers).toEqual([colleague.identity.username]);
    expect(validation.invalidUsers).toEqual([unknown]);

    // A write answers 207 and reports per user: one assignment, one refusal.
    const assigned = await assignRole(
      page.request,
      config,
      {
        role: 'library_author',
        scopes: [library],
        users: [colleague.identity.username, unknown],
      },
      { allowErrors: true },
    );
    expect(assigned.completed).toEqual([
      expect.objectContaining({
        userIdentifier: colleague.identity.username,
        scope: library,
        status: 'role_added',
      }),
    ]);
    expect(assigned.errors).toEqual([
      expect.objectContaining({ userIdentifier: unknown, error: 'user_not_found' }),
    ]);

    // The assignment reads back from both directions, and carries the org.
    const after = await listRoleUsers(page.request, config, library);
    expect(after.count).toBe(before.count + 1);
    expect(
      after.members.find((member) => member.username === colleague.identity.username)?.roles,
    ).toEqual(['library_author']);
    const colleagueRows = await listUserAssignments(
      page.request,
      config,
      colleague.identity.username,
    );
    expect(colleagueRows.assignments).toContainEqual(
      expect.objectContaining({ role: 'library_author', scope: library }),
    );

    // What the role means, asked of the platform as each actor: an author may
    // edit content, and may not manage the team; the admin may do both.
    expect(
      await canI(colleague.request, config, 'content_libraries.edit_library_content', library),
    ).toBe(true);
    expect(
      await canI(colleague.request, config, 'content_libraries.manage_library_team', library),
    ).toBe(false);
    expect(await canI(page.request, config, 'content_libraries.manage_library_team', library)).toBe(
      true,
    );

    // Revoking is the same multi-status shape, and the member list settles back.
    const revoked = await revokeRole(page.request, config, {
      role: 'library_author',
      scope: library,
      users: [colleague.identity.username],
    });
    expect(revoked.completed).toEqual([
      expect.objectContaining({
        userIdentifier: colleague.identity.username,
        status: 'role_removed',
      }),
    ]);
    expect((await listRoleUsers(page.request, config, library)).count).toBe(before.count);
    expect(
      await canI(colleague.request, config, 'content_libraries.edit_library_content', library),
    ).toBe(false);
  });

  test('a user with no role in a scope is refused its team list', async ({
    config,
    authoringLibrary,
    studioAuthorSession,
    studioColleague,
  }) => {
    void studioAuthorSession;
    const outsider = await studioColleague();

    await expect(
      listRoleUsers(outsider.request, config, authoringLibrary.id),
    ).rejects.toMatchObject({ status: 403 });

    // The refusal is scoped, not global: the same context reads the flag
    // document, which carries no permission decorator.
    await expect(fetchWaffleFlagStates(outsider.request, config)).resolves.toBeDefined();
  });
});
