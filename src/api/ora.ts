import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { lmsGet, lmsWrite } from './lms-json';
import { createXBlock, publishXBlock, updateXBlock } from './xblock';

/**
 * Open Response Assessments (edx-ora2) as the notification cases drive them: a
 * staff-graded ORA in a unit, a learner's submission through the block's own
 * handlers, and a staff grade through its `staff_assess` handler — the two
 * events behind `ora_staff_notifications` (to course staff) and
 * `ora_grade_assigned` (to the learner). Measured on ora2 7.1.1; no MFE is
 * involved, so the grading MFE's enablement is irrelevant here.
 */

/**
 * The default rubric of a new ORA: "Ideas" (Poor 0 / Fair 3 / Good 5) and
 * "Content" (Poor / Fair / Good / Excellent), ten points in all. These option
 * names are the block's own OLX, not platform copy.
 */
const ORA_FULL_MARKS: Readonly<Record<string, string>> = {
  Ideas: 'Good',
  Content: 'Excellent',
};
export const ORA_POINTS_POSSIBLE = 10;

/**
 * Adds an ORA to a unit whose only assessment step is a required staff
 * assessment, and publishes the unit. Returns the ORA's usage key.
 */
export async function authorStaffGradedOra(
  request: APIRequestContext,
  config: AppConfig,
  unitUsageKey: string,
  displayName: string,
): Promise<string> {
  const usageKey = await createXBlock(request, config, {
    parentLocator: unitUsageKey,
    category: 'openassessment',
    displayName,
  });
  await updateXBlock(request, config, usageKey, {
    fields: {
      rubric_assessments: [{ name: 'staff-assessment', required: true, start: null, due: null }],
    },
  });
  await publishXBlock(request, config, unitUsageKey);
  return usageKey;
}

const handlerUrl = (config: AppConfig, courseKey: string, usageKey: string, handler: string) =>
  `${config.baseUrls.lms}/courses/${courseKey}/xblock/${usageKey}/handler/${handler}`;

/** Saves and submits a learner's text response, as the ORA's Submit does. */
export async function submitOraResponse(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  usageKey: string,
  text: string,
): Promise<void> {
  const data = { submission: [text] };
  await lmsWrite(
    request,
    config,
    'POST',
    handlerUrl(config, courseKey, usageKey, 'save_submission'),
    `Saving an ORA response in ${usageKey}`,
    { data },
  );
  const url = handlerUrl(config, courseKey, usageKey, 'submit');
  const result = await lmsWrite<readonly unknown[]>(
    request,
    config,
    'POST',
    url,
    `Submitting an ORA response in ${usageKey}`,
    { data },
  );
  // `[true, <status>, <attempt>]` on success; `[false, <error code>, <message>]` otherwise.
  if (result[0] !== true) {
    throw new ApiError(`The ORA refused the submission: ${JSON.stringify(result)}.`, {
      status: 200,
      url,
      body: JSON.stringify(result),
    });
  }
}

/** One submission as the staff grader lists it. */
export interface OraSubmission {
  readonly submissionUUID: string;
  readonly username: string;
  readonly gradeStatus: string;
}

/**
 * The ORA's submissions as course staff see them (the staff grader's
 * `initialize`), for the uuid a grade needs. A learner is answered 500, not 403
 * (`NOTIF-002`).
 */
export async function listOraSubmissions(
  request: APIRequestContext,
  config: AppConfig,
  usageKey: string,
): Promise<readonly OraSubmission[]> {
  const body = await lmsGet<{ readonly submissions: Readonly<Record<string, OraSubmission>> }>(
    request,
    `${config.baseUrls.lms}/api/ora_staff_grader/initialize?oraLocation=${encodeURIComponent(usageKey)}`,
    `Listing the submissions of ${usageKey}`,
  );
  return Object.values(body.submissions);
}

/** Grades one submission as staff (a full grade), through the block's `staff_assess` handler. */
export async function staffAssessOra(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  usageKey: string,
  submissionUUID: string,
  optionsSelected: Readonly<Record<string, string>> = ORA_FULL_MARKS,
): Promise<void> {
  const url = handlerUrl(config, courseKey, usageKey, 'staff_assess');
  const result = await lmsWrite<{ readonly success: boolean; readonly msg: string }>(
    request,
    config,
    'POST',
    url,
    `Staff-grading ${submissionUUID} in ${usageKey}`,
    {
      data: {
        submission_uuid: submissionUUID,
        options_selected: optionsSelected,
        criterion_feedback: {},
        overall_feedback: '',
        assess_type: 'full-grade',
      },
    },
  );
  if (!result.success) {
    throw new ApiError(`The ORA refused the staff grade: ${result.msg}`, {
      status: 200,
      url,
      body: JSON.stringify(result),
    });
  }
}
