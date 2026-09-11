import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { courseUsageKey, createXBlock, publishXBlock, updateXBlock } from './xblock';

/**
 * Builders for the course content a round-trip spec starts from. Everything here
 * is **arrangement**, done through the xblock API so a spec body opens on the
 * action under test; the editors themselves are exercised by the component specs.
 *
 * Problems are authored as OLX in the block's `data` (the MFE's problem editor
 * does the same on save; a `boilerplate` on create produced an empty problem
 * when measured). Each problem builder returns the answer a learner must give,
 * so the learner half of a spec can score without reading platform copy.
 */

/** The common problem types the MFE's picker offers, by their OLX response tag. */
export type ProblemType =
  | 'multiplechoiceresponse'
  | 'choiceresponse'
  | 'optionresponse'
  | 'numericalresponse'
  | 'stringresponse';

/**
 * What a learner enters to answer an authored problem. `inputSuffix` is the part
 * of the CAPA input name after the block hash (`input_<hash>_2_1`); `values` are
 * the form values — one for most types, several for checkboxes.
 */
export interface ProblemAnswer {
  readonly inputSuffix: string;
  readonly values: readonly string[];
}

/** A problem the suite authored, with the answers that score and that do not. */
export interface AuthoredProblem {
  readonly usageKey: string;
  readonly type: ProblemType;
  readonly correct: ProblemAnswer;
  readonly incorrect: ProblemAnswer;
}

interface ProblemTemplate {
  readonly olx: (label: string) => string;
  readonly correct: ProblemAnswer;
  readonly incorrect: ProblemAnswer;
}

/** Answer choices the OLX below defines; the texts are the suite's own data. */
const PROBLEM_TEMPLATES: Readonly<Record<ProblemType, ProblemTemplate>> = {
  multiplechoiceresponse: {
    olx: (label) =>
      `<problem><multiplechoiceresponse><label>${label}</label>` +
      `<choicegroup type="MultipleChoice">` +
      `<choice correct="false">E2E option A</choice>` +
      `<choice correct="true">E2E option B</choice>` +
      `<choice correct="false">E2E option C</choice>` +
      `</choicegroup></multiplechoiceresponse></problem>`,
    correct: { inputSuffix: '2_1', values: ['choice_1'] },
    incorrect: { inputSuffix: '2_1', values: ['choice_0'] },
  },
  choiceresponse: {
    olx: (label) =>
      `<problem><choiceresponse><label>${label}</label>` +
      `<checkboxgroup>` +
      `<choice correct="true">E2E option A</choice>` +
      `<choice correct="false">E2E option B</choice>` +
      `<choice correct="true">E2E option C</choice>` +
      `</checkboxgroup></choiceresponse></problem>`,
    // Checkbox groups post repeated `input_<hash>_2_1[]` fields (the `[]` matters).
    correct: { inputSuffix: '2_1[]', values: ['choice_0', 'choice_2'] },
    incorrect: { inputSuffix: '2_1[]', values: ['choice_1'] },
  },
  optionresponse: {
    olx: (label) =>
      `<problem><optionresponse><label>${label}</label>` +
      `<optioninput options="('E2E red','E2E blue','E2E green')" correct="E2E blue"/>` +
      `</optionresponse></problem>`,
    correct: { inputSuffix: '2_1', values: ['E2E blue'] },
    incorrect: { inputSuffix: '2_1', values: ['E2E red'] },
  },
  numericalresponse: {
    olx: (label) =>
      `<problem><numericalresponse answer="42"><label>${label}</label>` +
      `<formulaequationinput/></numericalresponse></problem>`,
    correct: { inputSuffix: '2_1', values: ['42'] },
    incorrect: { inputSuffix: '2_1', values: ['7'] },
  },
  stringresponse: {
    olx: (label) =>
      `<problem><stringresponse answer="openedx" type="ci"><label>${label}</label>` +
      `<textline size="20"/></stringresponse></problem>`,
    correct: { inputSuffix: '2_1', values: ['openedx'] },
    incorrect: { inputSuffix: '2_1', values: ['closedx'] },
  },
};

