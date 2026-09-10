/**
 * Studio's Django admin for course-creator rows
 * (`/admin/course_creators/coursecreator/`). Stock Django admin markup: IDs are
 * stable across Django versions and carry no localized copy.
 */
export const COURSE_CREATOR_ADMIN_SELECTORS = {
  /** Change-list search box (filters by username / email). */
  searchInput: '#searchbar',
  /** Change-list results table. */
  resultList: '#result_list',
  /** One result row. */
  resultRow: '#result_list tbody tr',
  /** The row's username cell link, which opens the change form. */
  rowUsernameLink: 'th.field-username a',
  /** The row's state cell. */
  rowState: 'td.field-state',
  /** Change form: "State" (`unrequested` / `pending` / `granted` / `denied`). */
  stateSelect: '#id_state',
  /** Change form: "All organizations" — required for the save to persist. */
  allOrganizationsCheckbox: '#id_all_organizations',
  /** Change form: "Note". */
  noteInput: '#id_note',
  /** Change form: "Save". */
  saveButton: 'input[name="_save"]',
} as const;
