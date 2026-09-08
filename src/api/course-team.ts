import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { studioJson, studioOrigin, studioWriteHeaders } from './studio-origin';

/** Course Team list, as the authoring MFE reads it. */
export const COURSE_TEAM_PATH = '/api/contentstore/v1/course_team';

/** Course Team membership writes: `POST`/`DELETE …/<course>/<email>`. */
export const COURSE_TEAM_MEMBER_PATH = '/course_team';

/** Studio's two course-team roles: `instructor` is "Admin" in the UI. */
export type CourseTeamRole = 'staff' | 'instructor';

export interface CourseTeamMember {
  readonly email: string;
  readonly username: string;
  readonly role: CourseTeamRole;
}

interface RawCourseTeam {
  readonly users?: readonly {
    readonly email?: string;
    readonly username?: string;
    readonly role?: string;
  }[];
  readonly allow_actions?: boolean;
}

export async function fetchCourseTeam(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<readonly CourseTeamMember[]> {
  const response = await request.get(`${studioOrigin(config)}${COURSE_TEAM_PATH}/${courseKey}`);
  const raw = await studioJson<RawCourseTeam>(response, `Reading the course team of ${courseKey}`);
  return (raw.users ?? []).map((user) => ({
    email: user.email ?? '',
    username: user.username ?? '',
    role: (user.role ?? 'staff') as CourseTeamRole,
  }));
}

/**
 * Adds `email` to the course team with `role`, or changes an existing member's
 * role. The account must already exist on the target — Studio answers `404`
 * otherwise, which is surfaced with that explanation.
 */
export async function setCourseTeamRole(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  email: string,
  role: CourseTeamRole,
): Promise<void> {
  const url = `${studioOrigin(config)}${COURSE_TEAM_MEMBER_PATH}/${courseKey}/${email}`;
  const headers = await studioWriteHeaders(request, config);
  const response = await request.post(url, { data: { role }, headers });
  if (response.status() === 404) {
    throw new ApiError(
      `Studio knows no account with the email "${email}", so it cannot join the team. ` +
        'Register the account first.',
      { status: 404, url, body: await response.text() },
    );
  }
  if (!response.ok()) {
    throw new ApiError(
      `Adding ${email} to the team of ${courseKey} failed (HTTP ${response.status()}).`,
      {
        status: response.status(),
        url,
        body: await response.text(),
      },
    );
  }
}

/** Removes `email` from the course team. */
export async function removeCourseTeamMember(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  email: string,
): Promise<void> {
  const url = `${studioOrigin(config)}${COURSE_TEAM_MEMBER_PATH}/${courseKey}/${email}`;
  const headers = await studioWriteHeaders(request, config);
  const response = await request.delete(url, { headers });
  if (!response.ok()) {
    throw new ApiError(
      `Removing ${email} from the team of ${courseKey} failed (HTTP ${response.status()}).`,
      { status: response.status(), url, body: await response.text() },
    );
  }
}
