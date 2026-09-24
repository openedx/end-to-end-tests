import { expect, test } from '../../../src/fixtures';
import { LEGACY_EDITOR_SELECTORS, TIMEOUTS } from '../../../src/config';
import {
  authorStaffGradedOra,
  buildSection,
  ensureTeamsTopic,
  fetchXBlock,
} from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * The ORA team-submissions switch (TC-00115, "does this switch work?"): with
 * `openresponseassessment.team_submissions` off, ORA's Studio editor offers no
 * Teams setting; switched on, it does, and an author can make the assignment a
 * team one over one of the course's team sets.
 *
 * The switch is platform-wide, so `oraTeamSwitch` holds it under a lock, off
 * until the test turns it on and off again afterwards. edx-ora2 also honours a
 * course flag, a flag and `FEATURES['ENABLE_ORA_TEAM_SUBMISSIONS']`; a target
 * that sets one of those shows the setting with the switch off, which fails the
 * first reading below for a reason of its configuration.
 */
test.describe(
  'ORA team submissions switch',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@ora', '@teams'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'offers the Teams setting in the ORA editor only while the switch is on',
      { annotation: testId('TC-00115') },
      async (
        { page, config, authoringCourse, studioAuthorSession, studioUnitPage, oraTeamSwitch },
        testInfo,
      ) => {
        void studioAuthorSession;
        const request = page.request;
        const { courseKey } = authoringCourse;
        const teamSet = `e2e-set-${testInfo.testId.slice(-6)}r${testInfo.retry}`;
        await ensureTeamsTopic(request, config, courseKey, {
          id: teamSet,
          name: 'E2E team set',
          description: 'E2E team set',
          type: 'open',
        });
        const section = await buildSection(request, config, courseKey, 'E2E team ORA', {
          subsections: [{ units: [{ blocks: [] }] }],
        });
        const unit = section.units[0]!;
        const oraKey = await authorStaffGradedOra(request, config, unit.usageKey, 'E2E team ORA');

        // Switch off: no Teams setting.
        await studioUnitPage.goto(unit.usageKey);
        let editor = await studioUnitPage.openOraSettings(oraKey);
        await expect(
          editor.locator(LEGACY_EDITOR_SELECTORS.oraTeamsEnabled),
          'the Teams setting shows with the switch off: the target turns team submissions on ' +
            'another way (a course flag, a flag or FEATURES["ENABLE_ORA_TEAM_SUBMISSIONS"])',
        ).toHaveCount(0);

        // Switch on: the setting, over the course's team sets.
        await oraTeamSwitch.turnOn();
        await studioUnitPage.goto(unit.usageKey);
        editor = await studioUnitPage.openOraSettings(oraKey);
        await editor.locator(LEGACY_EDITOR_SELECTORS.oraTeamsEnabled).selectOption('1');
        const teamSets = editor.locator(`${LEGACY_EDITOR_SELECTORS.oraTeamSet} option`);
        await expect(teamSets).toHaveCount(1);
        await expect(teamSets).toHaveAttribute('value', teamSet);
        await editor.locator(LEGACY_EDITOR_SELECTORS.oraTeamSet).selectOption(teamSet);
        const saved = await studioUnitPage.saveOraEditor(editor);
        expect(saved.ok()).toBe(true);

        expect((await fetchXBlock(request, config, oraKey)).metadata).toMatchObject({
          teams_enabled: true,
          selected_teamset_id: teamSet,
        });
      },
    );
  },
);
