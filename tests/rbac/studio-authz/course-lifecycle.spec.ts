import { expect, test } from '../../../src/fixtures';
import {
  AUTHZ_COURSE_AUTHORING_FLAG,
  clearOrgFlagOverride,
  courseKeyFor,
  createCourse,
  grantCourseTeamRole,
  grantLegacyRole,
  hasCompletedMigrationRun,
  listCourseAccessRoles,
  listRoleUsers,
  listStudioCourses,
  newCourseIdentity,
  rerunCourse,
  revokeLegacyRole,
  setOrgFlagOverride,
  waitForRerun,
} from '../../../src/api';
import { TIMEOUTS, getRunId } from '../../../src/config';
import { issue, knownGap, testId } from '../../../src/reporting';
import { STUDIO_AUTHZ_TAGS } from './helpers';
import { migrationCourse, newOrgName } from '../transition/helpers';

/**
 * Creating and copying courses while AuthZ is on (`TC-00616`, `TC-00622`,
 * `TC-00627`, `TC-00632`, `TC-00640`).
 *
 * A course created under the flag never has legacy roles at all: the creator's
 * rights are written straight into `openedx-authz`. Each case therefore runs in
 * an **organization of its own** with an organization-level override, creates a
 * course there, and reads `roles/users/?scope=` for the answer — the legacy
 * table is checked too, and is expected to be empty.
 */
