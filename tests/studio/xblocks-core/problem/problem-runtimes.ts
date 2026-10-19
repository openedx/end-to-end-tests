import type { Locator, Page, Request, TestInfo } from '@playwright/test';

import { expect } from '../../../../src/fixtures';
import type { RoundTripLearner } from '../../../../src/fixtures';
import { TIMEOUTS, type AppConfig } from '../../../../src/config';
import {
  buildSection,
  createLibrary,
  createLibraryBlock,
  createXBlock,
  newLibrarySlug,
  publishXBlock,
  setLibraryBlockOlx,
  studioOrigin,
  updateXBlock,
  uploadAsset,
} from '../../../../src/api';
import type { StudioUnitPage } from '../../../../src/pages/studio/unit.page';
import { waitForLearnerBlock } from '../../../../src/steps';
import { label } from '../../library/helpers';
import { xml } from '../round-trip';

/**
 * The three runtimes a ProblemBlock renders in, each loading the block's
 * front-end assets its own way:
 *
 * - `lms`: a learner in the Learning MFE (the LMS runtime; LMS collectstatic).
 * - `studio`: the Studio unit page's component preview (the CMS preview
 *   runtime; CMS collectstatic).
 * - `library`: a V2 library's component preview — the same document the library
 *   sidebar's Preview tab frames, `/xblocks/v2/<key>/embed/student_view/` on the
 *   CMS (the Learning Core runtime). Opened directly so the test does not depend
 *   on the library search index.
 */
export type ProblemRuntime = 'lms' | 'studio' | 'library';

export interface ProblemFixtures {
  readonly page: Page;
  readonly config: AppConfig;
  readonly resyncStudioAuthor: () => Promise<void>;
  readonly contentCourse: { readonly courseKey: string };
  readonly roundTripLearnerLater: () => Promise<RoundTripLearner>;
  readonly studioUnitPage: StudioUnitPage;
}

/** A course asset to upload before authoring (course runtimes only), referenced as `/static/<name>`. */
export interface ProblemAsset {
  readonly name: string;
  readonly mimeType: string;
  readonly body: string;
}

export interface ProblemSpec {
  /** Everything inside `<problem>`. */
  readonly body: string;
  /** Problem settings: `<problem>` attributes in a library, metadata in a course. */
  readonly settings?: Readonly<Record<string, string | number | boolean>>;
  readonly assets?: readonly ProblemAsset[];
}

export interface OpenedProblem {
  /** The page the runtime renders in (the learner's for `lms`, the author's otherwise). */
  readonly page: Page;
  readonly problem: CapaProblem;
}

/**
 * Authors a problem for `runtime` and opens it there:
 *
 * - `lms` / `studio`: upload `assets` to the worker's course; create a new
 *   section > subsection > unit holding the problem (OLX via the Studio xblock
 *   API, settings as metadata). `studio` then opens the unit page and uses the
 *   component's preview; `lms` publishes the unit, provisions a fresh enrolled
 *   learner, waits for the block in their outline, and opens the unit.
 * - `library`: create a V2 library and a problem block in it with the OLX
 *   (settings as `<problem>` attributes), then open its embed view as the author.
 */
