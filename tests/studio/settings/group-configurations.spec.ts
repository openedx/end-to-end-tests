import { checkA11y } from '../../../src/a11y';
import {
  createCohort,
  DEFAULT_PASSWORD,
  enableCohorts,
  fetchGroupConfigurations,
  fetchStudioUsername,
  linkCohortToGroup,
  loginSession,
} from '../../../src/api';
import { getRunId } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Group Configurations (authoring MFE), on the worker's own course.
 *
 * The MFE drives the change; Studio's `group_configurations` API decides whether
 * the content group was created. Content-group configurations cannot be deleted
 * once a course uses them, so this adds a uniquely-named group and asserts on that
 * name rather than resetting the course.
 */
test.describe('Group Configurations', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  test(
    'adds a content group',
    { tag: '@regression', annotation: testId('TC-00291') },
    async ({ page, config, authoredCourse, groupConfigurationsPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      const groupName = `E2E Group ${getRunId()}-${Date.now().toString(36)}`;

      await groupConfigurationsPage.goto(courseKey);
      const created = await groupConfigurationsPage.addContentGroup(courseKey, groupName);
      expect(created.status).toBeLessThan(300);

      // Studio reports a content-group configuration carrying the new group.
      await expect
        .poll(async () => {
          const configs = await fetchGroupConfigurations(api, config, courseKey);
          return configs
            .filter((cfg) => cfg.scheme === 'cohort')
            .flatMap((cfg) => cfg.groups.map((group) => group.name));
        })
        .toContain(groupName);

      await checkA11y(page, { label: 'studio-group-configurations' });
    },
  );

  // TC-00292 (create cohorts and assign them to content groups) crosses into the
  // The LMS instructor cohorts API assigns a cohort to a content group; a learner
  // added to that cohort is then governed by the group. The content group is
  // created in the UI (as TC-00291), the cohort linked and populated via the API.
  // Gated `@cohorts`.
  test(
    'creates a cohort and assigns it to a content group',
    { tag: ['@regression', '@cohorts'], annotation: testId('TC-00292') },
    async ({
      page,
      playwright,
      config,
      authoredCourse,
      groupConfigurationsPage,
      studioAuthorSession,
    }) => {
      void studioAuthorSession;
      const api = page.request;
      const { courseKey } = authoredCourse;
      const groupName = `E2E cohort group ${getRunId()}-${Date.now().toString(36)}`;

      await groupConfigurationsPage.goto(courseKey);
      expect(
        (await groupConfigurationsPage.addContentGroup(courseKey, groupName)).status,
      ).toBeLessThan(300);

      // Read the content group the author just made.
      const cohortConfig = await expect
        .poll(async () =>
          (await fetchGroupConfigurations(api, config, courseKey)).find(
            (cfg) => cfg.scheme === 'cohort' && cfg.groups.some((g) => g.name === groupName),
          ),
        )
        .toBeDefined()
        .then(async () =>
          (await fetchGroupConfigurations(api, config, courseKey)).find(
            (cfg) => cfg.scheme === 'cohort' && cfg.groups.some((g) => g.name === groupName),
          ),
        );
      const partitionId = cohortConfig?.id as number;
      const groupId = cohortConfig?.groups.find((g) => g.name === groupName)?.id as number;

      // Cohorts are LMS instructor views behind Django **session** auth, which the
      // browser and stored author API state do not reliably hold here (only a JWT,
      // which those views reject with a login redirect — a 405 on the write). Sign
      // the author in afresh on a throwaway context for a live LMS session; the
      // author is this worker's own account, so this evicts no session another test
      // still needs. Enable cohorts, create one and link it to the content group.
      const authorUsername = await fetchStudioUsername(api, config);
      const cohortApi = await playwright.request.newContext();
      try {
        await loginSession(cohortApi, config, {
          emailOrUsername: authorUsername,
          password: DEFAULT_PASSWORD,
        });
        await enableCohorts(cohortApi, config, courseKey);
        const cohort = await createCohort(cohortApi, config, courseKey, `E2E cohort ${getRunId()}`);
        const linked = await linkCohortToGroup(
          cohortApi,
          config,
          courseKey,
          cohort,
          partitionId,
          groupId,
        );
        // The cohort now points at the content group — the assignment TC-00292 makes.
        expect(linked.user_partition_id).toBe(partitionId);
        expect(linked.group_id).toBe(groupId);
      } finally {
        await cohortApi.dispose();
      }
    },
  );
});
