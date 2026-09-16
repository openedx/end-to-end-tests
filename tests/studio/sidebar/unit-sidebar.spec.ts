import { checkA11y } from '../../../src/a11y';
import { buildSection, fetchXBlockOutline } from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { SIDEBAR_A11Y_BASELINE } from './helpers';

/**
 * The Verawood authoring sidebar on the unit page (BTR TC-00494, 00495): it
 * renders with the Info / Add / Align rail (no Help, unlike the outline), a
 * page-switcher dropdown, the unit's name as the title, the collapse and resize
 * controls, and the unit's Details/Settings Info tabs with a Publish button that
 * tracks the unit's draft state. Structure is asserted structurally; the publish
 * state is read from the xblock outline API.
 *
 * Gated on `authoring-sidebar`; fixtures ordered so `studioAuthorSession` primes
 * the browser session last.
 */
test.describe(
  'Authoring unit-page sidebar',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@authoring-sidebar'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'renders with the expected structure and basic controls',
      { annotation: testId('TC-00494') },
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
          `E2E unit sidebar ${test.info().testId.slice(-6)}`,
        );
        const unit = section.units.at(0);
        if (unit === undefined) throw new Error('buildSection produced no unit.');
        await studioUnitPage.goto(unit.usageKey);

        // The panel is rendered and expanded on the Info page, titled with the unit's name.
        await expect(authoringSidebar.panel).toBeVisible();
        expect(await authoringSidebar.isPageActive('info')).toBe(true);
        await expect(authoringSidebar.pageDropdownToggle).toBeVisible();
        await expect(authoringSidebar.title).toHaveText(unit.displayName);

        // The unit rail offers Info / Add / Align, but no Help (that is outline-only).
        await expect(authoringSidebar.railButton('info')).toBeVisible();
        await expect(authoringSidebar.railButton('add')).toBeVisible();
        await expect(authoringSidebar.railButton('align')).toBeVisible();
        await expect(authoringSidebar.railButton('help')).toHaveCount(0);

        // Collapse / expand behave as on the outline; a resize affordance is offered.
        await authoringSidebar.collapse();
        expect(await authoringSidebar.isOpen()).toBe(false);
        await authoringSidebar.expand();
        expect(await authoringSidebar.isOpen()).toBe(true);
        await expect(authoringSidebar.resizeHandle).toBeVisible();

        await checkA11y(page, {
          label: 'studio-sidebar-unit',
          additionalBaseline: SIDEBAR_A11Y_BASELINE,
        });
      },
    );

    test(
      'shows the unit Info metadata and publishes from the panel',
      { annotation: testId('TC-00495') },
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
          `E2E unit info ${test.info().testId.slice(-6)}`,
        );
        const unit = section.units.at(0);
        if (unit === undefined) throw new Error('buildSection produced no unit.');
        await studioUnitPage.goto(unit.usageKey);

        // The unit Info panel offers Details (default) and Settings tabs.
        await expect(authoringSidebar.tab('unit-info-sidebar-tabs-tab-details')).toBeVisible();
        await expect(authoringSidebar.tab('unit-info-sidebar-tabs-tab-settings')).toBeVisible();

        // The freshly built unit is unpublished, so the panel offers Publish (the
        // API is the source of truth for the draft state).
        expect((await fetchXBlockOutline(page.request, config, unit.usageKey)).has_changes).toBe(
          true,
        );
        await expect(authoringSidebar.unitPublishButton).toBeVisible();

        // Publishing clears the changes and the button.
        await authoringSidebar.publishUnit();
        await expect
          .poll(
            async () => (await fetchXBlockOutline(page.request, config, unit.usageKey)).has_changes,
            { timeout: TIMEOUTS.contentPublish },
          )
          .toBe(false);
        await expect(authoringSidebar.unitPublishButton).toBeHidden({
          timeout: TIMEOUTS.contentPublish,
        });
      },
    );
  },
);
