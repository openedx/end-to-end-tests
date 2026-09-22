/**
 * Studio under AuthZ: the authoring surfaces driven by an account whose rights
 * come from `openedx-authz` rather than from a legacy `CourseAccessRole` row.
 *
 * Every spec here runs on the worker's AuthZ course — already flagged and
 * migrated — and assigns its actors the course roles it needs. They carry
 * `@rbac` (so a release without it skips) and `@instructor-dashboard` where they
 * drive that MFE.
 */
export const STUDIO_AUTHZ_TAGS: string[] = ['@studio', '@author', '@mfe-authoring', '@rbac'];
