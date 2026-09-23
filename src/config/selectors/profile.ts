/**
 * The learner profile (`frontend-app-profile`, `/profile/u/<username>`).
 *
 * While a field is being edited it is a `form` holding its control, whose id
 * is the one stable handle: `country`, `languageProficiencies`,
 * `levelOfEducation`, `bio`, and `social-x` / `social-facebook` /
 * `social-linkedin`, with a `visibility<Field>` select beside it. The about
 * sections' forms sit in a `[role="dialog"]`; the social links edit one
 * platform at a time, inline. Labels ("Add country", "Save", "Just me") are
 * localized and never matched.
 */
export const PROFILE_SELECTORS = {
  /** A section's "Add country" / "Add a short bio" / "Add … profile" empty-state button. */
  emptyStateButton: 'button.btn-link.lh-36px',

  /** An open editing form's Cancel (outline); Save is its `type="submit"` button. */
  cancel: 'button.btn-outline-primary',

  /** The form of the field being edited: the only form with a submit button. */
  openForm: 'form:has(button[type="submit"])',

  /**
   * The certificates section's "Who can see this" select, following the
   * `visibility<Field>` naming of every other section. No release renders it
   * today (`PROF-002`).
   */
  certificatesVisibility: 'select#visibilityCourseCertificates',
} as const;

/** A field's control, keyed by its id, once its section is being edited. */
export function profileControl(field: string): string {
  return `form #${field}`;
}

/** The form a field is edited in. */
export function profileEditor(field: string): string {
  return `form:has(#${field})`;
}
