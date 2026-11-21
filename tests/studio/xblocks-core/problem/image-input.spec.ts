/*
 * Problem: image mapped input (asset channel A).
 *
 * `imageinput.js` ships inside the `ProblemBlockDisplay.js` bundle; it is what
 * records a click on the image as coordinates. Runs in the two course runtimes
 * (the image is a course asset); the library runtime's bundle is covered by
 * `./actions.spec.ts`.
 *
 * The problem: an `<imageresponse>` over a 200x100 SVG (uploaded as a course
 * asset), correct region (0,0)-(100,100) — the left half.
 *
 * Steps, after opening the problem:
 *  1. Assert the image renders.
 *  2. Click inside the correct region; assert the hidden input now holds the
 *     clicked coordinates ("[x,y]"), which only imageinput.js writes.
 *  3. Submit: `problem_check` says "correct".
 */
import { expect, test } from '../../../../src/fixtures';
import { TIMEOUTS } from '../../../../src/config';
import { PROBLEM_TAGS, openProblem, type ProblemRuntime } from './problem-runtimes';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">' +
  '<rect width="100" height="100" fill="#2a7"/><rect x="100" width="100" height="100" fill="#a27"/>' +
  '</svg>';

const RUNTIMES: readonly ProblemRuntime[] = ['lms', 'studio'];

test.describe('xblocks-core: Problem image input', { tag: [...PROBLEM_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  for (const runtime of RUNTIMES) {
    test(`click the image and submit (${runtime})`, async ({
      page,
      config,
      studioAuthorSession,
      resyncStudioAuthor,
      contentCourse,
      roundTripLearnerLater,
      studioUnitPage,
    }, testInfo) => {
      void studioAuthorSession;
      const fx = {
        page,
        config,
        resyncStudioAuthor,
        contentCourse,
        roundTripLearnerLater,
        studioUnitPage,
      };
      const asset = `e2e-imageinput-${testInfo.testId.slice(-8)}.svg`;
      const { problem } = await openProblem(runtime, fx, testInfo, {
        assets: [{ name: asset, mimeType: 'image/svg+xml', body: SVG }],
        body:
          `<imageresponse><label>Click the left half</label>` +
          `<imageinput src="/static/${asset}" width="200" height="100" rectangle="(0,0)-(100,100)"/>` +
          `</imageresponse>`,
      });
      const { root } = problem;

      const image = root.locator('[id^="imageinput_"]');
      await expect(image).toBeVisible();
      await image.click({ position: { x: 50, y: 50 } });
      await expect(root.locator('input.imageinput')).toHaveValue(/^\[\d+,\d+\]$/);

      expect((await problem.submit()).success).toBe('correct');
    });
  }
});
