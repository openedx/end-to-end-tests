import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  CSRF_HEADER,
  buildSection,
  fetchCsrfToken,
  fetchXBlockOutline,
  type AuthoredSection,
} from '../../../src/api';
import { satisfyPrerequisiteByScore } from '../../../src/steps';
import { issue, testId } from '../../../src/reporting';
import { firstUnitKey } from './outline-helpers';

/**
 * Subsection prerequisite gating configured in Studio and enforced on the
 * learner side — by minimum score (TC-00159) and by minimum completion
 * (TC-00160), each asserted **both** states: gated before the prerequisite is
 * met, ungated after. Retires Epic 7's TC-00270 `fixme`.
 *
 * The author marks a prerequisite and requires it (with a threshold) in the
 * outline's Configure dialog; `xblock/outline` confirms the author side. The
 * learner then satisfies the prerequisite and the sequence's `gated_content`
 * flips from gated to open — the release-blocking cross-service behavior.
 *
 * The two thresholds are conjunctive, so a score case sets min-completion to 0
 * and a completion case sets min-score to 0 (§1.5).
 */
test.describe(
  'Course outline subsection gating',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'gates a subsection by minimum score in a prerequisite subsection',
      {
        annotation: [
          testId('TC-00159'),
          issue('https://github.com/openedx/end-to-end-tests/issues/39'),
        ],
      },
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
        // Prerequisite subsection with a scoreable problem, and a separate gated
        // subsection — both published so the learner can reach the prerequisite.
        const prereq = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          `E2E gate-pre ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['multiplechoiceresponse'] }] }], publish: true },
        );
        const gated = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          `E2E gate-dep ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html'] }] }], publish: true },
        );
        const prereqSubKey = prereq.subsections[0]?.usageKey ?? '';
        const gatedSubKey = gated.subsections[0]?.usageKey ?? '';
        const gatedUnitKey = gated.units[0]?.usageKey ?? '';
        const problem = gatedProblem(prereq);

        // Configure gating in Studio: mark the prerequisite available, then
        // require it from the gated subsection at a minimum score.
        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await outlineConfigureDialog.open(
          studioCourseOutlinePage.subsection(firstUnitKey(prereq)),
          'subsection',
        );
        await outlineConfigureDialog.markAvailableAsPrerequisite();
        await outlineConfigureDialog.save();
        await outlineConfigureDialog.open(
          studioCourseOutlinePage.subsection(gatedUnitKey),
          'subsection',
        );
        await outlineConfigureDialog.requirePrerequisite(prereqSubKey, {
          minScore: 50,
          minCompletion: 0,
        });
        await outlineConfigureDialog.save();

        // Author side.
        expect((await fetchXBlockOutline(page.request, config, prereqSubKey)).is_prereq).toBe(true);
        expect(await fetchXBlockOutline(page.request, config, gatedSubKey)).toMatchObject({
          prereq: prereqSubKey,
          visibility_state: 'gated',
        });

        // Learner side, before: the gated subsection is locked.
        await expect
          .poll(() => gatedState(roundTripLearner, gatedSubKey), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBe(true);
        expect((await roundTripLearner.outline()).units.some((u) => u.id === gatedUnitKey)).toBe(
          false,
        );

        // The learner scores the prerequisite problem correctly.
        await satisfyPrerequisiteByScore(
          roundTripLearner.request,
          config,
          contentCourse.courseKey,
          problem,
          prereqSubKey,
        );

        // Learner side, after: the gate opens and the units become reachable.
        await expect
          .poll(() => gatedState(roundTripLearner, gatedSubKey), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBe(false);
        await expect
          .poll(
            async () => (await roundTripLearner.outline()).units.some((u) => u.id === gatedUnitKey),
            {
              timeout: TIMEOUTS.contentPublish,
            },
          )
          .toBe(true);
      },
    );

    // PLAT-008: completion-only gating (min score 0, min completion 100) is shown
    // as gated by Studio but not enforced by the LMS, so this is written against
    // the intended behaviour and declared `fixme`. TC-00159 covers the working
    // (score) gating path.
    test.fixme(
      'gates a subsection by minimum completion of a prerequisite subsection (PLAT-008)',
      {
        annotation: [
          testId('TC-00160'),
          issue('https://github.com/openedx/end-to-end-tests/issues/39'),
        ],
      },
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
        // The prerequisite is an HTML-only subsection so completion can reach
        // 100% (a subsection with a video never can — PLAT-003).
        const prereq = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          `E2E gatec-pre ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html'] }] }], publish: true },
        );
        const gated = await buildSection(
          page.request,
          config,
          contentCourse.courseKey,
          `E2E gatec-dep ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html'] }] }], publish: true },
        );
        const prereqSubKey = prereq.subsections[0]?.usageKey ?? '';
        const gatedSubKey = gated.subsections[0]?.usageKey ?? '';
        const gatedUnitKey = gated.units[0]?.usageKey ?? '';

        await studioCourseOutlinePage.goto(contentCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await outlineConfigureDialog.open(
          studioCourseOutlinePage.subsection(firstUnitKey(prereq)),
          'subsection',
        );
        await outlineConfigureDialog.markAvailableAsPrerequisite();
        await outlineConfigureDialog.save();
        await outlineConfigureDialog.open(
          studioCourseOutlinePage.subsection(gatedUnitKey),
          'subsection',
        );
        await outlineConfigureDialog.requirePrerequisite(prereqSubKey, {
          minScore: 0,
          minCompletion: 100,
        });
        await outlineConfigureDialog.save();

        expect(await fetchXBlockOutline(page.request, config, gatedSubKey)).toMatchObject({
          prereq: prereqSubKey,
          visibility_state: 'gated',
        });

        await expect
          .poll(() => gatedState(roundTripLearner, gatedSubKey), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBe(true);

        // Complete the prerequisite's HTML block (publish_completion), which drives
        // the subsection to 100% completion.
        await completePrerequisite(roundTripLearner, config, contentCourse.courseKey, prereq);

        await expect
          .poll(() => gatedState(roundTripLearner, gatedSubKey), {
            timeout: TIMEOUTS.contentPublish,
          })
          .toBe(false);
      },
    );
  },
);

