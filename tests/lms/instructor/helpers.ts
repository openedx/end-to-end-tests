import type { APIRequestContext, APIResponse } from '@playwright/test';

import type { AppConfig } from '../../../src/config';
import { buildSection, publishXBlock, updateXBlock, type AuthoredSection } from '../../../src/api';

/**
 * Every instructor-dashboard spec runs as the worker author (the course's
 * instructor, see the plan's §2.1) in the `studio-author` project, is gated on
 * the `instructor-dashboard` capability (default on; ulmo and earlier opt out),
 * and reads the learner half in the learning MFE's APIs.
 */
export const INSTRUCTOR_TAGS: string[] = [
  '@studio',
  '@author',
  '@instructor-dashboard',
  '@mfe-instructor-dashboard',
  '@mfe-learning',
];

/**
 * Accessibility debt the instructor dashboard MFE carries on `main`, reported
 * on every run but not failed until the MFE fixes it (like the suite's global
 * baseline):
 *
 * - `aria-prohibited-attr` (serious, `INSTR-005`): the "Problem location" info
 *   icon on the Grading and Data Downloads tabs is a `span.pgn__icon` with an
 *   `aria-label` and no role.
 * - `select-name` (critical, `INSTR-006`): the table filter selects on the
 *   Enrollments (`isBetaTester`) and Date Extensions (`blockId`) tabs have no
 *   accessible name.
 */
export const INSTRUCTOR_A11Y_BASELINE = ['aria-prohibited-attr', 'select-name'] as const;

/** A short, unique label for content a test authors. */
export function label(tag: string, testId: string): string {
  return `E2E ${tag} ${testId.slice(-6)}`;
}

/**
 * A published one-unit section whose release date is `daysAhead` days out —
 * visible to beta testers within the course's `days_early_for_beta`, hidden from
 * everyone else.
 */
export async function buildFutureSection(
  author: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  name: string,
  daysAhead = 30,
): Promise<AuthoredSection> {
  const section = await buildSection(author, config, courseKey, name, {
    subsections: [{ units: [{ blocks: ['html'] }] }],
  });
  const start = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
  await updateXBlock(author, config, section.usageKey, { metadata: { start } });
  for (const unit of section.units) await publishXBlock(author, config, unit.usageKey);
  return section;
}

/** The first line of a CSV download — its column identifiers (not UI copy). */
export async function csvHeader(response: APIResponse): Promise<string> {
  return (await response.text()).split(/\r?\n/)[0] ?? '';
}
