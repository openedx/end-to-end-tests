/**
 * The communications MFE's bulk e-mail form
 * (`${APPS}/communications/courses/<key>/bulk_email`), which the instructor
 * dashboard's "Bulk Email" tab links to. Measured on Tutor `main` (2026-09-24).
 * Labels are localized, so the anchors are the form's names, ids and classes.
 */
export const COMMUNICATIONS_SELECTORS = {
  /** A recipient group's checkbox ("Myself", "Staff and instructors", "All learners"), by its value. */
  recipient: (group: 'myself' | 'staff' | 'learners') =>
    `input[name="recipientGroups"][value="${group}"]`,
  /** "Subject". */
  subject: '#emailSubject',
  /** The message body: a TinyMCE editor's editable frame. */
  messageFrame: 'iframe.tox-edit-area__iframe',
  /** "Send email". */
  send: 'button.send-email-btn',
  /** The "Caution" dialog's confirming "Send email" (its primary button). */
  confirm: '[role="dialog"] button.btn-primary',
} as const;
