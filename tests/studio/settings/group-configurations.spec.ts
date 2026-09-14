import { checkA11y } from '../../../src/a11y';
import { fetchGroupConfigurations } from '../../../src/api';
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
  // LMS instructor cohorts API (`/courses/<key>/cohorts/`), which the suite has no
  // client for yet, and needs the `cohorts` capability declared. Gated so it skips
  // where cohorts are not enabled; a `fixme` until the cohorts API is added.
  test.fixme(
    'creates cohorts and assigns them to content groups',
    { tag: ['@regression', '@cohorts'], annotation: testId('TC-00292') },
    async ({ request, config, authoredCourse }) => {
      const configs = await fetchGroupConfigurations(request, config, authoredCourse.courseKey);
      expect(configs.some((cfg) => cfg.scheme === 'cohort')).toBe(true);
    },
  );
});