/** The OLX the suite authors for a problem type — for asserting an editor's save. */
export function problemOlx(type: ProblemType, label: string): string {
  return PROBLEM_TEMPLATES[type].olx(label);
}

/** Authors a problem of `type` in a unit; the block stays a draft. */
export async function authorProblem(
  request: APIRequestContext,
  config: AppConfig,
  verticalUsageKey: string,
  type: ProblemType,
  displayName: string,
): Promise<AuthoredProblem> {
  const template = PROBLEM_TEMPLATES[type];
  const usageKey = await createXBlock(request, config, {
    parentLocator: verticalUsageKey,
    category: 'problem',
    displayName,
  });
  await updateXBlock(request, config, usageKey, {
    data: template.olx(displayName),
    metadata: { display_name: displayName, weight: 1, max_attempts: null },
  });
  return { usageKey, type, correct: template.correct, incorrect: template.incorrect };
}

/** Authors a text component with the given HTML body; the block stays a draft. */
export async function authorHtml(
  request: APIRequestContext,
  config: AppConfig,
  verticalUsageKey: string,
  displayName: string,
  html: string,
): Promise<string> {
  const usageKey = await createXBlock(request, config, {
    parentLocator: verticalUsageKey,
    category: 'html',
    displayName,
  });
  await updateXBlock(request, config, usageKey, {
    data: html,
    metadata: { display_name: displayName },
  });
  return usageKey;
}

/**
 * A YouTube id that exists and is embeddable; the suite never plays it
 * (`PLAT-003`), it only asserts the block renders.
 */
export const SAMPLE_YOUTUBE_ID = 'dQw4w9WgXcQ';

/** Authors a video component pointing at a YouTube id; the block stays a draft. */
export async function authorVideo(
  request: APIRequestContext,
  config: AppConfig,
  verticalUsageKey: string,
  displayName: string,
  youtubeId: string = SAMPLE_YOUTUBE_ID,
): Promise<string> {
  const usageKey = await createXBlock(request, config, {
    parentLocator: verticalUsageKey,
    category: 'video',
    displayName,
  });
  await updateXBlock(request, config, usageKey, {
    metadata: { display_name: displayName, youtube_id_1_0: youtubeId },
  });
  return usageKey;
}

/** One component to author in a unit. A bare type gets the suite's default content. */
export type BlockSpec =
  'html' | 'video' | ProblemType | { readonly html: string } | { readonly problem: ProblemType };

export interface UnitShape {
  readonly displayName?: string;
  readonly blocks: readonly BlockSpec[];
}

export interface SubsectionShape {
  readonly displayName?: string;
  readonly units: readonly UnitShape[];
  /** Sets `graded: true` and this assignment type. */
  readonly gradedAs?: string;
}

export interface SectionShape {
  readonly displayName?: string;
  readonly subsections: readonly SubsectionShape[];
  /**
   * Publish every unit once built. Off by default so specs about publishing
   * start from drafts; sections and subsections are published by the platform
   * as they are created regardless.
   */
  readonly publish?: boolean;
}

/** A block the builder created, with what the learner half needs to drive it. */
export interface AuthoredBlock {
  readonly usageKey: string;
  readonly type: string;
  readonly verticalUsageKey: string;
  readonly displayName: string;
  /** Present for problems: the answers that score and that do not. */
  readonly answers?: Pick<AuthoredProblem, 'correct' | 'incorrect'>;
}

export interface AuthoredUnit {
  readonly usageKey: string;
  readonly displayName: string;
  readonly sequentialUsageKey: string;
  readonly blocks: readonly AuthoredBlock[];
}

export interface AuthoredSubsection {
  readonly usageKey: string;
  readonly displayName: string;
  readonly units: readonly AuthoredUnit[];
}

/** The structure {@link buildSection} created, keyed by usage key at every level. */
export interface AuthoredSection {
  readonly courseKey: string;
  /** The section (chapter) usage key. */
  readonly usageKey: string;
  readonly displayName: string;
  readonly subsections: readonly AuthoredSubsection[];
  /** Every unit in outline order. */
  readonly units: readonly AuthoredUnit[];
  /** Every component in outline order. */
  readonly blocks: readonly AuthoredBlock[];
}

