import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS, getRunId } from '../../../src/config';
import {
  AUTHZ_COURSE_AUTHORING_FLAG,
  canI,
  clearOrgFlagOverride,
  countMigrationRuns,
  fetchCourseTeam,
  fetchWaffleFlagStates,
  grantCourseTeamRole,
  isAuthzEnabledForCourse,
  listRoleUsers,
  setCourseFlagOverride,
  setCourseTeamRole,
  setOrgFlagOverride,
} from '../../../src/api';
import {
  disableAuthzForCourse,
  enableAuthzForCourse,
  waitForCourseFlagState,
} from '../../../src/steps';
import { testId } from '../../../src/reporting';

/**
 * How `authz.enable_course_authoring` behaves as a **scoped** switch: what a
 * per-course override does and does not reach, what a target that does not
 * migrate automatically does when the flag is toggled, and what a course whose
 * flag is turned back off falls back to.
 *
 * Two kinds of target, one spec. Whether saving a waffle override also migrates
 * the scope's roles is a deployment setting
 * (`ENABLE_AUTOMATIC_AUTHZ_COURSE_AUTHORING_MIGRATION`), which the
 * `authzMigrationMode` fixture probes once per worker against an organization
 * that holds no courses. TC-00613/00614 describe the **stock** default — a
 * toggle that migrates nothing — so they are tagged `@authz-manual-migration`
 * and take `manualMigrationTarget`, which fails them where the target migrates
 * by itself after all; the rest runs everywhere.
 *
 * Admin work is batched: every `adminLms` call is an admin sign-in, and a long
 * one would hold the cross-worker lock past its staleness window.
 */
