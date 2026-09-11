import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, fetchXBlockOutline } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Building the course outline in Studio and seeing the result as a learner — the
 * epic's core cross-service claim (CMS → modulestore → LMS → learning MFE in one
 * test).
 *
 * The UI drives the authoring; the **`xblock/outline` API decides the author-side
 * outcome** and the **learner's Blocks API decides the round trip**. Card display
 * names are the suite's own data (it typed them), so matching them in the LMS is
 * allowed — that is what the round trip is about.
 *
 * Author writes go through the browser's own session (`page.request`), not the
 * `request` fixture: a browser Studio session and a standalone API session evict
 * each other under `PREVENT_CONCURRENT_LOGINS` (see
 * `.private/findings.md` / `studio-browser-session-decays`).
 */
test.describe(
  'Course outline structure',
  { tag: ['@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test(
      'expands and collapses every section in the outline',
      { tag: '@regression', annotation: testId('TC-00142') },
      async ({ page, config, studioCourseOutlinePage, contentCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        // Two sections so "all" is meaningful; built through the browser session.
        const label = sectionLabel(test.info());
        await buildSection(page.request, config, contentCourse.courseKey, `${label} A`, {
          subsections: [{ units: [{ blocks: ['html'] }] }],
        });
        await buildSection(page.request, config, contentCourse.courseKey, `${label} B`, {
          subsections: [{ units: [{ blocks: ['html'] }] }],
        });

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await expect(studioCourseOutlinePage.sectionCards.first()).toBeVisible();
        expect(await studioCourseOutlinePage.sectionCards.count()).toBeGreaterThanOrEqual(2);

        // The expand chevrons expose no non-localized state, so the observable of
        // "all expanded / collapsed" is whether the sections' subsection cards are
        // shown or hidden.
        await studioCourseOutlinePage.setAllExpanded(true);
        await expect(studioCourseOutlinePage.subsectionCards.first()).toBeVisible();

        await studioCourseOutlinePage.setAllExpanded(false);
        await expect(studioCourseOutlinePage.subsectionCards.first()).toBeHidden();
      },
    );

    test(
      'creates and names a section, subsection and unit, publishes, and a learner sees them',
      { tag: '@smoke', annotation: testId('TC-00143') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const label = sectionLabel(test.info());
        const sectionName = `${label} section`;
        const subsectionName = `${label} subsection`;
        const unitName = `${label} unit`;

        await studioCourseOutlinePage.goto(contentCourse.courseKey);

        // Author the tree through the UI, capturing the usage keys the platform
        // assigns. Each new child is added under the card just created (the last
        // of its level in this test's run); the content course is shared, so once
        // the unit exists every level is named by locating the card that contains
        // it — never by its position or its default text.
        const sectionKey = await studioCourseOutlinePage.addSection();
        // The new section is appended last; capture that card and scope the child
        // adds within it, so a subsection or unit from another (collapsed) section
        // in the shared course is never targeted.
        const sectionCard = studioCourseOutlinePage.sectionCards.last();
        const subsectionKey = await studioCourseOutlinePage.addSubsection(sectionCard);
        const subsectionCard = sectionCard.locator('[data-testid="subsection-card"]').last();
        // "New unit" navigates to the unit page; come back to the outline to name
        // and publish the tree there.
        const unitKey = await studioCourseOutlinePage.addUnit(subsectionCard);
        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        // A reloaded outline is collapsed; collapsed sections do not render their
        // child cards, so expand before locating them by usage key.
        await studioCourseOutlinePage.setAllExpanded(true);

        await studioCourseOutlinePage.rename(
          studioCourseOutlinePage.unit(unitKey),
          'unit',
          unitName,
        );
        await studioCourseOutlinePage.rename(
          studioCourseOutlinePage.subsection(unitKey),
          'subsection',
          subsectionName,
        );
        await studioCourseOutlinePage.rename(
          studioCourseOutlinePage.section(unitKey),
          'section',
          sectionName,
        );

        // Author side: the tree exists with the names the author gave it. The
        // unit is still a draft.
        const sectionOutline = await fetchXBlockOutline(page.request, config, sectionKey);
        expect(sectionOutline.display_name).toBe(sectionName);
        expect(sectionOutline.child_info?.children.map((c) => c.id)).toContain(subsectionKey);
        expect(await fetchXBlockOutline(page.request, config, unitKey)).toMatchObject({
          display_name: unitName,
          published: false,
        });

        // Publish the unit through its outline card menu.
        await studioCourseOutlinePage.publish(studioCourseOutlinePage.unit(unitKey), 'unit');
        expect(await fetchXBlockOutline(page.request, config, unitKey)).toMatchObject({
          published: true,
          has_changes: false,
          visibility_state: 'live',
        });

        // Round trip: the learner's Blocks API lists the unit under the named
        // subsection, and the names are the ones the author typed.
        await expect
          .poll(async () => (await roundTripLearner.outline()).units.map((u) => u.id), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toContain(unitKey);
        const outline = await roundTripLearner.outline();
        const unit = outline.units.find((u) => u.id === unitKey);
        expect(unit?.displayName).toBe(unitName);
        expect(unit?.sequentialId).toBe(subsectionKey);
        expect(outline.blocks[subsectionKey]?.display_name).toBe(subsectionName);
        expect(outline.blocks[sectionKey]?.display_name).toBe(sectionName);
      },
    );
  },
);

/** A section-name prefix unique to this test, safe to match as the test's own data. */
function sectionLabel(info: { testId: string }): string {
  return `E2E TC143 ${info.testId.slice(-6)}`;
}
