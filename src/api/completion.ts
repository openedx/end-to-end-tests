import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { lmsGet, lmsWrite } from './lms-json';

/**
 * Block completion as the platform records it (`edx-completion`), and the
 * resume point it derives from the most recent completion — what the course
 * home's Resume button links to (TC-00028).
 *
 * `completion-batch` lets a learner record completions for itself (the view is
 * owner-or-staff), which puts a resume point exactly where a spec wants it
 * without driving each block's own completion mechanism. It needs the
 * platform's `completion.enable_completion_tracking` switch, which Tutor's init
 * turns on.
 */
export async function recordCompletion(
  request: APIRequestContext,
  config: AppConfig,
  username: string,
  courseKey: string,
  usageId: string,
): Promise<void> {
  await lmsWrite(
    request,
    config,
    'POST',
    `${config.baseUrls.lms}/api/completion/v1/completion-batch`,
    'Recording a block completion',
    { data: { username, course_key: courseKey, blocks: { [usageId]: 1.0 } } },
  );
}

/** Where the learner resumes: the last completed block and its unit and section. */
export interface ResumePoint {
  readonly block_id: string | null;
  readonly unit_id: string | null;
  readonly section_id: string | null;
}

export async function fetchResumePoint(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<ResumePoint> {
  return lmsGet(
    request,
    `${config.baseUrls.lms}/api/courseware/resume/${courseKey}`,
    'Reading the resume point',
  );
}
