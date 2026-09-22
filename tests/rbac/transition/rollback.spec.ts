import { expect, test, type StudioColleague } from '../../../src/fixtures';
import {
  AUTHZ_COURSE_AUTHORING_FLAG,
  clearOrgFlagOverride,
  courseUsageKey,
  enrollInCourseViaApi,
  grantLegacyRole,
  hasCompletedMigrationRun,
  listCourseAccessRoles,
  listRoleUsers,
  revokeLegacyRole,
  setOrgFlagOverride,
  type CourseAccessRoleRow,
} from '../../../src/api';
import { TIMEOUTS, getRunId } from '../../../src/config';
import {
  FULL_COURSE_ACCESS,
  NO_COURSE_ACCESS,
  disableAuthzForCourse,
  enableAuthzForCourse,
  readCoursePermissions,
  type PermissionReadings,
} from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { TRANSITION_TAGS, migrationCourse, newOrgName, seedLegacyTeam } from './helpers';
import { writableSection } from '../roles/helpers';

/**
 * Turning AuthZ course authoring **off** again (`TC-00600`–`TC-00612`).
 *
 * The sheet's demand is exact — "the final state must match the original
 * baseline" — so these cases record the baseline rather than describing it: the
 * course's legacy role rows as the admin lists them, and every actor's reading
 * of the permission matrix. The scope is then migrated, rolled back, and both
 * readings are compared with what was recorded. Nothing is hard-coded about what
 * "restored" means; the platform's own before-state is the expectation.
 *
 * A rollback is a second override row with `override_choice=off`: the models are
 * `ConfigurationModel`s and cannot be deleted, so turning the flag off means
 * adding a row that says off, and on an automatic target that same save restores
 * the legacy roles and clears the authz assignments.
 */
/** Which cast part plays each legacy role. */
const CAST_PART = {
  instructor: 'instructor',
  staff: 'staff',
  limited_staff: 'limitedStaff',
  data_researcher: 'dataResearcher',
  beta: 'beta',
} as const;

