import { test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { testId } from '../../../src/reporting';
import { expectRenderedForLearner, listAndAddFromTile } from './component-helpers';

/**
 * Advanced problem/component types in a unit (TC-00212): the core advanced
 * XBlocks (poll, survey, word cloud) ungated, and the separately
 * capability-gated ones (LTI, edx-sga, SCORM).
 *
 * The case's own steps drive each one: the author adds the type from the unit
 * page's Advanced tile (listing it in Advanced Settings first where the platform
 * does not offer it by default) and publishes the unit from its Publish button;
 * then a learner opens the unit and the block renders. Each type's own
 * behaviour is its matrix row's in `advanced-modules.spec.ts` or its own spec.
 */

/**
 * A type, whether the platform offers it without an Advanced Settings entry,
 * and how a freshly added (unconfigured) one renders for a learner.
 */
interface AdvancedType {
  readonly category: string;
  readonly offeredByDefault: boolean;
  readonly rendered?: 'visible' | 'attached';
}

test.describe(
  'Studio advanced component types',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    const cases: readonly { title: string; tags: string[]; types: readonly AdvancedType[] }[] = [
      {
        title: 'the core advanced components (poll, survey, word cloud)',
        tags: [],
        types: [
          { category: 'poll', offeredByDefault: true },
          { category: 'survey', offeredByDefault: true },
          { category: 'word_cloud', offeredByDefault: true },
        ],
      },
      {
        title: 'an LTI consumer component',
        tags: ['@lti'],
        types: [{ category: 'lti_consumer', offeredByDefault: true }],
      },
      {
        title: 'a Staff Graded Assignment (edx-sga) component',
        tags: ['@edx-sga'],
        types: [{ category: 'edx_sga', offeredByDefault: false }],
      },
      {
        title: 'a SCORM component',
        tags: ['@scorm'],
        // A SCORM block plays the package its author uploads; without one its
        // player renders empty, so a learner is shown the block's (empty) root.
        // Playing a package needs a SCORM package fixture the suite does not have.
        types: [{ category: 'scorm', offeredByDefault: false, rendered: 'attached' }],
      },
    ];

    for (const { title, tags, types } of cases) {
      test(
        `adds ${title} from the Advanced tile, publishes, and a learner sees it`,
        { tag: [...tags], annotation: testId('TC-00212') },
        async (
          {
            page,
            config,
            authoringCourse,
            studioAuthorSession,
            studioUnitPage,
            authoringCourseLearner,
          },
          testInfo,
        ) => {
          void studioAuthorSession;
          for (const type of types) {
            const ctx = await listAndAddFromTile(
              { request: page.request, config, studioUnitPage },
              authoringCourse.courseKey,
              type,
              `E2E ${type.category} ${testInfo.testId.slice(-6)}R${testInfo.retry}`,
            );
            await studioUnitPage.publish();
            await expectRenderedForLearner(
              authoringCourseLearner,
              ctx,
              type.category,
              type.rendered,
            );
          }
        },
      );
    }
  },
);
