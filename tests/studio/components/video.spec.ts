import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  fetchContainer,
  fetchContainerChildren,
  fetchXBlock,
} from '../../../src/api';
import { issue, testId } from '../../../src/reporting';
import { buildUnit } from './component-helpers';

/**
 * Adding a video component through the unit page's editor (TC-00213) and its
 * advanced settings (TC-00215). Playback is never driven (`PLAT-002`/`PLAT-003`);
 * the assertions are the saved metadata (author side) and the block rendering for
 * the learner.
 *
 * Transcripts (TC-00214) are a `fixme`: the upload path is VAL-backed and its
 * read-back was not established (§1.9).
 */
test.describe(
  'Studio video component',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'adds a YouTube video and sets an advanced download option',
      { annotation: [testId('TC-00213'), testId('TC-00215')] },
      async ({
        page,
        config,
        studioUnitPage,
        studioVideoEditor,
        authoringCourse,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const unitKey = await buildUnit(page.request, config, authoringCourse.courseKey, {
          label: 'video',
        });

        await studioUnitPage.goto(unitKey);
        const types = availableComponentTypes(await fetchContainer(page.request, config, unitKey));
        await studioUnitPage.openAddComponent(types.indexOf('video'));

        await studioVideoEditor.setVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        await studioVideoEditor.setAllowDownloads(true);
        await studioVideoEditor.save();

        // The unit now has a video block whose source is the YouTube id.
        const components = await fetchContainerChildren(page.request, config, unitKey);
        const video = components.find((c) => c.block_type === 'video');
        expect(video).toBeDefined();
        const metadata = (await fetchXBlock(page.request, config, video?.block_id ?? '')).metadata;
        expect(metadata['youtube_id_1_0']).toBe('dQw4w9WgXcQ');
        expect(metadata['download_video']).toBe(true);
      },
    );

    // TC-00214: transcript upload is VAL-backed and its read-back was not
    // established (§1.9). Declared `fixme` against the intended behaviour.
    test.fixme(
      'uploads a transcript for a video (§1.9)',
      {
        annotation: [
          testId('TC-00214'),
          issue('https://github.com/openedx/end-to-end-tests/issues/39'),
        ],
      },
      async () => {
        // Intentionally empty: no fixtures set up until the transcript read-back is
        // established.
      },
    );
  },
);
