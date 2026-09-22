import { expect, test } from '../../../src/fixtures';
import {
  AUTHZ_COURSE_AUTHORING_FLAG,
  LEGACY_ROLE_EQUIVALENTS,
  clearOrgFlagOverride,
  countCourseAccessRoles,
  courseUsageKey,
  enrollInCourseViaApi,
  fetchMigrationRunLedger,
  grantLegacyRole,
  hasCompletedMigrationRun,
  listRoleUsers,
  listUserAssignments,
  revokeLegacyRole,
  setOrgFlagOverride,
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
 * Turning AuthZ course authoring **on** for a scope, and what the platform does
 * with that scope's roles (`TC-00587`–`TC-00599`, `TC-00615`).
 *
 * On a target that migrates automatically the whole transition happens inside
 * the admin save: by the time the redirect lands, the legacy rows are gone, the
 * authz assignments exist, and a migration run records what moved. So these
 * cases read three independent oracles for one event — the run's own ledger, the
 * authz API, and the legacy admin — and then re-read the permission matrix of
 * `roles/legacy-matrix.spec.ts` to show that **nothing an actor may do changed**.
 *
 * Each test migrates a course (or an organization) it created for itself, and
 * rolls it back when it ends: migration is a one-way door for a scope's roles,
 * and the shared worker courses are not the place to open it.
 */
test.describe(
  'AuthZ transition — enable and migrate',
  { tag: ['@regression', ...TRANSITION_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'migrates a course’s whole team and leaves every role’s access exactly as it was',
      {
        annotation: [
          testId('TC-00587'),
          testId('TC-00588'),
          testId('TC-00589'),
          testId('TC-00590'),
          testId('TC-00591'),
          testId('TC-00592'),
          testId('TC-00593'),
          testId('TC-00594'),
          testId('TC-00595'),
          testId('TC-00596'),
          testId('TC-00597'),
          testId('TC-00598'),
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
          studioColleague,
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
          `F${testInfo.parallelIndex}`,
        );

        // The five legacy roles the migration maps, plus a learner who holds none
        // of them: TC-00598's "no-role users still have no access".
        const roles = ['instructor', 'staff', 'limited_staff', 'data_researcher', 'beta'] as const;
        const actors: {
          role: (typeof roles)[number];
          actor: Awaited<ReturnType<typeof studioColleague>>;
        }[] = [];
        for (const role of roles) {
          actors.push({ role, actor: await studioColleague() });
        }
        await seedLegacyTeam(
          page.request,
          config,
          courseKey,
          actors.map(({ role, actor }) => ({ email: actor.identity.email, role })),
        );
        const learner = await studioColleague();
        await enrollInCourseViaApi(learner.request, config, courseKey);
        await resyncStudioAuthor();
        const writableBlock = await writableSection(
          page.request,
          config,
          courseKey,
          `E2E migration ${testInfo.testId.slice(-6)}`,
        );

        // Phase one: what each actor may do while the course is still legacy.
        const before = new Map<string, PermissionReadings>();
        for (const { role, actor } of [...actors, { role: 'learner', actor: learner }]) {
          before.set(
            role,
            await readCoursePermissions(actor.request, config, courseKey, actor.identity.username, {
              writableBlock,
            }),
          );
        }
        expect(before.get('instructor')).toEqual(FULL_COURSE_ACCESS);
        expect(before.get('learner')).toEqual({ ...NO_COURSE_ACCESS, courseware: 200 });

        try {
          const ledger = await adminLms(async (session) => {
            // TC-00587: the course has legacy rows to migrate before the flag goes on.
            expect(await countCourseAccessRoles(session, config, courseKey)).toBeGreaterThan(0);

            const outcome = await enableAuthzForCourse(session, config, courseKey, {
              mode: 'automatic',
              note: `e2e ${testInfo.testId}`,
            });
            expect(outcome.enabled).toBe(true);
            expect(outcome.migrated).toBe(true);
            expect(await hasCompletedMigrationRun(session, config, courseKey, 'forward')).toBe(
              true,
            );

            // "The legacy role should have been removed" — the note on all five
            // mapping cases. The admin's own list is the reading.
            expect(await countCourseAccessRoles(session, config, courseKey)).toBe(0);
            return fetchMigrationRunLedger(session, config, {
              scopeKey: courseKey,
              migrationType: 'forward',
            });
          });

          // TC-00588–00592: the run's ledger names every mapping it made, by the
          // legacy role and the account it belonged to.
          expect(ledger?.errorCount).toBe(0);
          const migrated = new Map(
            (ledger?.successes ?? [])
              .filter((entry) => entry.scope === courseKey)
              .map((entry) => [`${entry.subject}:${entry.role}`, entry]),
          );
          for (const { role, actor } of actors) {
            // The model spells the beta role `beta_testers` where the instructor
            // API calls it `beta`; the ledger uses the model's spelling.
            const legacy = role === 'beta' ? 'beta_testers' : role;
            expect(
              migrated.has(`${actor.identity.username}:${legacy}`),
              `the run should record ${actor.identity.username}'s ${legacy} role`,
            ).toBe(true);
          }

          // Second oracle: the authz API itself, where each legacy role has become
          // its documented equivalent.
          const team = await listRoleUsers(page.request, config, courseKey);
          const rolesOf = (username: string) =>
            team.members.find((member) => member.username === username)?.roles ?? [];
          for (const { role, actor } of actors) {
            const legacy = role === 'beta' ? 'beta_testers' : role;
            expect(
              rolesOf(actor.identity.username),
              `${legacy} should map to its authz role`,
            ).toEqual([LEGACY_ROLE_EQUIVALENTS[legacy]]);
          }
          expect(rolesOf(learner.identity.username)).toEqual([]);

          // TC-00593–00598: the whole point of the transition. Every actor's
          // reading is what it was before the flag — same table, second phase.
          for (const { role, actor } of [...actors, { role: 'learner', actor: learner }]) {
            expect(
              await readCoursePermissions(
                actor.request,
                config,
                courseKey,
                actor.identity.username,
                {
                  writableBlock,
                },
              ),
              `${role} should keep exactly the access it had before the migration`,
            ).toEqual(before.get(role));
          }
        } finally {
          await adminLms((session) =>
            disableAuthzForCourse(session, config, courseKey, { mode: 'automatic' }),
          );
        }
      },
    );

    test(
      'migrates an organization-wide role with its organization, and no further',
      { annotation: [testId('TC-00615'), testId('TC-00599')] },
      async (
        {
          page,
          config,
          contentCourse,
          adminLms,
          authzTarget,
          automaticMigrationTarget,
          studioAuthorSession,
          studioColleague,
          resyncStudioAuthor,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        void automaticMigrationTarget;
        void authzTarget;
        // An organization of this test's own: an override there names every course
        // in it, so it must not be an organization anything else authors in.
        const org = newOrgName(getRunId(), `O${testInfo.parallelIndex}`);
        const courseKey = await migrationCourse(
          page.request,
          config,
          getRunId(),
          `O${testInfo.parallelIndex}`,
          org,
        );
        const orgInstructor = await studioColleague();
        await resyncStudioAuthor();
        const writableBlock = await writableSection(
          page.request,
          config,
          courseKey,
          `E2E org migration ${testInfo.testId.slice(-6)}`,
        );

        const rowPk = await adminLms((session) =>
          grantLegacyRole(session, config, {
            email: orgInstructor.identity.email,
            org,
            role: 'instructor',
          }),
        );

        try {
          // The organization-wide role already reaches the course; this is the
          // reading the migration has to preserve.
          expect(
            await readCoursePermissions(
              orgInstructor.request,
              config,
              courseKey,
              orgInstructor.identity.username,
              { writableBlock },
            ),
          ).toEqual(FULL_COURSE_ACCESS);

          const ledger = await adminLms(async (session) => {
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
            return fetchMigrationRunLedger(session, config, {
              scopeKey: org,
              migrationType: 'forward',
            });
          });

          // TC-00615: the organization-wide row migrates to an organization-wide
          // authz assignment — a glob scope covering every course in it, which is
          // how one row keeps covering courses created later.
          expect(ledger?.errorCount).toBe(0);
          const globScope = `course-v1:${org}+*`;
          expect(
            (ledger?.successes ?? []).some(
              (entry) =>
                entry.subject === orgInstructor.identity.username && entry.scope === globScope,
            ),
            'the run should record the organization-wide role at a glob scope',
          ).toBe(true);
          const assignments = await listUserAssignments(
            orgInstructor.request,
            config,
            orgInstructor.identity.username,
          );
          expect(assignments.assignments.map((row) => `${row.role}@${row.scope ?? ''}`)).toContain(
            `${LEGACY_ROLE_EQUIVALENTS.instructor}@${globScope}`,
          );

          // …and the access it stands for is unchanged.
          expect(
            await readCoursePermissions(
              orgInstructor.request,
              config,
              courseKey,
              orgInstructor.identity.username,
              { writableBlock },
            ),
          ).toEqual(FULL_COURSE_ACCESS);

          // TC-00599: and it stops at the organization's edge — a course in
          // another organization is refused, migration or no migration.
          expect(
            await readCoursePermissions(
              orgInstructor.request,
              config,
              contentCourse.courseKey,
              orgInstructor.identity.username,
              // That course's own root block: a write probe has to aim at the
              // course it is probing, or it measures the wrong permission.
              { writableBlock: courseUsageKey(contentCourse.courseKey) },
            ),
          ).toEqual(NO_COURSE_ACCESS);
        } finally {
          await adminLms(async (session) => {
            await clearOrgFlagOverride(
              session,
              config,
              org,
              AUTHZ_COURSE_AUTHORING_FLAG,
              'e2e teardown',
            );
            await revokeLegacyRole(session, config, rowPk);
          });
        }
      },
    );
  },
);
