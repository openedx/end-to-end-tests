import { expect, test } from '../../../src/fixtures';
import { LEGACY_EDITOR_SELECTORS, TIMEOUTS } from '../../../src/config';
import { addAdvancedModules, buildSection, createXBlock } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Using the recommender (recommender-xblock) in Studio: the author changes one
 * of its settings in the block's own editor. The block keeps that setting
 * outside its Studio fields, so the reading that decides is the editor itself,
 * reopened. Its learner view is not driven: it loads its scripts from public
 * CDNs (XBLOCK-001).
 */
test.describe(
  'Recommender component',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'an author changes a recommender setting',
      { annotation: testId('TC-00132') },
      async ({ page, config, authoringCourse, studioAuthorSession, studioUnitPage }) => {
        void studioAuthorSession;
        const request = page.request;
        const { courseKey } = authoringCourse;
        await addAdvancedModules(request, config, courseKey, ['recommender']);
        const section = await buildSection(request, config, courseKey, 'E2E recommender', {
          subsections: [{ units: [{ blocks: [] }] }],
        });
        const unit = section.units[0]!;
        const recommenderKey = await createXBlock(request, config, {
          parentLocator: unit.usageKey,
          category: 'recommender',
          displayName: 'E2E recommender',
        });

        await studioUnitPage.goto(unit.usageKey);
        let editor = await studioUnitPage.openLegacyEditor(recommenderKey);
        const setting = editor.locator(LEGACY_EDITOR_SELECTORS.recommenderEntriesPerPage);
        // The block's default is five entries per page; the author picks three.
        await expect(setting).toHaveValue('5');
        const changed = '3';
        await setting.selectOption(changed);
        const saved = await studioUnitPage.saveLegacyEditor(
          editor,
          LEGACY_EDITOR_SELECTORS.recommenderSave,
          { handler: 'set_client_configuration', closes: false },
        );
        expect(saved.ok()).toBe(true);
        await studioUnitPage.closeLegacyEditor(editor);

        await studioUnitPage.goto(unit.usageKey);
        editor = await studioUnitPage.openLegacyEditor(recommenderKey);
        await expect(editor.locator(LEGACY_EDITOR_SELECTORS.recommenderEntriesPerPage)).toHaveValue(
          changed,
        );
      },
    );
  },
);
