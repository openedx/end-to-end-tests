/*
 * Discussion (`discussion`) tests.
 *
 * ## In a course, with the legacy provider (runs)
 *
 * The block only renders inline when the course's discussion provider is
 * `legacy` (`DiscussionConfigService.is_discussion_visible`); under the default
 * `openedx` provider it deliberately renders nothing (plan C8.9). Discussions run
 * in-process (the `openedx-forum` package, Tutor's `forum` plugin), so the target
 * needs that enabled. Steps:
 *
 *  1. As the admin, switch the worker course's provider to `legacy`
 *     (CMS `POST /api/discussions/v0/course/<key>/settings`; changing provider needs
 *     the `change_provider` permission). Switched back to `openedx` at the end.
 *  2. As the Studio author, create a section > subsection > unit holding a
 *     `discussion` block (category/target set via the xblock API); publish.
 *  3. Provision a fresh enrolled learner; wait for the block in their outline.
 *  4. As the learner, open the unit; assert `.discussion-module` renders (the
 *     block's template) and read its topic (`data-discussion-id`). Post a thread
 *     to that topic through the discussion API.
 *  5. Reload the unit. Assert `discussion_bundle.js`, the block's webpack bundle,
 *     has expanded the thread list (it does so on load) with the post listed.
 *  6. Click "Hide Discussion", then "Show Discussion": the list hides and comes
 *     back, still showing the post.
 *
 * ## Library round trip (set aside)
 *
 * Steps 1–9 are the shared round trip in `./round-trip.ts`, with OLX setting a
 * discussion category and target; step 6 asserts the course copy carries them.
 * Then, as the learner:
 *
 * 10. Assert the block's wrapper is in the unit. Whether it shows inline content
 *     depends on the course's discussion provider: `legacy` renders
 *     `.discussion-module`; `openedx` renders nothing inline (plan C8.9) and uses
 *     the sidebar instead. Either is accepted here; a server error is not.
 */
import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import {
  buildSection,
  createThread,
  createXBlock,
  publishXBlock,
  studioOrigin,
  studioWriteHeaders,
  updateXBlock,
} from '../../../src/api';
import { waitForLearnerBlock } from '../../../src/steps';
import { ROUND_TRIP_TAGS, libraryToLearner, xml } from './round-trip';
import { label } from '../library/helpers';

/**
 * Switches a course's discussion provider (`legacy` renders the inline block).
 * The settings API lives in the CMS (`api/discussions/`); the LMS copy is deprecated.
 */
async function setDiscussionProvider(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  provider: 'legacy' | 'openedx',
): Promise<string> {
  const url = `${studioOrigin(config)}/api/discussions/v0/course/${courseKey}/settings`;
  const response = await request.post(url, {
    headers: await studioWriteHeaders(request, config),
    data: { provider_type: provider },
  });
  expect(response.ok(), `discussion provider → ${provider}: HTTP ${response.status()}`).toBe(true);
  return ((await response.json()) as { provider_type: string }).provider_type;
}

test.describe('xblocks-core: Discussion', { tag: [...ROUND_TRIP_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test('in a course: learner sees the inline discussion and a post', async ({
    page,
    config,
    studioAuthorSession,
    resyncStudioAuthor,
    contentCourse,
    roundTripLearnerLater,
    adminLms,
  }, testInfo) => {
    void studioAuthorSession;
    const { courseKey } = contentCourse;
    const name = label('discussion', testInfo.testId);
    const postTitle = `E2E post ${testInfo.testId.slice(-8)}`;

    // 1. Legacy provider, so the block renders inline.
    const provider = await adminLms((s) => setDiscussionProvider(s, config, courseKey, 'legacy'));
    expect(provider).toBe('legacy');
    try {
      // 2. Author the block in a new unit and publish.
      await resyncStudioAuthor();
      const section = await buildSection(page.request, config, courseKey, name, {
        subsections: [{ units: [{ blocks: [] }] }],
      });
      const unitKey = section.units[0]?.usageKey ?? '';
      const subsectionKey = section.subsections[0]?.usageKey ?? '';
      const blockKey = await createXBlock(page.request, config, {
        parentLocator: unitKey,
        category: 'discussion',
        displayName: name,
      });
      await updateXBlock(page.request, config, blockKey, {
        metadata: {
          display_name: name,
          discussion_category: `E2E ${testInfo.testId.slice(-6)}`,
          discussion_target: 'Inline',
        },
      });
      await publishXBlock(page.request, config, unitKey);

      // 3. A learner.
      const learner = await roundTripLearnerLater();
      const seen = await waitForLearnerBlock(learner.outline, blockKey);
      expect(seen.satisfied, `learner outline blocks: ${seen.last.join(', ')}`).toBe(true);

      // 4. The block renders; post to its topic through the discussion API.
      await learner.prime(subsectionKey);
      await learner.unitPage.goto(courseKey, subsectionKey, unitKey);
      const module = learner.unitPage.block(blockKey).locator('.discussion-module');
      await expect(module).toBeVisible();
      const topicId = (await module.getAttribute('data-discussion-id')) ?? '';
      expect(topicId).not.toBe('');
      await createThread(learner.request, config, {
        courseKey,
        topicId,
        type: 'discussion',
        title: postTitle,
        body: 'E2E post body',
      });

      // 5. On reload, the bundle expands the thread list, now with the post.
      await learner.unitPage.goto(courseKey, subsectionKey, unitKey);
      await expect(module).toBeVisible();
      const toggle = module.locator('.discussion-show');
      const threads = module.locator('section.inline-discussion');
      await expect(toggle).toHaveClass(/\bshown\b/);
      await expect(threads.getByText(postTitle)).toBeVisible();

      // 6. The toggle hides and re-shows it.
      await toggle.click();
      await expect(threads).toHaveClass(/\bis-hidden\b/);
      await toggle.click();
      await expect(threads).not.toHaveClass(/\bis-hidden\b/);
      await expect(threads.getByText(postTitle)).toBeVisible();
    } finally {
      await adminLms((s) => setDiscussionProvider(s, config, courseKey, 'openedx'));
    }
  });

  // FIXME: fails reliably on master (2026-11-02) and Verawood: the block never
  // appears in the course's library picker (the library search index), so this
  // can't tell a refactor regression apart. Re-enable once that's fixed.
  test.fixme('library → Studio → learner unit renders', async ({
    page,
    config,
    studioAuthorSession,
    resyncStudioAuthor,
    contentCourse,
    roundTripLearnerLater,
    studioUnitPage,
    libraryPicker,
  }, testInfo) => {
    void studioAuthorSession;
    const fx = {
      page,
      config,
      resyncStudioAuthor,
      contentCourse,
      roundTripLearnerLater,
      studioUnitPage,
      libraryPicker,
    };
    const category = `E2E ${testInfo.testId.slice(-6)}`;
    const { learner, blockKey } = await libraryToLearner(fx, testInfo, {
      blockType: 'discussion',
      olx: (name) =>
        `<discussion display_name="${xml(name)}" discussion_category="${xml(category)}"` +
        ` discussion_target="Tracer" />`,
      olxContains: [`discussion_category="${category}"`],
      courseMetadata: { discussion_category: category, discussion_target: 'Tracer' },
    });

    const block = learner.unitPage.block(blockKey);
    await expect(block).toBeAttached();
    await expect(block.locator('.xblock-error, .xmodule_error')).toHaveCount(0);
  });
});