/**
 * The default shape: one subsection with one unit holding a text block and a
 * multiple-choice problem — enough for a publish round trip, a rename at every
 * level, and a scoreable prerequisite.
 */
export const DEFAULT_SECTION_SHAPE: SectionShape = {
  subsections: [{ units: [{ blocks: ['html', 'multiplechoiceresponse'] }] }],
};

/**
 * Builds a section (with subsections, units and components) in `courseKey`.
 *
 * `label` is the test's own unique name, used as the section title and as the
 * prefix of every child's title, so a spec may match these names in the LMS
 * (they are test-supplied data, not platform copy) and two tests sharing a
 * course never confuse their content.
 */
export async function buildSection(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  label: string,
  shape: SectionShape = DEFAULT_SECTION_SHAPE,
): Promise<AuthoredSection> {
  const sectionKey = await createXBlock(request, config, {
    parentLocator: courseUsageKey(courseKey),
    category: 'chapter',
    displayName: shape.displayName ?? label,
  });

  const subsections: AuthoredSubsection[] = [];
  const units: AuthoredUnit[] = [];
  const blocks: AuthoredBlock[] = [];

  for (const [s, subsectionShape] of shape.subsections.entries()) {
    const subsectionName = subsectionShape.displayName ?? `${label} subsection ${s + 1}`;
    const subsectionKey = await createXBlock(request, config, {
      parentLocator: sectionKey,
      category: 'sequential',
      displayName: subsectionName,
    });
    if (subsectionShape.gradedAs !== undefined) {
      await updateXBlock(request, config, subsectionKey, {
        metadata: { graded: true, format: subsectionShape.gradedAs },
      });
    }

    const subsectionUnits: AuthoredUnit[] = [];
    for (const [u, unitShape] of subsectionShape.units.entries()) {
      const unitName = unitShape.displayName ?? `${subsectionName} unit ${u + 1}`;
      const unitKey = await createXBlock(request, config, {
        parentLocator: subsectionKey,
        category: 'vertical',
        displayName: unitName,
      });

      const unitBlocks: AuthoredBlock[] = [];
      for (const [b, spec] of unitShape.blocks.entries()) {
        unitBlocks.push(
          await authorBlock(request, config, unitKey, spec, `${unitName} block ${b + 1}`),
        );
      }
      if (shape.publish === true) {
        await publishXBlock(request, config, unitKey);
      }

      const unit: AuthoredUnit = {
        usageKey: unitKey,
        displayName: unitName,
        sequentialUsageKey: subsectionKey,
        blocks: unitBlocks,
      };
      subsectionUnits.push(unit);
      units.push(unit);
      blocks.push(...unitBlocks);
    }

    subsections.push({
      usageKey: subsectionKey,
      displayName: subsectionName,
      units: subsectionUnits,
    });
  }

  return {
    courseKey,
    usageKey: sectionKey,
    displayName: shape.displayName ?? label,
    subsections,
    units,
    blocks,
  };
}

async function authorBlock(
  request: APIRequestContext,
  config: AppConfig,
  verticalUsageKey: string,
  spec: BlockSpec,
  displayName: string,
): Promise<AuthoredBlock> {
  if (spec === 'html') {
    const usageKey = await authorHtml(
      request,
      config,
      verticalUsageKey,
      displayName,
      `<p>${displayName}</p>`,
    );
    return { usageKey, type: 'html', verticalUsageKey, displayName };
  }
  if (spec === 'video') {
    const usageKey = await authorVideo(request, config, verticalUsageKey, displayName);
    return { usageKey, type: 'video', verticalUsageKey, displayName };
  }
  if (typeof spec === 'object' && 'html' in spec) {
    const usageKey = await authorHtml(request, config, verticalUsageKey, displayName, spec.html);
    return { usageKey, type: 'html', verticalUsageKey, displayName };
  }
  const type: ProblemType = typeof spec === 'object' ? spec.problem : spec;
  const problem = await authorProblem(request, config, verticalUsageKey, type, displayName);
  return {
    usageKey: problem.usageKey,
    type: 'problem',
    verticalUsageKey,
    displayName,
    answers: { correct: problem.correct, incorrect: problem.incorrect },
  };
}
