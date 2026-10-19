/*
 * Problem: input types whose scripts are collected static files (asset channel B).
 *
 * These inputs load a script from `STATIC_URL + "js/capa/…"` (via the
 * template's `script_placeholder`). Those files live in
 * `xblock_problem/capa/static/` and reach STATIC_URL only through collectstatic,
 * because `xblock_problem.capa` is registered as a Django app by the plugin
 * entry points. Their templates are found the same way. Runs in the LMS (LMS
 * collectstatic) and the Studio unit preview (CMS collectstatic; the library
 * preview is also served by the CMS, so it is not repeated).
 *
 * None of these needs codejail: Python-graded inputs are checked only up to the
 * submission request, never the grade.
 *
 * Tests (each starts by authoring and opening the problem; see
 * `openProblem` in `./problem-runtimes.ts`):
 *
 * - numerical preview — `formula_equation_preview.js` + the `input_ajax`
 *   handler. `<numericalresponse answer="1/2">` with a `<formulaequationinput>`.
 *   1. Type "1/2"; assert the live preview fills in.
 *   2. Submit: `problem_check` says "correct".
 *
 * - chemical equation preview — `chemical_equation_preview.js` + `input_ajax`.
 *   1. Type "H2 + O2 -> H2O"; assert the live preview fills in.
 *
 * - custom JavaScript — `jsinput.js` + `jschannel.js`. A course-asset HTML page
 *   whose `getGrade()` returns "42", framed by `<jsinput>`.
 *   1. Assert the iframe loads the page.
 *   2. Submit; assert the `problem_check` request carries the iframe's answer
 *      ("42"), which only jsinput.js can have put there.
 *
 * - drag and drop v1 — `drag_and_drop.js`. Two draggables and two targets over
 *   a course-asset SVG.
 *   1. Assert the script built its UI: the base image container and both
 *      draggable labels render.
 */
import { expect, test } from '../../../../src/fixtures';
import { TIMEOUTS } from '../../../../src/config';
import { PROBLEM_TAGS, openProblem, type ProblemRuntime } from './problem-runtimes';

const RUNTIMES: readonly ProblemRuntime[] = ['lms', 'studio'];

const PYTHON_ANSWER = `<answer type="loncapa/python">\ncorrect = ['correct']\n</answer>`;

const JSINPUT_HTML =
  '<!doctype html><html><body><p id="e2e-jsinput">E2E jsinput page</p><script>' +
  'window.getGrade = function () { return "42"; };' +
  'window.getState = function () { return JSON.stringify({ v: 42 }); };' +
  'window.setState = function () {};' +
  '</script></body></html>';

const DND_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150">' +
  '<rect width="300" height="150" fill="#eee"/></svg>';

test.describe('xblocks-core: Problem static-asset inputs', { tag: [...PROBLEM_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  for (const runtime of RUNTIMES) {
    test(`numerical preview (${runtime})`, async ({
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
      const { problem } = await openProblem(runtime, fx, testInfo, {
        body:
          `<numericalresponse answer="1/2"><label>Half?</label>` +
          `<formulaequationinput/></numericalresponse>`,
      });
      const input = problem.root.locator('.formulaequationinput input[type="text"]');
      await input.fill('1/2');
      await expect(problem.root.locator('[id$="_preview"]')).not.toBeEmpty({
        timeout: TIMEOUTS.navigation,
      });
      expect((await problem.submit()).success).toBe('correct');
    });

    test(`chemical equation preview (${runtime})`, async ({
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
      const { problem } = await openProblem(runtime, fx, testInfo, {
        body:
          `<customresponse><label>Water</label>` +
          `<chemicalequationinput size="50"/>${PYTHON_ANSWER}</customresponse>`,
      });
      const input = problem.root.locator('.chemicalequationinput input[type="text"]');
      await input.fill('H2 + O2 -> H2O');
      await expect(problem.root.locator('[id$="_preview"]')).not.toBeEmpty({
        timeout: TIMEOUTS.navigation,
      });
    });

    test(`custom JavaScript input (${runtime})`, async ({
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
      const asset = `e2e-jsinput-${testInfo.testId.slice(-8)}.html`;
      const { problem } = await openProblem(runtime, fx, testInfo, {
        assets: [{ name: asset, mimeType: 'text/html', body: JSINPUT_HTML }],
        body:
          `<customresponse><label>Custom JS</label>` +
          `<jsinput gradefn="getGrade" get_statefn="getState" set_statefn="setState"` +
          ` html_file="/static/${asset}" width="400" height="100"/>${PYTHON_ANSWER}</customresponse>`,
      });
      const frame = problem.root.frameLocator('iframe[name^="iframe_"]');
      await expect(frame.locator('#e2e-jsinput')).toBeVisible();

      const request = await problem.submitCapturingRequest();
      expect(decodeURIComponent(request.postData() ?? '')).toContain('"answer":"42"');
    });

    test(`drag and drop v1 (${runtime})`, async ({
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
      const asset = `e2e-dnd-${testInfo.testId.slice(-8)}.svg`;
      const { problem } = await openProblem(runtime, fx, testInfo, {
        assets: [{ name: asset, mimeType: 'image/svg+xml', body: DND_SVG }],
        body:
          `<customresponse><label>Drag A to the left box</label>` +
          `<drag_and_drop_input img="/static/${asset}" target_outline="true" one_per_target="true">` +
          `<draggable id="e2e_a" label="E2E drag A"/><draggable id="e2e_b" label="E2E drag B"/>` +
          `<target id="left" x="10" y="10" w="120" h="120"/>` +
          `<target id="right" x="170" y="10" w="120" h="120"/>` +
          `</drag_and_drop_input>${PYTHON_ANSWER}</customresponse>`,
      });
      await expect(problem.root.locator('.base_image_container')).toBeVisible({
        timeout: TIMEOUTS.navigation,
      });
      await expect(problem.root.getByText('E2E drag A')).toBeVisible();
      await expect(problem.root.getByText('E2E drag B')).toBeVisible();
    });
  }
});