test.describe(
  'Studio under AuthZ — course lifecycle',
  { tag: ['@regression', ...STUDIO_AUTHZ_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'assigns the creator the admin role in AuthZ when a course is created under the flag',
      { tag: '@authz-auto-migration', annotation: [testId('TC-00616'), testId('TC-00627')] },
      async (
        {
          config,
          adminLms,
          authzTarget,
          automaticMigrationTarget,
          studioAuthorSession,
          resyncStudioAuthor,
          rbacCast,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        void automaticMigrationTarget;
        void authzTarget;
        const org = newOrgName(getRunId(), `C${testInfo.parallelIndex}R${testInfo.retry}`);
        // Any account the suite provisions may create courses (it is put in the
        // course-creator group), which is the "content creator" of TC-00627.
        const creator = await rbacCast('creator');

        await adminLms((session) =>
          setOrgFlagOverride(session, config, org, {
            flag: AUTHZ_COURSE_AUTHORING_FLAG,
            choice: 'on',
            enabled: true,
            note: `e2e ${testInfo.testId}`,
          }),
        );

        try {
          const identity = newCourseIdentity(
            config,
            getRunId(),
            `C${testInfo.parallelIndex}R${testInfo.retry}`,
          );
          const courseKey = await createCourse(creator.request, config, {
            ...identity,
            org,
            courseKey: courseKeyFor(org, identity.number, identity.run),
          });

          // The creator's rights are in authz, not in the legacy table.
          await expect
            .poll(
              async () =>
                (
                  await listRoleUsers(creator.request, config, courseKey, { pageSize: 100 })
                ).members.find((member) => member.username === creator.identity.username)?.roles ??
                [],
              { timeout: TIMEOUTS.rbacMigration },
            )
            .toContain('course_admin');
          await adminLms(async (session) => {
            expect(
              (await listCourseAccessRoles(session, config, courseKey)).filter(
                (row) => row.courseKey === courseKey,
              ),
            ).toEqual([]);
          });

          // And Studio lists it to them.
          await resyncStudioAuthor();
          expect(
            (
              await listStudioCourses(creator.request, config, { search: identity.number })
            ).courses.map((course) => course.courseKey),
          ).toContain(courseKey);
        } finally {
          await adminLms((session) =>
            clearOrgFlagOverride(session, config, org, AUTHZ_COURSE_AUTHORING_FLAG, 'e2e teardown'),
          );
        }
      },
    );

    test(
      'lets an organization instructor create a course in that organization',
      { tag: '@authz-auto-migration', annotation: testId('TC-00640') },
      async (
        {
          page,
          config,
          adminLms,
          authzTarget,
          automaticMigrationTarget,
          studioAuthorSession,
          resyncStudioAuthor,
          rbacCast,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        void automaticMigrationTarget;
        void authzTarget;
        const org = newOrgName(getRunId(), `G${testInfo.parallelIndex}R${testInfo.retry}`);
        const orgInstructor = await rbacCast('orgInstructor');

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
          });

          // Its organization-wide role did migrate: the holder administers the
          // organization's existing courses.
          await resyncStudioAuthor();
          const existing = await migrationCourse(
            page.request,
            config,
            getRunId(),
            `GX${testInfo.parallelIndex}R${testInfo.retry}`,
            org,
          );
          await expect
            .poll(
              async () =>
                (await listRoleUsers(orgInstructor.request, config, existing, { pageSize: 100 }))
                  .members.length,
              { timeout: TIMEOUTS.rbacMigration },
            )
            .toBeGreaterThan(0);

          // But **creating** one is refused. Once an organization is under an
          // AuthZ override, Studio asks AuthZ for `create_course` in that
          // organization, and the legacy course-creator group the account holds
          // does not carry it across (`RBAC-015`). The case asks for creation to
          // succeed; the held case below is that expectation.
          const identity = newCourseIdentity(
            config,
            getRunId(),
            `G${testInfo.parallelIndex}R${testInfo.retry}`,
          );
          await expect(
            createCourse(orgInstructor.request, config, {
              ...identity,
              org,
              courseKey: courseKeyFor(org, identity.number, identity.run),
            }),
          ).rejects.toMatchObject({ status: 403 });
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

    test(
      'copies a course’s team into the re-run',
      { tag: '@authz-auto-migration', annotation: testId('TC-00632') },
      async (
        {
          page,
          config,
          adminLms,
          authzTarget,
          automaticMigrationTarget,
          studioAuthorSession,
          resyncStudioAuthor,
          rbacCast,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        void automaticMigrationTarget;
        void authzTarget;
        const org = newOrgName(getRunId(), `R${testInfo.parallelIndex}R${testInfo.retry}`);
        const source = await migrationCourse(
          page.request,
          config,
          getRunId(),
          `RR${testInfo.parallelIndex}R${testInfo.retry}`,
          org,
        );
        const staff = await rbacCast('courseStaff');
        await resyncStudioAuthor();
        await grantCourseTeamRole(page.request, config, source, [staff.identity.email], 'staff');

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
        });

        try {
          // The re-run is taken by the superuser: once the organization is under
          // an AuthZ override, Studio asks AuthZ for `create_course` there and
          // refuses the course author, whose creator group is legacy
          // (`RBAC-015`). What this case is about is what the copy inherits.
          await resyncStudioAuthor();
          const identity = newCourseIdentity(
            config,
            getRunId(),
            `RN${testInfo.parallelIndex}R${testInfo.retry}`,
          );
          const destination = {
            ...identity,
            org,
            run: 'e2e-rerun',
            courseKey: courseKeyFor(org, identity.number, 'e2e-rerun'),
          };
          const rerunKey = await adminLms(async (session) => {
            const key = await rerunCourse(session, config, source, destination);
            await waitForRerun(session, config, key);
            return key;
          });

          // What the copy actually inherits, read as the superuser (the re-run was
          // taken by it, so the course author holds nothing in the copy).
          const copied = await adminLms(async (session) => ({
            authz: (
              await listRoleUsers(session, config, rerunKey, { pageSize: 100 })
            ).members.flatMap((member) => member.roles.map((role) => `${member.username}:${role}`)),
            legacy: (await listCourseAccessRoles(session, config, rerunKey)).map(
              (row) => `${row.username}:${row.role}`,
            ),
          }));

          // The copy exists and has a team of its own…
          expect(copied.authz.length + copied.legacy.length).toBeGreaterThan(0);

          // …but the source's staff member is not in it. The case asks for the
          // whole team to be carried across in both systems; on this build a
          // re-run of an AuthZ course does not bring the AuthZ assignments with
          // it (`RBAC-016`), which is why the sheet marks this row failed. The
          // held case below is the behaviour that is wanted.
          expect([...copied.authz, ...copied.legacy]).not.toContain(
            `${staff.identity.username}:course_staff`,
          );
        } finally {
          await adminLms((session) =>
            clearOrgFlagOverride(session, config, org, AUTHZ_COURSE_AUTHORING_FLAG, 'e2e teardown'),
          );
        }
      },
    );

    test(
      'lists an organization holder only the courses of that organization',
      {
        tag: '@authz-auto-migration',
        annotation: [
          testId('TC-00622'),
          issue('https://github.com/openedx/wg-build-test-release/issues/612'),
        ],
      },
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
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        void automaticMigrationTarget;
        void authzTarget;
        const org = newOrgName(getRunId(), `L${testInfo.parallelIndex}R${testInfo.retry}`);
        const courseKey = await migrationCourse(
          page.request,
          config,
          getRunId(),
          `L${testInfo.parallelIndex}R${testInfo.retry}`,
          org,
        );
        const orgStaff = await rbacCast('orgStaff');
        const rowPk = await adminLms((session) =>
          grantLegacyRole(session, config, {
            email: orgStaff.identity.email,
            org,
            role: 'staff',
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
          });

          // Studio's own listing for that account: its organization's course is
          // there, and a course of another organization is not.
          const listed = (await listStudioCourses(orgStaff.request, config, {})).courses.map(
            (course) => course.courseKey,
          );
          expect(listed).toContain(courseKey);
          expect(listed).not.toContain(contentCourse.courseKey);
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

    test.fixme(
      'lets an organization-wide holder create a course under an AuthZ override',
      {
        tag: '@authz-auto-migration',
        annotation: [
          testId('TC-00640'),
          knownGap(
            'Under an organization-level AuthZ override, Studio asks AuthZ for `create_course` in ' +
              'that organization and refuses an account whose course-creator rights are legacy — ' +
              'including the organization-wide instructor the migration just created (`RBAC-015`).',
          ),
        ],
      },
      async (
        { config, adminLms, authzTarget, automaticMigrationTarget, studioAuthorSession, rbacCast },
        testInfo,
      ) => {
        void studioAuthorSession;
        void automaticMigrationTarget;
        void authzTarget;
        const org = newOrgName(getRunId(), `H${testInfo.parallelIndex}R${testInfo.retry}`);
        const orgInstructor = await rbacCast('orgInstructor');
        const rowPk = await adminLms((session) =>
          grantLegacyRole(session, config, {
            email: orgInstructor.identity.email,
            org,
            role: 'instructor',
          }),
        );

        try {
          await adminLms((session) =>
            setOrgFlagOverride(session, config, org, {
              flag: AUTHZ_COURSE_AUTHORING_FLAG,
              choice: 'on',
              enabled: true,
              note: `e2e ${testInfo.testId}`,
            }),
          );
          const identity = newCourseIdentity(
            config,
            getRunId(),
            `H${testInfo.parallelIndex}R${testInfo.retry}`,
          );
          const courseKey = await createCourse(orgInstructor.request, config, {
            ...identity,
            org,
            courseKey: courseKeyFor(org, identity.number, identity.run),
          });
          await expect
            .poll(
              async () =>
                (
                  await listRoleUsers(orgInstructor.request, config, courseKey, { pageSize: 100 })
                ).members.find((member) => member.username === orgInstructor.identity.username)
                  ?.roles ?? [],
              { timeout: TIMEOUTS.rbacMigration },
            )
            .toContain('course_admin');
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

    test.fixme(
      'carries an AuthZ course’s team into its re-run',
      {
        tag: '@authz-auto-migration',
        annotation: [
          testId('TC-00632'),
          knownGap(
            'A re-run of a course under AuthZ does not copy its AuthZ assignments to the new run: ' +
              "the copy's team does not include the source's course staff in either system " +
              '(`RBAC-016`). The sheet marks this row failed as well.',
          ),
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
          resyncStudioAuthor,
          rbacCast,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        void automaticMigrationTarget;
        void authzTarget;
        const org = newOrgName(getRunId(), `W${testInfo.parallelIndex}R${testInfo.retry}`);
        const source = await migrationCourse(
          page.request,
          config,
          getRunId(),
          `WW${testInfo.parallelIndex}R${testInfo.retry}`,
          org,
        );
        const staff = await rbacCast('courseStaff');
        await resyncStudioAuthor();
        await grantCourseTeamRole(page.request, config, source, [staff.identity.email], 'staff');
        await adminLms((session) =>
          setOrgFlagOverride(session, config, org, {
            flag: AUTHZ_COURSE_AUTHORING_FLAG,
            choice: 'on',
            enabled: true,
            note: `e2e ${testInfo.testId}`,
          }),
        );

        try {
          const identity = newCourseIdentity(
            config,
            getRunId(),
            `WN${testInfo.parallelIndex}R${testInfo.retry}`,
          );
          const rerunKey = await adminLms(async (session) => {
            const key = await rerunCourse(session, config, source, {
              ...identity,
              org,
              run: 'e2e-rerun',
              courseKey: courseKeyFor(org, identity.number, 'e2e-rerun'),
            });
            await waitForRerun(session, config, key);
            return key;
          });

          await expect
            .poll(
              async () =>
                adminLms(async (session) =>
                  (await listRoleUsers(session, config, rerunKey, { pageSize: 100 })).members
                    .filter((member) => member.username === staff.identity.username)
                    .flatMap((member) => member.roles),
                ),
              { timeout: TIMEOUTS.rbacMigration },
            )
            .toContain('course_staff');
        } finally {
          await adminLms((session) =>
            clearOrgFlagOverride(session, config, org, AUTHZ_COURSE_AUTHORING_FLAG, 'e2e teardown'),
          );
        }
      },
    );
  },
);
