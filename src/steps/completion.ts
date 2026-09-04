import type { Page } from '@playwright/test';

import type { CourseUnit } from '../api';
import { TIMEOUTS } from '../config';
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
   * no strategy for. `not-drivable` — its block type has no completion path the
   * suite can drive at all (video, ORA, LTI, …).
   */
  readonly reason: 'too-tall' | 'timed-out' | 'unsupported-problem' | 'not-drivable';
}

/** Whether every block in a unit has a completion path this suite can drive. */
export function canCompleteUnit(unit: CourseUnit): boolean {
  return unit.childTypes.every((type) => COMPLETABLE_BLOCK_TYPES.has(type));
}

/** Records which of a unit's blocks have reported completion so far. */
export interface CompletionRecorder {
  /** Block IDs whose `publish_completion` call has been observed. */
  readonly completed: ReadonlySet<string>;
  /** Stops listening. */
  stop(): void;
}

/**
 * Starts listening for the unit's `publish_completion` calls.
 *
 * Several blocks are usually on screen at once, so one scroll can complete
 * several — and their reports arrive while something else is being waited on. An
 * HTML block that sat in view while a neighbouring problem was being answered has
 * often completed **before** the viewing pass even starts. Recording every
 * completion for the whole unit, from the moment it opens, means none of those
 * are missed and no block is waited for twice.
 */
export function recordCompletions(page: Page, unit: CourseUnit): CompletionRecorder {
  const completed = new Set<string>();
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
  return { completed, stop: () => page.off('response', record) };
}

/**
 * Views every block in the open unit, waiting for each to register completion.
 *
 * This is what "completing a unit" actually costs: a vertical completes only when
 * **all** of its children do, and an HTML block completes by being fully visible
 * for the platform's dwell delay.
 *
 * Pass a {@link recordCompletions} recorder started when the unit was opened so
 * completions that landed before this pass are credited; without one, listening
 * starts here.
 *
 * Returns the blocks that could not be completed, so a spec can fail with
 * something specific rather than on a bare timeout.
 */
export async function viewAllBlocksInUnit(
  page: Page,
  unitPage: UnitPage,
  unit: CourseUnit,
  recorder: CompletionRecorder = recordCompletions(page, unit),
): Promise<readonly UnviewedBlock[]> {
  const skipped: UnviewedBlock[] = [];
  const { completed } = recorder;

  try {
    for (const [index, blockId] of unit.childIds.entries()) {
      const blockType = unit.childTypes[index] ?? 'unknown';
      if (completed.has(blockId)) {
        continue;
      }

      // A block type with no completion path the suite can drive is reported, not
      // skipped quietly: a unit completes only when *every* child does, so
      // staying silent here would report a unit as completed when it cannot be.
      if (!COMPLETABLE_BLOCK_TYPES.has(blockType)) {
        skipped.push({ blockId, blockType, reason: 'not-drivable' });
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
        if (completed.has(blockId)) {
          continue;
        }
        // One more scroll before giving up. The platform starts its "viewed" timer
        // from a scroll event with the block fully in view; if layout was still
        // settling when the first scroll happened the block can have moved out of
        // view and the timer never started. A second nudge, on a settled layout,
        // is cheap; a block that still reports nothing is genuinely stuck.
        const retry = unitPage.waitForBlockCompletion(blockId);
        await unitPage.showBlock(blockId);
        try {
          await retry;
        } catch {
          if (!completed.has(blockId)) {
            skipped.push({ blockId, blockType, reason: 'timed-out' });
          }
        }
      }
    }
  } finally {
    recorder.stop();
  }

  return skipped;
}

/**
 * How many times an answer is entered before the problem is given up on as
 * unsupported. Two is a guard against a control that renders late and is read as
 * absent on the first pass; {@link ProblemBlock.waitForControls} makes that rare,
 * but not impossible.
 */
const ANSWER_ATTEMPTS = 2;

/**
 * Enters an answer into one problem, choosing the strategy by the controls it
 * renders, and reports whether that unlocked its submit control.
 *
 * The strategy is chosen by counting controls, and `count()` does not retry, so
 * the problem's markup is waited for first: read too early, an empty wrapper looks
 * exactly like a problem with no drivable controls, and the problem is wrongly
 * written off as unsupported.
 *
 * Returns `null` when the problem exposes no controls the suite can drive at all,
 * `false` when it does but the answer did not unlock its submit control.
 */
async function fillInAnswer(problem: ProblemBlock): Promise<boolean | null> {
  if (!(await problem.waitForControls(TIMEOUTS.expect))) {
    return null;
  }

  // Strategy by the controls the problem actually renders, rather than by a
  // hard-coded answer map: the demo course's problem set differs per
  // installation, and completion only needs a submission, not a right answer.
  if ((await problem.radioOptions.count()) > 0) {
    await problem.selectChoice(0);
  } else if ((await problem.checkboxOptions.count()) > 0) {
    await problem.selectCheckbox(0);
  } else if ((await problem.dropdowns.count()) > 0) {
    for (let index = 0; index < (await problem.dropdowns.count()); index += 1) {
      await problem.selectDropdownOption(index);
    }
  } else if ((await problem.textInputs.count()) > 0) {
    // Every input, not just the first: a multi-part problem keeps its submit
    // control disabled until each part has something in it.
    for (let index = 0; index < (await problem.textInputs.count()); index += 1) {
      await problem.fillTextAnswer(index, '1');
    }
  } else {
    // Custom-JS problems (circuit simulators, protein builders, …) expose no
    // controls we can drive; the caller decides whether that matters.
    return null;
  }

  // The submit control unlocks once the problem considers itself answered.
  return problem.submitIsEnabled(TIMEOUTS.expect);
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

    let answered: boolean | null = false;
    for (let attempt = 0; attempt < ANSWER_ATTEMPTS && answered === false; attempt += 1) {
      await unitPage.showBlock(blockId);
      answered = await fillInAnswer(problem);
    }

    // Still not answerable after a retry: this problem needs a strategy we do not
    // have — report it and move on, rather than throwing and abandoning the rest
    // of the course.
    if (answered !== true) {
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
  // Listen from the start: HTML blocks in view while problems are answered
  // complete during that phase, and the viewing pass must know.
  const recorder = recordCompletions(page, unit);
  const unsupported = await answerProblemsInUnit(page, unitPage, unit);
  const unviewed = await viewAllBlocksInUnit(page, unitPage, unit, recorder);
  return [...unsupported, ...unviewed];
}
