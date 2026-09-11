import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, fetchXBlockOutline, type AuthoredSection } from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Section (TC-00153) and subsection (TC-00155) release date controlling learner
 * access, asserted **both** sides of the boundary.
 *
 * Dates are fixed and far from now (never "now ± minutes"): a future date the
 * learner cannot yet reach, then a past date they can. The author sets the date
 * in the outline's Configure dialog; the round trip is the learner's Blocks API
 * omitting then including the block once the date is moved into the past.
 */
test.describe(
  'Course outline release dates',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    // Round trips poll the learner under TIMEOUTS.contentPublish (longer than the
    // default per-test budget), so the block-structure task's delay under load
    // does not trip the test timeout.
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    const FAR_FUTURE = '2100-01-01T00:00:00Z';
    const FAR_PAST = '2000-01-01T00:00:00Z';

    test(
      "a section's release date governs learner access",
      { annotation: testId('TC-00153') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        outlineConfigureDialog,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await published(
          page.request,
          config,
          contentCourse.courseKey,
          test.info(),
          'sec',
        );
        const unitKey = only(section.units);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);

        // Future date: the learner cannot reach the section.
        await outlineConfigureDialog.open(studioCourseOutlinePage.section(unitKey), 'section');
        await outlineConfigureDialog.setReleaseDate(FAR_FUTURE);
        await outlineConfigureDialog.save();
        expect(
          Date.parse(
            (await fetchXBlockOutline(page.request, config, section.usageKey)).start as string,
          ),
        ).toBe(Date.parse(FAR_FUTURE));
        await learnerSees(roundTripLearner, unitKey, false);

        // Past date: the learner can.
        await outlineConfigureDialog.open(studioCourseOutlinePage.section(unitKey), 'section');
        await outlineConfigureDialog.setReleaseDate(FAR_PAST);
        await outlineConfigureDialog.save();
        await learnerSees(roundTripLearner, unitKey, true);
      },
    );

    test(
      "a subsection's release date governs learner access",
      { annotation: testId('TC-00155') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        outlineConfigureDialog,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
      }) => {
        void studioAuthorSession;
        const section = await published(
          page.request,
          config,
          contentCourse.courseKey,
          test.info(),
          'sub',
        );
        const subsectionKey = only(section.subsections);
        const unitKey = only(section.units);

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);

        await outlineConfigureDialog.open(
          studioCourseOutlinePage.subsection(unitKey),
          'subsection',
        );
        await outlineConfigureDialog.setReleaseDate(FAR_FUTURE);
        await outlineConfigureDialog.save();
        expect(
          Date.parse(
            (await fetchXBlockOutline(page.request, config, subsectionKey)).start as string,
          ),
        ).toBe(Date.parse(FAR_FUTURE));
        await learnerSees(roundTripLearner, unitKey, false);

        await outlineConfigureDialog.open(
          studioCourseOutlinePage.subsection(unitKey),
          'subsection',
        );
        await outlineConfigureDialog.setReleaseDate(FAR_PAST);
        await outlineConfigureDialog.save();
        await learnerSees(roundTripLearner, unitKey, true);
      },
    );
  },
);

async function learnerSees(
  learner: { outline: () => Promise<{ units: readonly { id: string }[] }> },
  unitKey: string,
  present: boolean,
): Promise<void> {
  await expect
    .poll(async () => (await learner.outline()).units.some((u) => u.id === unitKey), {
      timeout: TIMEOUTS.contentPublish,
    })
    .toBe(present);
}

function published(
  request: Parameters<typeof buildSection>[0],
  config: Parameters<typeof buildSection>[1],
  courseKey: string,
  info: { testId: string },
  tag: string,
) {
  return buildSection(request, config, courseKey, `E2E rel-${tag} ${info.testId.slice(-6)}`, {
    subsections: [{ units: [{ blocks: ['html'] }] }],
    publish: true,
  });
}

function only(items: AuthoredSection['units'] | AuthoredSection['subsections']): string {
  const [first] = items;
  if (first === undefined) throw new Error('The section is missing an item.');
  return first.usageKey;
}
