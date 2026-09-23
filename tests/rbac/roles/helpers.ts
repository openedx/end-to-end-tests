import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../../../src/config';
import {
  buildSection,
  createXBlock,
  fetchCourseIndex,
  fetchCourseOutline,
  publishXBlock,
  updateXBlock,
  type AuthoredSection,
} from '../../../src/api';

/**
 * The legacy course roles, exercised **without** the AuthZ flag.
 *
 * These cases describe the role model every supported release still ships, so
 * they carry no `@rbac` capability. They do need the v2 instructor API for the
 * dashboard half of the matrix, which exists only where the instructor-dashboard
 * MFE does, so `@instructor-dashboard` is the gate: `main` and `verawood` run
 * them, `ulmo` and older skip.
 */
export const LEGACY_ROLE_TAGS: string[] = ['@studio', '@author', '@instructor-dashboard'];

/** A block the matrix's write probe may rename: a section of the test's own. */
export async function writableSection(
  author: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  name: string,
): Promise<string> {
  const index = await fetchCourseIndex(author, config, courseKey);
  return createXBlock(author, config, {
    parentLocator: index.course_structure.id,
    category: 'chapter',
    displayName: name,
  });
}

/**
 * A published section that releases `daysAhead` from now — the content a beta
 * tester may reach early and a plain student may not. The content course lets
 * beta testers in a year early, so 30 days is comfortably inside that window.
 */
export async function futureSection(
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

/** Whether one actor's own course outline contains `unitKey`. */
export async function seesUnit(
  actor: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  username: string,
  unitKey: string,
): Promise<boolean> {
  const outline = await fetchCourseOutline(actor, config, courseKey, username);
  return outline.units.some((unit) => unit.id === unitKey);
}
