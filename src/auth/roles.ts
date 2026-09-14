/**
 * Named roles the auth contract can produce a signed-in session for. Specs ask
 * for a role rather than juggling credentials, so a provider with custom
 * provisioning can satisfy the same roles without the tests changing.
 *
 * - `learner` — a fresh self-registered account.
 * - `instructor` — a course-team member without course-creator rights; no
 *   default account, an installation supplies one.
 * - `staff` — the configured admin (`ADMIN_*`), a superuser.
 * - `author` — a fresh account granted course-creator status, with a session
 *   valid on Studio as well as the LMS. The Studio specs run as this role.
 *   "Author" and "course creator" are one role: creator status is the only
 *   Studio-side distinction a *session* carries, while "can edit this course but
 *   not create one" is a per-course fact (course-team membership), not a role.
 */
export const ROLES = ['learner', 'instructor', 'staff', 'author'] as const;

export type Role = (typeof ROLES)[number];
