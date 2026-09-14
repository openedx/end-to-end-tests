/**
 * The authoring MFE's remaining Settings pages: Advanced Settings, Course Team,
 * Group Configurations and Certificates. Measured on Tutor `main` (2026-09-09),
 * reached through the Studio URLs `/settings/advanced/<key>`, `/course_team/<key>`,
 * `/group_configurations/<key>` and `/certificates/<key>`, which redirect to the
 * MFE (whose mount path differs by release, so nothing here depends on it).
 *
 * The save bar these pages share with Schedule & Details / Grading lives in
 * `STUDIO_SETTINGS_SAVE_BAR_SELECTORS` (`./studio-settings.ts`).
 */

export const STUDIO_ADVANCED_SETTINGS_SELECTORS = {
  /**
   * One Advanced Setting, keyed by its camelCase policy name. The value is a
   * `<textarea>` holding the setting's JSON (a quoted string, a number, a boolean,
   * or an array), so a write fills it with the JSON text and a read is that text.
   */
  field: (name: string) => `textarea[name="${name}"]`,
  /** Marks the page as rendered: the display-name field is always present. */
  ready: 'textarea[name="displayName"]',
} as const;

export const STUDIO_COURSE_TEAM_SELECTORS = {
  /** The course-team page container — marks the MFE route as rendered. */
  page: '.course-team',
  /** One team-member row. */
  member: '[data-testid="course-team-member"]',
  /** A member's display name inside the row. */
  memberName: '.member-info-name',
  /** The "New team member" button that reveals the add-by-email form. */
  newMemberButton: '.course-team button.btn.btn-primary.btn-sm',
  /** The add-member form (revealed by "New team member"). */
  addMemberForm: '[data-testid="add-user-form"]',
  /** The add-member form's email field. */
  emailInput: '[data-testid="add-user-form"] input[name="email"]',
  /**
   * The add-member form's submit ("Add user"). Scoped to the form so it never
   * matches a seated member's "Add admin access" button, which shares the
   * `btn-primary btn-sm` classes and is also enabled.
   */
  addSubmitButton: '[data-testid="add-user-form"] button[type="submit"]',
  /**
   * A member row's role-toggle button — "Add admin access" (a `btn-primary` that
   * promotes staff→instructor) or "Remove admin access" (a `btn-tertiary` that
   * demotes). Both are the row's only `.btn.btn-sm`; the delete control is an icon
   * button (`btn-icon`, no `.btn`).
   */
  roleToggleButton: '.member-actions button.btn.btn-sm',
  /** A member row's "Delete user" control (opens a confirmation modal). */
  deleteButton: '[data-testid="delete-button"]',
  /** The confirmation modal's "Delete" button. */
  deleteConfirmButton: '.pgn__modal button.btn.btn-primary',
} as const;

export const STUDIO_GROUP_CONFIGURATIONS_SELECTORS = {
  /** The group-configurations page container. */
  page: '.group-configurations',
  /** One content-group configuration card. */
  contentGroupCard: '[data-testid="content-group-card"]',
  /**
   * The button that opens the new-content-group form. It reads "Add your first
   * content group" on an empty page and "New content group" once one exists, so
   * it is anchored structurally as the page's outline-primary action button.
   */
  addContentGroupButton: '.group-configurations button.btn-primary:not([data-testid])',
  /** The new-group form's name field. */
  newGroupNameInput: 'input[name="newGroupName"]',
  /** The new-group form's "Create" button. */
  createGroupButton: '.group-configurations button.btn.btn-primary',
} as const;

export const STUDIO_CERTIFICATES_SELECTORS = {
  /**
   * The certificates page container. Scoped to the layout container because
   * `.certificates` also matches an alert toast on the page.
   */
  page: '.certificates.container-mw-xl',
  /**
   * The button that opens the create-certificate form — "Add your first
   * certificate" on an empty page, "Add certificate" once one exists. The page's
   * only primary button while no form is open, so it is anchored structurally.
   */
  newCertificateButton: '.certificates.container-mw-xl button.btn.btn-primary',
  /** The create-certificate form. */
  createForm: '[data-testid="certificates-create-form"]',
  /** One signatory's name / title / organization fields, by index. */
  signatoryName: (n: number) => `input[name="signatories[${n}].name"]`,
  signatoryTitle: (n: number) => `textarea[name="signatories[${n}].title"]`,
  signatoryOrganization: (n: number) => `input[name="signatories[${n}].organization"]`,
  /** "Add additional signatory" — the form's full-width outline button. */
  addSignatoryButton: '[data-testid="certificates-create-form"] button.btn-outline-primary.w-100',
  /** The form's "Create" submit (its last primary button, after the signatories). */
  createSubmitButton: '[data-testid="certificates-create-form"] button.btn.btn-primary',
  /**
   * The card's "Activate" button (course-wide certificate activation). The only
   * full-size outline-primary button once a certificate exists — the help toggle
   * is `btn-sm`, the add-signatory button is `w-100` and only on the form.
   */
  activateButton:
    '.certificates.container-mw-xl button.btn.btn-outline-primary:not(.w-100):not(.btn-sm)',
  /** The "Preview certificate" link; its `href` is the LMS certificate web view. */
  previewLink: '.certificates.container-mw-xl a[href*="/certificates/course/"]',
} as const;
