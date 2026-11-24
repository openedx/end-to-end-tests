import { checkA11y } from '../../../src/a11y';
import {
  addToCohort,
  buildSection,
  createCohort,
  DEFAULT_PASSWORD,
  enableCohorts,
  fetchGroupConfigurations,
  fetchStudioUsername,
  linkCohortToGroup,
  loginSession,
  publishXBlock,
  updateXBlock,
} from '../../../src/api';
import { newCleanRequestContext } from '../../../src/auth';
import { getRunId, TIMEOUTS } from '../../../src/config';
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

  // TC-00292 (create cohorts and assign them to content groups). The author
  // makes the content group in the UI (as TC-00291) and restricts a unit to it;
  // a cohort is linked to the group and one of two enrolled learners placed in
  // it. The link is read back from the cohort, and what it is for is read from
  // the learners' own courses: only the cohort's member is served the unit.
  // The cohort itself is made through the LMS API here — the instructor
  // dashboard's Cohorts tab drives the same steps under TC-00539. Gated `@cohorts`.
  test(
    'creates a cohort, assigns it to a content group and only its member sees the group’s content',
    { tag: ['@regression', '@cohorts'], annotation: testId('TC-00292') },
    async ({
      page,
      playwright,
      config,
      authoringCourse,
      groupConfigurationsPage,
      studioAuthorSession,
      authoringCourseLearners,
    }) => {
      test.setTimeout(TIMEOUTS.contentTest);
      void studioAuthorSession;
      const api = page.request;
      const { courseKey } = authoringCourse;
      const [inCohort, outOfCohort] = authoringCourseLearners;
      const suffix = `${getRunId()}-${Date.now().toString(36)}`;
      const groupName = `E2E cohort group ${suffix}`;

      await groupConfigurationsPage.goto(courseKey);
      expect(
        (await groupConfigurationsPage.addContentGroup(courseKey, groupName)).status,
      ).toBeLessThan(300);

      // Read the content group the author just made.
      const cohortGroup = async () =>
        (await fetchGroupConfigurations(api, config, courseKey)).find(
          (cfg) => cfg.scheme === 'cohort' && cfg.groups.some((g) => g.name === groupName),
        );
      await expect.poll(cohortGroup).toBeDefined();
      const cohortConfig = await cohortGroup();
      const partitionId = cohortConfig?.id as number;
      const groupId = cohortConfig?.groups.find((g) => g.name === groupName)?.id as number;

      // Two published units, the second restricted to the content group.
      const section = await buildSection(api, config, courseKey, `E2E cohort content ${suffix}`, {
        subsections: [{ units: [{ blocks: ['html'] }, { blocks: ['html'] }] }],
      });
      const openUnit = section.units[0]!.usageKey;
      const restrictedUnit = section.units[1]!.usageKey;
      await updateXBlock(api, config, restrictedUnit, {
        metadata: { group_access: { [partitionId]: [groupId] } },
      });
      await publishXBlock(api, config, section.usageKey);

      // Cohorts are LMS instructor views behind Django **session** auth, which the
      // browser and stored author API state do not reliably hold here (only a JWT,
      // which those views reject with a login redirect — a 405 on the write). Sign
      // the author in afresh on a throwaway context for a live LMS session; the
      // author is this worker's own account, so this evicts no session another test
      // still needs. Enable cohorts, create one, link it to the content group and
      // place one learner in it.
      const authorUsername = await fetchStudioUsername(api, config);
      const cohortApi = await newCleanRequestContext(playwright.request);
      try {
        await loginSession(cohortApi, config, {
          emailOrUsername: authorUsername,
          password: DEFAULT_PASSWORD,
        });
        await enableCohorts(cohortApi, config, courseKey);
        const cohort = await createCohort(cohortApi, config, courseKey, `E2E cohort ${suffix}`);
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
        await addToCohort(cohortApi, config, courseKey, cohort.id, inCohort.identity.username);
      } finally {
        await cohortApi.dispose();
      }

      // The cohort's member is served both units; the learner outside it only
      // the unrestricted one (which shows their course has caught up with the
      // publish, so the restricted unit's absence is not a lagging read).
      const served = async (learner: (typeof authoringCourseLearners)[number]) => {
        const ids = (await learner.outline()).units.map((unit) => unit.id);
        return { open: ids.includes(openUnit), restricted: ids.includes(restrictedUnit) };
      };
      await expect
        .poll(() => served(inCohort), { timeout: TIMEOUTS.contentPublish })
        .toEqual({ open: true, restricted: true });
      await expect
        .poll(() => served(outOfCohort), { timeout: TIMEOUTS.contentPublish })
        .toEqual({ open: true, restricted: false });
    },
  );
});
