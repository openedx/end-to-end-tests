import { checkA11y } from '../../../src/a11y';
import { fetchGradingPolicy, updateGradingPolicy, type GradingPolicy } from '../../../src/api';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Grading (authoring MFE), on the worker's own course.
 *
 * The MFE drives every change; Studio's `course_grading` policy decides whether
 * it took. Each test writes the policy it starts from through the API, so the
 * tests are independent of one another and of what an earlier run left behind.
 */

/** A default course's policy: four assignment types, one Pass/Fail cutoff. */
const BASELINE: GradingPolicy = {
  graders: [
    { type: 'Homework', min_count: 12, drop_count: 2, short_label: 'HW', weight: 15, id: 0 },
    { type: 'Lab', min_count: 12, drop_count: 2, short_label: '', weight: 15, id: 1 },
    {
      type: 'Midterm Exam',
      min_count: 1,
      drop_count: 0,
      short_label: 'Midterm',
      weight: 30,
      id: 2,
    },
    { type: 'Final Exam', min_count: 1, drop_count: 0, short_label: 'Final', weight: 40, id: 3 },
  ],
  grade_cutoffs: { Pass: 0.5 },
  grace_period: null,
  minimum_grade_credit: 0.8,
  is_credit_course: false,
};

test.describe('Grading', { tag: ['@studio', '@author', '@mfe-authoring'] }, () => {
  test(
    'drags a grade-range boundary',
    { tag: '@regression', annotation: testId('TC-00284') },
    async ({ page, config, authoredCourse, gradingPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateGradingPolicy(api, config, courseKey, BASELINE);

      await gradingPage.goto(courseKey);
      // The Pass/Fail boundary sits at 50; drag it towards 65 and take whatever
      // integer the editor settled on as the value to expect back.
      const settled = await gradingPage.dragCutoff(50, 65);
      expect(settled).not.toBe(50);
      expect((await gradingPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(async () => {
          const { grade_cutoffs } = await fetchGradingPolicy(api, config, courseKey);
          return Math.round((grade_cutoffs.Pass ?? 0) * 100);
        })
        .toBe(settled);

      // `STUDIO-004` (see `.private/findings.md`): the grade-range editor's own
      // controls are unlabelled — the boundary handles (`role="slider"`) have no
      // accessible name and the segment name fields have no label. Upstream
      // (`frontend-app-course-authoring`) debt tolerated on this screen only, so
      // the same rules still fail elsewhere. Remove when STUDIO-004 lands.
      await checkA11y(page, {
        label: 'studio-grading',
        additionalBaseline: ['button-name', 'label'],
      });
    },
  );

  test(
    'adds the standard letter grades',
    { tag: '@regression', annotation: testId('TC-00285') },
    async ({ page, config, authoredCourse, gradingPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateGradingPolicy(api, config, courseKey, BASELINE);

      await gradingPage.goto(courseKey);
      await expect(gradingPage.segments).toHaveCount(2);
      // Pass/Fail plus three more segments is A, B, C, D and the failing F.
      await gradingPage.addSegment();
      await gradingPage.addSegment();
      await gradingPage.addSegment();
      await expect(gradingPage.segments).toHaveCount(5);
      expect(await gradingPage.gradedSegmentNames()).toEqual(['A', 'B', 'C', 'D']);
      expect((await gradingPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(async () => {
          const { grade_cutoffs } = await fetchGradingPolicy(api, config, courseKey);
          return Object.keys(grade_cutoffs).sort();
        })
        .toEqual(['A', 'B', 'C', 'D']);
      const { grade_cutoffs } = await fetchGradingPolicy(api, config, courseKey);
      const cutoffs = ['A', 'B', 'C', 'D'].map((letter) => grade_cutoffs[letter] ?? 0);
      // Strictly descending, and none of them empty.
      expect(cutoffs).toEqual([...cutoffs].sort((left, right) => right - left));
      expect(new Set(cutoffs).size).toBe(4);
      expect(Math.min(...cutoffs)).toBeGreaterThan(0);
    },
  );

  test(
    'removes letter grades',
    { tag: '@regression', annotation: testId('TC-00286') },
    async ({ page, config, authoredCourse, gradingPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateGradingPolicy(api, config, courseKey, {
        ...BASELINE,
        grade_cutoffs: { A: 0.9, B: 0.8, C: 0.7, D: 0.6 },
      });

      await gradingPage.goto(courseKey);
      await expect(gradingPage.segments).toHaveCount(5);
      // Remove two of the middle grades; the editor renames what is left.
      await gradingPage.removeSegment(1);
      await gradingPage.removeSegment(1);
      await expect(gradingPage.segments).toHaveCount(3);
      const remaining = await gradingPage.gradedSegmentNames();
      expect(remaining).toHaveLength(2);
      expect((await gradingPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(async () => {
          const { grade_cutoffs } = await fetchGradingPolicy(api, config, courseKey);
          return Object.keys(grade_cutoffs).sort();
        })
        .toEqual([...remaining].sort());
    },
  );

  test(
    'sets a grace period on deadlines',
    { tag: '@regression', annotation: testId('TC-00287') },
    async ({ page, config, authoredCourse, gradingPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateGradingPolicy(api, config, courseKey, BASELINE);

      await gradingPage.goto(courseKey);
      await gradingPage.setGracePeriod('12:30');
      expect((await gradingPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(async () => (await fetchGradingPolicy(api, config, courseKey)).grace_period)
        .toEqual({ hours: 12, minutes: 30 });
    },
  );

  // Whether the grace period lets a late submission count needs a graded problem
  // with a due date in the course — content this course does not have (Epic 8).
  test.fixme(
    'a grace period keeps a late submission gradable',
    { tag: '@regression', annotation: testId('TC-00287') },
    async ({ request, config, authoredCourse }) => {
      const policy = await fetchGradingPolicy(request, config, authoredCourse.courseKey);
      expect(policy.grace_period).not.toBeNull();
    },
  );

  test(
    'adds an assignment type',
    { tag: '@regression', annotation: testId('TC-00288') },
    async ({ page, config, authoredCourse, gradingPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      // Leave room so the weights still total 100 with the new type.
      await updateGradingPolicy(api, config, courseKey, {
        ...BASELINE,
        graders: BASELINE.graders.map((grader) =>
          grader.type === 'Final Exam' ? { ...grader, weight: 30 } : grader,
        ),
      });
      const quiz = { name: 'Quiz', shortLabel: 'QZ', weight: 10, minCount: 4, dropCount: 1 };

      await gradingPage.goto(courseKey);
      await expect(gradingPage.assignmentTypes).toHaveCount(4);
      await gradingPage.addAssignmentType(quiz);
      await expect(gradingPage.assignmentTypes).toHaveCount(5);
      expect((await gradingPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(async () => {
          const { graders } = await fetchGradingPolicy(api, config, courseKey);
          return graders.find((grader) => grader.type === quiz.name);
        })
        .toMatchObject({
          type: 'Quiz',
          short_label: 'QZ',
          weight: 10,
          min_count: 4,
          drop_count: 1,
        });
    },
  );

  test(
    'removes an assignment type',
    { tag: '@regression', annotation: testId('TC-00289') },
    async ({ page, config, authoredCourse, gradingPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateGradingPolicy(api, config, courseKey, BASELINE);

      await gradingPage.goto(courseKey);
      await expect(gradingPage.assignmentTypes).toHaveCount(4);
      await gradingPage.deleteAssignmentType('Lab');
      await expect(gradingPage.assignmentTypes).toHaveCount(3);
      expect((await gradingPage.save(courseKey)).status).toBe(200);

      await expect
        .poll(async () => {
          const { graders } = await fetchGradingPolicy(api, config, courseKey);
          return graders.map((grader) => grader.type);
        })
        .toEqual(['Homework', 'Midterm Exam', 'Final Exam']);
    },
  );

  test(
    'the save bar appears on a change and persists it',
    { tag: '@regression', annotation: testId('TC-00290') },
    async ({ page, config, authoredCourse, gradingPage, studioAuthorSession }) => {
      void studioAuthorSession;
      // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
      const api = page.request;
      const { courseKey } = authoredCourse;
      await updateGradingPolicy(api, config, courseKey, BASELINE);

      await gradingPage.goto(courseKey);
      await expect(gradingPage.saveBar).toHaveCount(0);
      await gradingPage.setGracePeriod('01:15');
      await expect(gradingPage.saveBar).toBeVisible();
      expect((await gradingPage.save(courseKey)).status).toBe(200);
      await expect
        .poll(async () => (await fetchGradingPolicy(api, config, courseKey)).grace_period)
        .toEqual({ hours: 1, minutes: 15 });

      // A fresh load shows the saved value and nothing left to save.
      await gradingPage.goto(courseKey);
      await expect(gradingPage.gracePeriod).toHaveValue('01:15');
      await expect(gradingPage.saveBar).toHaveCount(0);
    },
  );
});
