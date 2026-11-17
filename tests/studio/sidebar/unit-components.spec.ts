import { buildSection, fetchContainerChildren } from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Selecting and acting on a unit's component cards from the Verawood unit-page
 * sidebar (BTR TC-00498, 00499). Clicking a component card shows its Info in the
 * sidebar with a Back control and its own overflow menu; the menu's actions
 * (duplicate) change the unit's children, read from the container API.
 *
 * Gated on `studio-sidebar`; `studioAuthorSession` resolves last.
 */
test.describe(
  'Authoring unit-page component cards',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@studio-sidebar'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'selects component cards and returns to the unit with the back control',
      { annotation: testId('TC-00498') },
      async ({
        page,
        config,
        authoringCourse,
        authoringSidebar,
        studioUnitPage,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E components ${test.info().testId.slice(-6)}`,
        );
        const unit = section.units.at(0);
        const [first, second] = section.blocks;
        if (unit === undefined || first === undefined || second === undefined) {
          throw new Error('buildSection produced no unit with two components.');
        }
        await studioUnitPage.goto(unit.usageKey);

        // Selecting a component re-titles the sidebar with the component's name and
        // shows the Back control and the component's overflow menu.
        await studioUnitPage.selectComponent(first.usageKey);
        await expect(authoringSidebar.title).toHaveText(first.displayName);
        await expect(authoringSidebar.backButton).toBeVisible();
        await expect(authoringSidebar.itemMenuButton).toBeVisible();

        // Selecting a different component switches the selection.
        await studioUnitPage.selectComponent(second.usageKey);
        await expect(authoringSidebar.title).toHaveText(second.displayName);

        // Back returns to the whole-unit Info (titled with the unit's name).
        await authoringSidebar.backButton.click();
        await expect(authoringSidebar.title).toHaveText(unit.displayName);
        await expect(authoringSidebar.backButton).toHaveCount(0);
      },
    );

    test(
      'duplicates and deletes a component from its sidebar overflow menu',
      { tag: '@smoke', annotation: testId('TC-00499') },
      async ({
        page,
        config,
        authoringCourse,
        authoringSidebar,
        studioUnitPage,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E comp actions ${test.info().testId.slice(-6)}`,
        );
        const unit = section.units[0]!;
        const first = section.blocks[0]!;
        const childKeys = async () =>
          (await fetchContainerChildren(page.request, config, unit.usageKey)).map(
            (c) => c.block_id,
          );
        await studioUnitPage.goto(unit.usageKey);
        const before = await childKeys();

        // The selected component's Duplicate adds a copy to the unit.
        await studioUnitPage.selectComponent(first.usageKey);
        await (await authoringSidebar.itemMenuAction('component', 'duplicate')).click();
        await expect
          .poll(async () => (await childKeys()).length, { timeout: TIMEOUTS.contentWrite })
          .toBe(before.length + 1);

        // Its Delete asks for confirmation; confirmed, the component is gone.
        await studioUnitPage.selectComponent(first.usageKey);
        await authoringSidebar.deleteSelected('component');
        await expect
          .poll(childKeys, { timeout: TIMEOUTS.contentWrite })
          .not.toContain(first.usageKey);
        expect(await childKeys()).toHaveLength(before.length);
      },
    );
  },
);