test.describe('AuthZ transition — rollback', { tag: ['@regression', ...TRANSITION_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  /** A role row reduced to what a rollback has to restore, sorted for comparison. */
  const baselineOf = (rows: readonly CourseAccessRoleRow[]): string[] =>
    rows.map((row) => `${row.username}:${row.role}`).sort();

  test(
    'restores every legacy role and every actor’s access to the baseline',
    {
      annotation: [
        testId('TC-00600'),
        testId('TC-00601'),
        testId('TC-00602'),
        testId('TC-00603'),
        testId('TC-00604'),
        testId('TC-00605'),
        testId('TC-00606'),
        testId('TC-00607'),
        testId('TC-00608'),
        testId('TC-00609'),
        testId('TC-00610'),
        testId('TC-00611'),
      ],
    },
    async (
      {
        page,
        config,
        adminLms,
        authzTarget,
        automaticMigrationTarget,
        studioAuthorSession,
        rbacCast,
        resyncStudioAuthor,
      },
      testInfo,
    ) => {
      void studioAuthorSession;
      void automaticMigrationTarget;
      void authzTarget;
      const courseKey = await migrationCourse(
        page.request,
        config,
        getRunId(),
        `R${testInfo.parallelIndex}`,
      );

      const roles = ['instructor', 'staff', 'limited_staff', 'data_researcher', 'beta'] as const;
      const actors: {
        role: (typeof roles)[number];
        actor: StudioColleague;
      }[] = [];
      for (const role of roles) {
        // One account per part, shared by the worker's RBAC specs: these cases
        // give each of them the same legacy role every time, on a course of
        // their own, so reuse cannot carry a surprise.
        actors.push({ role, actor: await rbacCast(CAST_PART[role]) });
      }
      await seedLegacyTeam(
        page.request,
        config,
        courseKey,
        actors.map(({ role, actor }) => ({ email: actor.identity.email, role })),
      );
      const learner = await rbacCast('learner');
      await enrollInCourseViaApi(learner.request, config, courseKey);
      await resyncStudioAuthor();
      const writableBlock = await writableSection(
        page.request,
        config,
        courseKey,
        `E2E rollback ${testInfo.testId.slice(-6)}`,
      );
      const everyone = [...actors, { role: 'learner' as const, actor: learner }];

      // The baseline, recorded rather than assumed: who holds which legacy role,
      // and what each of them may do.
      const baselineMatrix = new Map<string, PermissionReadings>();
      for (const { role, actor } of everyone) {
        baselineMatrix.set(
          role,
          await readCoursePermissions(actor.request, config, courseKey, actor.identity.username, {
            writableBlock,
          }),
        );
      }
      expect(baselineMatrix.get('instructor')).toEqual(FULL_COURSE_ACCESS);

      const baselineRoles = await adminLms(async (session) => {
        const rows = baselineOf(await listCourseAccessRoles(session, config, courseKey));
        // The five seeded roles, plus the creator's own instructor and staff.
        expect(rows.length).toBeGreaterThanOrEqual(roles.length);

        // Forward first: a rollback needs something to roll back.
        const forward = await enableAuthzForCourse(session, config, courseKey, {
          mode: 'automatic',
          note: `e2e ${testInfo.testId}`,
        });
        expect(forward.migrated).toBe(true);
        expect(await listCourseAccessRoles(session, config, courseKey)).toEqual([]);
        return rows;
      });

      // The migration really happened, so what follows is a rollback and not a
      // no-op: the team is in authz now.
      expect(
        (await listRoleUsers(page.request, config, courseKey)).members.map((row) => row.username),
      ).toEqual(expect.arrayContaining(actors.map(({ actor }) => actor.identity.username)));

      await adminLms(async (session) => {
        const rolledBack = await disableAuthzForCourse(session, config, courseKey, {
          mode: 'automatic',
          note: `e2e rollback ${testInfo.testId}`,
        });

        // TC-00600: the flag is off again and the platform recorded the reverse run.
        expect(rolledBack.enabled).toBe(false);
        expect(rolledBack.rolledBack).toBe(true);
        expect(await hasCompletedMigrationRun(session, config, courseKey, 'rollback')).toBe(true);

        // TC-00601–00605: every legacy row is back, exactly the set that was
        // there before — including `beta_testers`, which the sheet calls out.
        expect(baselineOf(await listCourseAccessRoles(session, config, courseKey))).toEqual(
          baselineRoles,
        );

        // …and no authz equivalent survives. Read as the superuser, which is the
        // only actor not scope-limited: once the flag is off and nobody holds an
        // authz role in the course, the accounts themselves are refused the
        // question (`403`), so their own view cannot prove an absence.
        expect((await listRoleUsers(session, config, courseKey)).members).toEqual([]);
      });

      // TC-00606–00611: the matrix is the baseline again, actor for actor —
      // the same table, third phase.
      for (const { role, actor } of everyone) {
        expect(
          await readCoursePermissions(actor.request, config, courseKey, actor.identity.username, {
            writableBlock,
          }),
          `${role} should be back to exactly the access it had before the migration`,
        ).toEqual(baselineMatrix.get(role));
      }
    },
  );

  test(
    'keeps an organization’s roles inside it after a rollback',
    { annotation: testId('TC-00612') },
    async (
      {
        page,
        config,
        contentCourse,
        adminLms,
        authzTarget,
        automaticMigrationTarget,
        studioAuthorSession,
        rbacCast,
        resyncStudioAuthor,
      },
      testInfo,
    ) => {
      void studioAuthorSession;
      void automaticMigrationTarget;
      void authzTarget;
      const org = newOrgName(getRunId(), `B${testInfo.parallelIndex}`);
      const courseKey = await migrationCourse(
        page.request,
        config,
        getRunId(),
        `B${testInfo.parallelIndex}`,
        org,
      );
      const orgInstructor = await rbacCast('orgInstructor');
      await resyncStudioAuthor();
      const writableBlock = await writableSection(
        page.request,
        config,
        courseKey,
        `E2E org rollback ${testInfo.testId.slice(-6)}`,
      );
      const rowPk = await adminLms((session) =>
        grantLegacyRole(session, config, {
          email: orgInstructor.identity.email,
          org,
          role: 'instructor',
        }),
      );

      try {
        await adminLms(async (session) => {
          await setOrgFlagOverride(session, config, org, {
            flag: AUTHZ_COURSE_AUTHORING_FLAG,
            choice: 'on',
            enabled: true,
            note: `e2e ${testInfo.testId}`,
          });
          await expect
            .poll(() => hasCompletedMigrationRun(session, config, org, 'forward'), {
              timeout: TIMEOUTS.rbacMigration,
            })
            .toBe(true);

          // Roll the organization back again.
          await clearOrgFlagOverride(
            session,
            config,
            org,
            AUTHZ_COURSE_AUTHORING_FLAG,
            `e2e rollback ${testInfo.testId}`,
          );
          await expect
            .poll(() => hasCompletedMigrationRun(session, config, org, 'rollback'), {
              timeout: TIMEOUTS.rbacMigration,
            })
            .toBe(true);

          // The organization-wide legacy row is back where it started, with its
          // blank course id — the shape that makes it organization-wide. Polled
          // rather than read once, because an organization's rollback covers
          // every course in it and need not finish inside the save the way a
          // single course's does.
          await expect
            .poll(
              async () =>
                (await listCourseAccessRoles(session, config, orgInstructor.identity.email)).filter(
                  (row) => row.org === org && row.courseKey === '' && row.role === 'instructor',
                ).length,
              {
                timeout: TIMEOUTS.rbacMigration,
                message: 'the organization-wide row should be back exactly as it was granted',
              },
            )
            .toBe(1);
        });

        // Its holder still runs the organization's own course…
        expect(
          await readCoursePermissions(
            orgInstructor.request,
            config,
            courseKey,
            orgInstructor.identity.username,
            { writableBlock },
          ),
        ).toEqual(FULL_COURSE_ACCESS);

        // …and still gets nowhere in another organization's.
        expect(
          await readCoursePermissions(
            orgInstructor.request,
            config,
            contentCourse.courseKey,
            orgInstructor.identity.username,
            { writableBlock: courseUsageKey(contentCourse.courseKey) },
          ),
        ).toEqual(NO_COURSE_ACCESS);
      } finally {
        await adminLms((session) => revokeLegacyRole(session, config, rowPk));
      }
    },
  );
});
