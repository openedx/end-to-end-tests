import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  buildSection,
  fetchContainer,
  publishXBlock,
} from '../../../src/api';
import { testId } from '../../../src/reporting';
import { waitForLearnerBlock } from '../../../src/steps';
import { LIBRARY_TAGS, label } from './helpers';

/**
 * A PDF block authored in a library, reused in a course unit and viewed by a
 * learner (TC-00512) — the library-sourced half of the PDF cases (the in-course
 * PDF is `tests/studio/components/pdf.spec.ts`, TC-00511).
 */
test.describe(
  'PDF block from a library',
  { tag: ['@regression', '@mfe-learning', '@pdf-xblock', ...LIBRARY_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'a learner views a PDF block reused from a library',
      { annotation: testId('TC-00512') },
      async (
        {
          page,
          config,
          studioAuthorSession,
          resyncStudioAuthor,
          seededLibrary,
          contentCourse,
          roundTripLearnerLater,
          studioUnitPage,
          libraryPicker,
        },
        testInfo,
      ) => {
        void studioAuthorSession;
        await resyncStudioAuthor();
        const { pdf } = seededLibrary.blocks;
        const section = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          label('pdf', testInfo.testId),
          {
            subsections: [{ units: [{ blocks: [] }] }],
          },
        );
        const unitKey = section.units[0]?.usageKey ?? '';
        const subsectionKey = section.subsections[0]?.usageKey ?? '';

        await studioUnitPage.goto(unitKey);
        const types = availableComponentTypes(await fetchContainer(page.request, config, unitKey));
        await studioUnitPage.openAddComponent(types.indexOf('library_v2'));
        await libraryPicker.selectLibrary(seededLibrary.libraryKey, seededLibrary.library.title);
        await libraryPicker
          .cardFor(pdf.display_name)
          .first()
          .waitFor({ timeout: TIMEOUTS.librarySearch });
        const added = (await (await libraryPicker.addToCourse(pdf.display_name)).json()) as {
          locator: string;
        };

        await publishXBlock(page.request, config, unitKey);

        const learner = await roundTripLearnerLater();
        const seen = await waitForLearnerBlock(learner.outline, added.locator);
        expect(seen.satisfied, `learner outline blocks: ${seen.last.join(', ')}`).toBe(true);
        expect((await learner.outline()).blocks[added.locator]?.type).toBe('pdf');
        await learner.prime(subsectionKey);
        await learner.unitPage.goto(contentCourse.courseKey, subsectionKey, unitKey);
        // The block renders (its embedded viewer is an iframe/object of its own).
        await expect(learner.unitPage.block(added.locator)).toBeVisible();
      },
    );
  },
);