/**
 * The learner's gated flag for a subsection, tolerating a transient HTTP 500 the
 * sequence API returns while the block structure is rebuilding under load
 * (returns undefined so the poll keeps trying, rather than failing the test).
 */
async function gatedState(
  learner: { sequence: (id: string) => Promise<{ gated_content: { gated: boolean } } | undefined> },
  sequentialId: string,
): Promise<boolean | undefined> {
  try {
    return (await learner.sequence(sequentialId))?.gated_content.gated;
  } catch {
    return undefined;
  }
}

function gatedProblem(section: AuthoredSection) {
  const block = section.blocks.find((b) => b.answers !== undefined);
  if (block?.answers === undefined) throw new Error('The prerequisite has no scoreable problem.');
  return { usageKey: block.usageKey, type: 'multiplechoiceresponse' as const, ...block.answers };
}

/** Marks the prerequisite's HTML blocks complete for the learner (min-completion path). */
async function completePrerequisite(
  learner: { request: APIRequestContext },
  config: Parameters<typeof fetchCsrfToken>[1],
  courseKey: string,
  prereq: AuthoredSection,
): Promise<void> {
  const token = await fetchCsrfToken(learner.request, config);
  for (const block of prereq.blocks) {
    await learner.request.post(
      `${config.baseUrls.lms}/courses/${courseKey}/xblock/${block.usageKey}/handler/publish_completion`,
      {
        data: { completion: 1.0 },
        headers: { [CSRF_HEADER]: token, Referer: config.baseUrls.lms },
      },
    );
  }
}
