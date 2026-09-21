/**
 * Shared pieces of the Roles and Permissions coverage.
 *
 * Every spec in this tree runs as the worker author in the `studio-author`
 * project and is gated on the `rbac` capability: `main` and `verawood` declare
 * it, older releases skip the tree.
 */
export const RBAC_TAGS: string[] = ['@studio', '@author', '@mfe-authoring', '@rbac'];

/**
 * Accessibility debt the admin-console MFE carries, reported on every run but
 * not failed until the console fixes it (`RBAC-006`). Applied to console scans
 * only, the way `LIBRARY_A11Y_BASELINE` is applied to the library MFE's.
 */
export const ADMIN_CONSOLE_A11Y_BASELINE: readonly string[] = [
  // `RBAC-006`: the Team Members table nests `role="cell"` inside a cell, so the
  // inner node's required row parent is missing.
  'aria-required-parent',
  // `RBAC-006`: the header's icon-only control has no accessible name.
  'button-name',
  // `RBAC-006`: the audit view's breadcrumb puts a non-`<li>` child in its
  // `<ol>` (the separator icon).
  'list',
];