test.describe(
  'AuthZ flag scoping and defaults',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@rbac'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'a course-level override reaches that course and no other',
      { annotation: testId('TC-00639') },
      async ({ page, config, adminLms, authzTarget, authoredCourse }) => {
        // The worker's AuthZ course carries the override; the worker's ordinary
        // course is the control, and nothing in this test touches it.
        const states = await fetchWaffleFlagStates(page.request, config);
        expect(states.courseOverrides.on).toContain(authzTarget.courseKey);
        expect(states.courseOverrides.on).not.toContain(authoredCourse.courseKey);

        expect(await isAuthzEnabledForCourse(page.request, config, authzTarget.courseKey)).toBe(
          true,
        );
        expect(await isAuthzEnabledForCourse(page.request, config, authoredCourse.courseKey)).toBe(
          false,
        );

        // What the flag *means* for each course, asked of authz itself: the
        // author holds a role in the AuthZ course and may manage its team, while
        // the control course has no authz roles at all — nobody holds one there,
        // so even its creator is refused its team list.
        expect(
          (await listRoleUsers(page.request, config, authzTarget.courseKey)).count,
        ).toBeGreaterThan(0);
        expect(
          await canI(page.request, config, 'courses.manage_course_team', authzTarget.courseKey),
        ).toBe(true);
        expect(
          await canI(page.request, config, 'courses.manage_course_team', authoredCourse.courseKey),
        ).toBe(false);
        await expect(
          listRoleUsers(page.request, config, authoredCourse.courseKey),
        ).rejects.toMatchObject({ status: 403 });

        // The migration record says the same thing, in whichever way this target
        // migrates: the override's own course moved where the target migrates by
        // itself, and the control course never moved at all.
        const runs = await adminLms(async (session) => ({
          target: await countMigrationRuns(session, config, {
            scopeKey: authzTarget.courseKey,
            migrationType: 'forward',
            status: 'completed',
          }),
          control: await countMigrationRuns(session, config, {
            scopeKey: authoredCourse.courseKey,
          }),
        }));
        expect(runs.target > 0).toBe(authzTarget.mode === 'automatic');
        expect(runs.control).toBe(0);
      },
    );

    test(
      'disabling the flag returns a course to legacy permissions',
      { annotation: testId('TC-00646') },
      async ({
        page,
        config,
        adminLms,
        authoringCourse,
        authzTarget,
        studioAuthorSession,
        resyncStudioAuthor,
        studioColleague,
      }) => {
        void studioAuthorSession;
        const courseKey = authoringCourse.courseKey;
        // Provisioned before the admin work: provisioning an account signs the
        // admin in for the course-creator grant, which would end a session held
        // across it.
        const colleague = await studioColleague();

        // Put this course under AuthZ the way the epic's fixtures do, then take
        // it back off — the transition the case is about, in one admin session.
        const transition = await adminLms(async (session) => {
          const enabled = await enableAuthzForCourse(session, config, courseKey, {
            mode: authzTarget.mode,
            note: `e2e ${getRunId()} TC-00646`,
          });
          const disabled = await disableAuthzForCourse(session, config, courseKey, {
            mode: authzTarget.mode,
          });
          return { enabled, disabled };
        });
        expect(transition.enabled.enabled).toBe(true);
        expect(transition.enabled.migrated).toBe(authzTarget.mode === 'automatic');
        expect(transition.disabled.enabled).toBe(false);
        expect(transition.disabled.rolledBack).toBe(authzTarget.mode === 'automatic');

        // With the flag off, the legacy path is what a team write uses: adding a
        // member through Studio's own course-team API succeeds… Re-sync first:
        // provisioning the colleague rotated this author's Studio session, and a
        // legacy write on a stale one is redirected to sign-in (CONVENTIONS.md,
        // "Library round trips").
        await resyncStudioAuthor();
        await setCourseTeamRole(page.request, config, courseKey, colleague.identity.email, 'staff');
        expect(
          (await fetchCourseTeam(page.request, config, courseKey)).map((member) => member.email),
        ).toContain(colleague.identity.email);

        // …and creates nothing on the authz side, which the superuser can see
        // even where a scoped user would be refused.
        const authzTeam = await adminLms((session) => listRoleUsers(session, config, courseKey));
        expect(authzTeam.members.map((member) => member.username)).not.toContain(
          colleague.identity.username,
        );

        // The member can work in the course: legacy access is what counts now.
        const index = await colleague.request.get(
          `${config.baseUrls.studio ?? ''}/api/contentstore/v1/course_index/${courseKey}`,
        );
        expect(index.status()).toBe(200);
      },
    );

    test(
      'a course-level toggle migrates nothing where automatic migration is off',
      { tag: '@authz-manual-migration', annotation: testId('TC-00613') },
      async ({ page, config, adminLms, authoringCourse, manualMigrationTarget, newLearner }) => {
        void manualMigrationTarget;
        const courseKey = authoringCourse.courseKey;
        const member = await newLearner();
        await grantCourseTeamRole(
          page.request,
          config,
          courseKey,
          [member.identity.email],
          'staff',
        );
        const legacyBefore = await fetchCourseTeam(page.request, config, courseKey);

        const readings = await adminLms(async (session) => {
          await setCourseFlagOverride(session, config, courseKey, {
            flag: AUTHZ_COURSE_AUTHORING_FLAG,
            choice: 'on',
            enabled: true,
            note: `e2e ${getRunId()} TC-00613`,
          });
          await waitForCourseFlagState(session, config, courseKey, true);
          const runs = await countMigrationRuns(session, config, { scopeKey: courseKey });
          const authzTeam = await listRoleUsers(session, config, courseKey);
          // Leave the course as it was found, whatever the assertions say.
          await disableAuthzForCourse(session, config, courseKey, { mode: 'manual' });
          return { runs, authzMembers: authzTeam.count };
        });

        // Nothing was migrated: no run was recorded, authz holds no assignment
        // for the course, and the legacy team is exactly what it was.
        expect(readings.runs).toBe(0);
        expect(readings.authzMembers).toBe(0);
        expect(await fetchCourseTeam(page.request, config, courseKey)).toEqual(legacyBefore);
      },
    );

    test(
      'an org-level toggle migrates nothing where automatic migration is off',
      { tag: '@authz-manual-migration', annotation: testId('TC-00614') },
      async ({ config, adminLms, manualMigrationTarget }) => {
        void manualMigrationTarget;
        // An organization of this run's own, with no courses in it: an override
        // on a shared organization would turn AuthZ on for every worker's courses
        // at once, and on a target that migrates nothing that locks their teams
        // out of Studio. The course-level half of the same handler is TC-00613.
        const org = `E2EDEFAULT${getRunId()}`.toUpperCase();
        const note = `e2e ${getRunId()} TC-00614`;
        const readings = await adminLms(async (session) => {
          try {
            await setOrgFlagOverride(session, config, org, {
              flag: AUTHZ_COURSE_AUTHORING_FLAG,
              choice: 'on',
              enabled: true,
              note,
            });
            const states = await fetchWaffleFlagStates(session, config);
            return {
              declared: states.orgOverrides.on.includes(org),
              runs: await countMigrationRuns(session, config, { scopeKey: org }),
            };
          } finally {
            await clearOrgFlagOverride(
              session,
              config,
              org,
              AUTHZ_COURSE_AUTHORING_FLAG,
              `${note} teardown`,
            );
          }
        });

        expect(readings.declared).toBe(true);
        expect(readings.runs).toBe(0);
      },
    );
  },
);