export async function openProblem(
  runtime: ProblemRuntime,
  fx: ProblemFixtures,
  testInfo: TestInfo,
  spec: ProblemSpec,
): Promise<OpenedProblem> {
  const { page, config } = fx;
  const displayName = label(`problem ${runtime}`, testInfo.testId);
  const settings = spec.settings ?? {};

  if (runtime === 'library') {
    const attrs = Object.entries(settings)
      .map(([k, v]) => ` ${k}="${xml(String(v))}"`)
      .join('');
    const library = await createLibrary(page.request, config, {
      org: config.org ?? 'OpenedX',
      slug: newLibrarySlug('capa'),
      title: displayName,
    });
    const block = await createLibraryBlock(page.request, config, library.id, {
      blockType: 'problem',
    });
    await setLibraryBlockOlx(
      page.request,
      config,
      block.id,
      `<problem display_name="${xml(displayName)}"${attrs}>${spec.body}</problem>`,
    );
    await page.goto(`${studioOrigin(config)}/xblocks/v2/${block.id}/embed/student_view/`);
    return { page, problem: new CapaProblem(page, page.locator('body')) };
  }

  await fx.resyncStudioAuthor();
  const { courseKey } = fx.contentCourse;
  for (const asset of spec.assets ?? []) {
    await uploadAsset(page.request, config, courseKey, {
      name: asset.name,
      mimeType: asset.mimeType,
      buffer: Buffer.from(asset.body),
    });
  }
  const section = await buildSection(page.request, config, courseKey, displayName, {
    subsections: [{ units: [{ blocks: [] }] }],
  });
  const unitKey = section.units[0]?.usageKey ?? '';
  const subsectionKey = section.subsections[0]?.usageKey ?? '';
  const blockKey = await createXBlock(page.request, config, {
    parentLocator: unitKey,
    category: 'problem',
    displayName,
  });
  await updateXBlock(page.request, config, blockKey, {
    data: `<problem>${spec.body}</problem>`,
    metadata: { display_name: displayName, ...settings },
  });

  if (runtime === 'studio') {
    await fx.studioUnitPage.goto(unitKey);
    return { page, problem: new CapaProblem(page, fx.studioUnitPage.component(blockKey)) };
  }

  await publishXBlock(page.request, config, unitKey);
  const learner = await fx.roundTripLearnerLater();
  const seen = await waitForLearnerBlock(learner.outline, blockKey);
  expect(seen.satisfied, `learner outline blocks: ${seen.last.join(', ')}`).toBe(true);
  await learner.prime(subsectionKey);
  await learner.unitPage.goto(courseKey, subsectionKey, unitKey);
  return {
    page: learner.page,
    problem: new CapaProblem(learner.page, learner.unitPage.block(blockKey)),
  };
}

/**
 * Drives a rendered CAPA problem through its own controls — the buttons
 * `ProblemBlockDisplay.js` wires up (`display.js`) — waiting on the handler call
 * each one makes. Handler URLs differ by runtime but all end in the dispatch name.
 */
export class CapaProblem {
  readonly submitButton: Locator;
  readonly saveButton: Locator;
  readonly resetButton: Locator;
  readonly showAnswerButton: Locator;
  readonly hintButton: Locator;
  readonly radios: Locator;

  constructor(
    readonly page: Page,
    readonly root: Locator,
  ) {
    this.submitButton = root.locator('button.submit');
    this.saveButton = root.locator('button.save');
    this.resetButton = root.locator('button.reset');
    this.showAnswerButton = root.locator('button.show');
    this.hintButton = root.locator('button.hint-button');
    this.radios = root.locator('input[type="radio"]');
  }

  /** Clicks `button` and returns the JSON of the `dispatch` handler call it makes. */
  private async act(button: Locator, dispatch: string): Promise<Record<string, unknown>> {
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().includes(dispatch), {
        timeout: TIMEOUTS.navigation,
      }),
      button.click(),
    ]);
    expect(response.ok(), `${dispatch} answered HTTP ${response.status()}`).toBe(true);
    return (await response.json().catch(() => ({}))) as Record<string, unknown>;
  }

  /** Submits; returns `problem_check`'s JSON (`success` is "correct" / "incorrect"). */
  submit() {
    return this.act(this.submitButton, 'problem_check');
  }

  /** Submits and returns the `problem_check` request, to read what the inputs posted. */
  async submitCapturingRequest(): Promise<Request> {
    const [request] = await Promise.all([
      this.page.waitForRequest((r) => r.url().includes('problem_check'), {
        timeout: TIMEOUTS.navigation,
      }),
      this.submitButton.click(),
    ]);
    return request;
  }

  save() {
    return this.act(this.saveButton, 'problem_save');
  }

  reset() {
    return this.act(this.resetButton, 'problem_reset');
  }

  showAnswer() {
    return this.act(this.showAnswerButton, 'problem_show');
  }

  hint() {
    return this.act(this.hintButton, 'hint_button');
  }
}

/** Every Problem runtime spec's tags. */
export const PROBLEM_TAGS = [
  '@regression',
  '@mfe-learning',
  '@studio',
  '@author',
  '@mfe-authoring',
  '@content-libraries',
];
