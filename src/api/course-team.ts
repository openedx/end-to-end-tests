import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { studioJson, studioOrigin, studioWrite } from './studio-origin';

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
  readonly show_transfer_ownership_hint?: boolean;
}

/** What the course team means for the caller, as Studio answers it per caller. */
export interface CourseTeamCaller {
  /** Whether the caller may add, remove and change the role of members (course admins). */
  readonly canManageTeam: boolean;
  /** Whether the caller is the course's only admin (Studio's transfer-ownership hint). */
  readonly isOnlyAdmin: boolean;
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
 * Reads what the course team means for the caller: whether it may manage the team
 * and whether it is the only admin. Studio computes both per caller on the same
 * read that lists the members.
 */
export async function fetchCourseTeamCaller(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
): Promise<CourseTeamCaller> {
  const response = await request.get(`${studioOrigin(config)}${COURSE_TEAM_PATH}/${courseKey}`);
  const raw = await studioJson<RawCourseTeam>(
    response,
    `Reading the caller's place in the team of ${courseKey}`,
  );
  return {
    canManageTeam: raw.allow_actions === true,
    isOnlyAdmin: raw.show_transfer_ownership_hint === true,
  };
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
  const path = `${COURSE_TEAM_MEMBER_PATH}/${courseKey}/${email}`;
  try {
    // Through `studioWrite`, which refuses to follow a redirect: this legacy view
    // answers a request whose Studio session has gone with a 302 to sign-in, and
    // a client that follows it reads the login page as a success and reports a
    // member it never added.
    await studioWrite(
      request,
      config,
      'POST',
      path,
      `Adding ${email} to the team of ${courseKey}`,
      {
        role,
      },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError(
        `Studio knows no account with the email "${email}", so it cannot join the team. ` +
          'Register the account first.',
        { status: 404, url: error.url, body: error.body },
      );
    }
    throw error;
  }
}

/** Removes `email` from the course team. */
export async function removeCourseTeamMember(
  request: APIRequestContext,
  config: AppConfig,
  courseKey: string,
  email: string,
): Promise<void> {
  await studioWrite(
    request,
    config,
    'DELETE',
    `${COURSE_TEAM_MEMBER_PATH}/${courseKey}/${email}`,
    `Removing ${email} from the team of ${courseKey}`,
  );
}
