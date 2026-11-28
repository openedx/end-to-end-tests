import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  availableComponentTypes,
  fetchContainer,
  fetchContainerChildren,
  fetchXBlock,
} from '../../../src/api';
import { knownGap, testId } from '../../../src/reporting';
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
      'adds a YouTube video and sets its download and start/stop time options',
      { tag: '@smoke', annotation: [testId('TC-00213'), testId('TC-00215')] },
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
        await studioVideoEditor.setStartAndStopTimes('00:00:05', '00:00:20');
        await studioVideoEditor.save();

        // The unit now has a video block whose source is the YouTube id.
        const components = await fetchContainerChildren(page.request, config, unitKey);
        const video = components.find((c) => c.block_type === 'video');
        expect(video).toBeDefined();
        const metadata = (await fetchXBlock(page.request, config, video?.block_id ?? '')).metadata;
        expect(metadata['youtube_id_1_0']).toBe('dQw4w9WgXcQ');
        expect(metadata['download_video']).toBe(true);
        // The Duration widget's times, as the block stores them (`h:mm:ss`).
        expect(String(metadata['start_time'])).toMatch(/^0?0:00:05$/);
        expect(String(metadata['end_time'])).toMatch(/^0?0:00:20$/);
      },
    );

    // TC-00214: transcript upload is VAL-backed and its read-back was not
    // established. Declared `fixme` against the intended behaviour; a suite gap,
    // not a platform defect, so it carries no issue link.
    test.fixme(
      'uploads a transcript for a video',
      {
        annotation: [
          testId('TC-00214'),
          knownGap(
            'Suite gap: transcript upload is VAL-backed and its read-back is not yet established',
          ),
        ],
      },
      async () => {
        // Intentionally empty: no fixtures set up until the transcript read-back is
        // established.
      },
    );
  },
);
