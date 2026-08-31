import type { Page } from '@playwright/test';

import type { CourseUnit } from '../api';
import { ProblemBlock } from '../pages/lms/courseware/problem.block';
import type { UnitPage } from '../pages/lms/courseware/unit.page';

/**
 * Block types this suite knows how to complete on its own.
 *
 * Everything else — `video`, `openassessment`, `lti`, `edx_sga` and friends —
 * either needs a third-party service or has no automatable completion path on
 * this platform version, so a unit containing one cannot be driven to completion
 * (see {@link canCompleteUnit}).
 */
export const COMPLETABLE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  // Completes after being visible for the platform's dwell delay.
  'html',
  // Completes on submission, correct or not.
  'problem',
]);

/**
 * Block types that complete by being **viewed**, and so report completion with a
 * `publish_completion` call once their dwell delay elapses.
 *
 * Only these are waited for. A problem's completion instead follows its
 * `problem_check` submission — it never publishes a view-completion — so waiting
 * for one would time out on every problem in the course.
 */
const VIEW_COMPLETED_BLOCK_TYPES: ReadonlySet<string> = new Set(['html']);

/** One block that could not be driven to completion, and why. */
export interface UnviewedBlock {
  readonly blockId: string;
  readonly blockType: string;
  /**
   * `too-tall` — the block cannot be shown in full, so the platform will never
   * count it as viewed. `timed-out` — it was shown but reported nothing.
   * `unsupported-problem` — its answer controls are a problem type the suite has
   * no strategy for.
   */
  readonly reason: 'too-tall' | 'timed-out' | 'unsupported-problem';
}

/** Whether every block in a unit has a completion path this suite can drive. */
export function canCompleteUnit(unit: CourseUnit): boolean {
  return unit.childTypes.every((type) => COMPLETABLE_BLOCK_TYPES.has(type));
}

/**
 * Views every block in the open unit, waiting for each to register completion.
 *
 * This is what "completing a unit" actually costs: a vertical completes only when
 * **all** of its children do, and an HTML block completes by being fully visible
 * for the platform's dwell delay. Answering the unit's problem is not enough — a
 * measured fact that shapes the whole suite's runtime.
 *
 * Returns the blocks that could not be completed, so a spec can fail with
 * something specific rather than on a bare timeout.
 */
export async function viewAllBlocksInUnit(
  page: Page,
  unitPage: UnitPage,
  unit: CourseUnit,
): Promise<readonly UnviewedBlock[]> {
  const skipped: UnviewedBlock[] = [];
  const completed = new Set<string>();

  // Several blocks are usually on screen at once, so one scroll can complete
  // several — and their reports arrive while we are waiting on a different block.
  // Recording every completion for the whole unit means those are not missed and
  // each block is only waited for once.
  const record = (response: { url: () => string }): void => {
    const url = response.url();
    if (!url.includes('publish_completion')) {
      return;
    }
    for (const blockId of unit.childIds) {
      if (url.includes(blockId)) {
        completed.add(blockId);
      }
    }
  };
  page.on('response', record);

  try {
    for (const [index, blockId] of unit.childIds.entries()) {
      const blockType = unit.childTypes[index] ?? 'unknown';
      if (completed.has(blockId)) {
        continue;
      }

      // Bring every block into view — it costs nothing and a mixed unit scrolls
      // naturally — but only wait on the types that report a view-completion.
      if (!VIEW_COMPLETED_BLOCK_TYPES.has(blockType)) {
        await unitPage.showBlock(blockId);
        continue;
      }

      // Start listening before scrolling: a block already in view can report
      // completion the moment its timer elapses.
      const completion = unitPage.waitForBlockCompletion(blockId);
      const fits = await unitPage.showBlock(blockId);

      if (!fits) {
        skipped.push({ blockId, blockType, reason: 'too-tall' });
        await completion.catch(() => undefined);
        continue;
      }

      try {
        await completion;
      } catch {
        if (!completed.has(blockId)) {
          skipped.push({ blockId, blockType, reason: 'timed-out' });
        }
      }
    }
  } finally {
    page.off('response', record);
  }

  return skipped;
}

/**
 * Answers every CAPA problem in the open unit by picking its first choice and
 * submitting.
 *
 * The first choice is usually wrong, and that is fine here: a problem block
 * registers completion on **submission**, not on correctness (measured). Specs
 * about grades supply real answers instead.
 */
export async function answerProblemsInUnit(
  page: Page,
  unitPage: UnitPage,
  unit: CourseUnit,
): Promise<readonly UnviewedBlock[]> {
  const unsupported: UnviewedBlock[] = [];

  for (const [index, blockId] of unit.childIds.entries()) {
    if (unit.childTypes[index] !== 'problem') {
      continue;
    }

    const problem = new ProblemBlock(page, unitPage.contentFrame, blockId);
    await unitPage.showBlock(blockId);

    // Strategy by the controls the problem actually renders, rather than by a
    // hard-coded answer map: the demo course's problem set differs per
    // installation, and completion only needs a submission, not a right answer.
    if ((await problem.radioOptions.count()) > 0) {
      await problem.selectChoice(0);
    } else if ((await problem.checkboxOptions.count()) > 0) {
      await problem.selectCheckbox(0);
    } else if ((await problem.textInputs.count()) > 0) {
      await problem.fillTextAnswer(0, '1');
    } else {
      // Custom-JS problems (circuit simulators, protein builders, …) expose no
      // controls we can drive; the caller decides whether that matters.
      unsupported.push({ blockId, blockType: 'problem', reason: 'unsupported-problem' });
      continue;
    }

    await problem.submit();
  }

  return unsupported;
}

/**
 * Drives one unit to completion: answer its problems, then view every block.
 *
 * Problems first, because submitting scrolls the block into view and re-renders
 * it; viewing afterwards then covers whatever the re-render left unseen.
 *
 * Returns the blocks that could not be completed (empty when the unit is done).
 */
export async function completeUnit(
  page: Page,
  unitPage: UnitPage,
  courseKey: string,
  unit: CourseUnit,
): Promise<readonly UnviewedBlock[]> {
  await unitPage.goto(courseKey, unit.sequentialId, unit.id);
  const unsupported = await answerProblemsInUnit(page, unitPage, unit);
  const unviewed = await viewAllBlocksInUnit(page, unitPage, unit);
  return [...unsupported, ...unviewed];
}
