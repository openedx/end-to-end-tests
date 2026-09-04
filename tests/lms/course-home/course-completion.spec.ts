import { totalUnits, type CourseUnit } from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import {
  COMPLETABLE_BLOCK_TYPES,
  canCompleteUnit,
  completeUnit,
  type UnviewedBlock,
} from '../../../src/steps';

/**
 * The full course crawl: work through every unit the suite can drive, then assert
 * the platform's own completion record.
 *
 * Separate from the `@smoke` unit-completion spec because of what it costs. A unit
 * completes only when each of its blocks does, and an HTML block completes only
 * after the platform's per-block dwell delay, so the runtime is set by the course
 * rather than by the suite — hence `TIMEOUTS.courseCrawlTest` and `@regression`.
 *
 * **Not every unit can be completed, and that is a property of the course, not a
 * failure.** Two kinds of obstacle are distinguished:
 *
 * - *Not drivable* — the unit holds a video, an ORA, an LTI launch or a
 *   custom-JS problem with no controls to drive. Reported as an inventory
 *   attachment, because it changes when the course changes.
 * - *Should have completed but did not* — an HTML block that was shown and
 *   reported nothing, or one too tall to show in full. These are asserted on:
 *   they mean the platform or the suite is wrong, not the course.
 */

/** The block types in a unit that have no completion path the suite can drive. */
function undrivableTypes(unit: CourseUnit): readonly string[] {
  return [...new Set(unit.childTypes.filter((type) => !COMPLETABLE_BLOCK_TYPES.has(type)))];
}

interface UnitOutcome {
  readonly unit: string;
  readonly blocks: readonly UnviewedBlock[];
}

interface CrawlReport {
  /** Units where every block reported completion. */
  readonly completed: number;
  /** Units held up only by a problem the suite cannot answer. */
  readonly blockedByProblemType: readonly UnitOutcome[];
  /** Units where a block that should have completed did not. */
  readonly failures: readonly UnitOutcome[];
}

async function crawl(
  completeOne: (unit: CourseUnit) => Promise<readonly UnviewedBlock[]>,
  units: readonly CourseUnit[],
): Promise<CrawlReport> {
  const blockedByProblemType: UnitOutcome[] = [];
  const failures: UnitOutcome[] = [];
  let completed = 0;

  for (const unit of units) {
    const unfinished = await completeOne(unit);
    const outcome = { unit: unit.displayName ?? unit.id, blocks: unfinished };

    if (unfinished.length === 0) {
      completed += 1;
    } else if (unfinished.every((block) => block.reason === 'unsupported-problem')) {
      blockedByProblemType.push(outcome);
    } else {
      failures.push(outcome);
    }
  }

  return { completed, blockedByProblemType, failures };
}

test.describe('Course completion', () => {
  test.describe.configure({ timeout: TIMEOUTS.courseCrawlTest });

  test(
    'completes every unit the suite can drive and the platform records it',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning'],
      annotation: testId('TC-00022'),
    },
    async ({ page, unitPage, courseOutline, courseProgress, enrolledCourse }) => {
      const drivable = courseOutline.units.filter(canCompleteUnit);
      expect(drivable.length, 'the course offers units the suite can drive').toBeGreaterThan(0);

      const before = await courseProgress();
      expect(before.completionSummary.completeCount).toBe(0);
      expect(totalUnits(before)).toBe(courseOutline.units.length);

      const report = await crawl(
        (unit) => completeUnit(page, unitPage, enrolledCourse.courseKey, unit),
        drivable,
      );

      // A block that was shown and still did not complete, or one too tall to show
      // at all: the platform or the suite is at fault, so this fails the test.
      expect(report.failures, 'no block that should complete was left incomplete').toEqual([]);

      // The platform's own record must match what the crawl believes it completed.
      const after = await courseProgress();
      expect(after.completionSummary.completeCount).toBe(report.completed);
      expect(after.completionSummary.incompleteCount).toBe(
        courseOutline.units.length - report.completed,
      );

      // Everything the course itself puts out of reach, recorded rather than
      // asserted, so the number is reviewable and moves with the course.
      const inventory = {
        totalUnits: courseOutline.units.length,
        drivableByType: drivable.length,
        completed: report.completed,
        blockedByProblemType: report.blockedByProblemType,
        notDrivable: courseOutline.units
          .filter((unit) => !canCompleteUnit(unit))
          .map((unit) => ({
            unit: unit.displayName ?? unit.id,
            blockedBy: undrivableTypes(unit),
          })),
      };

      await test.info().attach('completion-inventory.json', {
        body: JSON.stringify(inventory, null, 2),
        contentType: 'application/json',
      });

      // Also on stdout: this is the headline result of a multi-minute crawl, and an
      // attachment is only readable if the HTML report was generated.
      console.log(
        `[course-completion] ${inventory.completed}/${inventory.totalUnits} units complete ` +
          `(${inventory.drivableByType} drivable by block type, ` +
          `${inventory.blockedByProblemType.length} held up by an undrivable problem, ` +
          `${inventory.notDrivable.length} not drivable at all).`,
      );
    },
  );

  // The definition of done for course completion — `complete_count == unit count`
  // — and currently unreachable for any learner, let alone a test: the course
  // contains videos (no drivable completion path), ORA, LTI launches and custom-JS
  // problems. Kept as written so the criterion stays documented; declared `fixme`
  // so no fixtures (a learner, an enrollment, the outline) are set up for a body
  // that cannot run. Promote to a real test as those paths become drivable.
  test.fixme(
    'completes every unit in the course',
    {
      tag: ['@regression', '@authenticated', '@mfe-learning'],
      annotation: testId('TC-00022'),
    },
    async ({ page, unitPage, courseOutline, courseProgress, enrolledCourse }) => {
      const report = await crawl(
        (unit) => completeUnit(page, unitPage, enrolledCourse.courseKey, unit),
        courseOutline.units,
      );

      expect(report.failures).toEqual([]);
      expect(report.blockedByProblemType).toEqual([]);
      const after = await courseProgress();
      expect(after.completionSummary.completeCount).toBe(courseOutline.units.length);
      expect(after.completionSummary.incompleteCount).toBe(0);
    },
  );
});
