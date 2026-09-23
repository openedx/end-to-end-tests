// Barrel for structural anchors, one module per surface. See ./README.md.
export { ACCOUNT_MENU_SELECTORS } from './account-menu';
export { ADMIN_CONSOLE_SELECTORS } from './admin-console';
export { CATALOG_SEARCH_PATH, CATALOG_SELECTORS, catalogCourseCard } from './catalog';
export { COURSE_ABOUT_SELECTORS, courseAboutCoursewareLink } from './course-about';
export {
  COURSEWARE_SELECTORS,
  coursewareBlock,
  sidebarSubsectionRowFor,
  sidebarUnitLink,
} from './courseware';
export { CAPA_SELECTORS } from './capa';
export { PROGRESS_SELECTORS, progressTabLink } from './progress';
export { DASHBOARD_SELECTORS } from './dashboard';
export { COURSE_HOME_SELECTORS } from './course-home';
export { STUDIO_HOME_SELECTORS } from './studio-home';
export { STUDIO_OUTLINE_SELECTORS, STUDIO_SHELL_SELECTORS } from './studio-shell';
export {
  STUDIO_OUTLINE_PAGE_SELECTORS,
  outlineMenuItem,
  sectionCardContaining,
  subsectionCardContaining,
  unitCardFor,
} from './studio-outline';
export { STUDIO_SIDEBAR_SELECTORS, type SidebarPageKey } from './studio-sidebar';
export { TAG_DRAWER_SELECTORS, encodedTagValue } from './tag-drawer';
export { TAXONOMY_SELECTORS } from './taxonomies';
export { STUDIO_FILES_SELECTORS, FILES_ROW_MENU } from './studio-files';
export { STUDIO_TEXTBOOKS_SELECTORS } from './studio-textbooks';
export {
  STUDIO_GRADING_SELECTORS,
  STUDIO_SCHEDULE_DETAILS_SELECTORS,
  STUDIO_SETTINGS_SAVE_BAR_SELECTORS,
} from './studio-settings';
export {
  STUDIO_ADVANCED_SETTINGS_SELECTORS,
  STUDIO_CERTIFICATES_SELECTORS,
  STUDIO_COURSE_TEAM_SELECTORS,
  STUDIO_GROUP_CONFIGURATIONS_SELECTORS,
} from './studio-settings-pages';
export {
  STUDIO_EXPORT_SELECTORS,
  STUDIO_IMPORT_SELECTORS,
  STUDIO_STEPPER_STATE,
  STUDIO_CHECKLISTS_SELECTORS,
  LAUNCH_CHECKLIST_ITEMS,
} from './studio-tools';
export { STUDIO_PAGES_RESOURCES_SELECTORS } from './studio-pages-resources';
export { STUDIO_CUSTOM_PAGES_SELECTORS } from './studio-custom-pages';
export { STUDIO_UNIT_PAGE_SELECTORS } from './studio-unit';
export { STUDIO_EDITOR_SELECTORS } from './studio-editors';
export {
  CERTIFICATE_GENERATION_ADMIN_SELECTORS,
  COURSE_CREATOR_ADMIN_SELECTORS,
} from './django-admin';
export {
  INSTRUCTOR_CERTIFICATE_FILTERS,
  INSTRUCTOR_DASHBOARD_SELECTORS,
  INSTRUCTOR_REPORT_ROWS,
  INSTRUCTOR_TAB_IDS,
  instructorTabLink,
  instructorTabPath,
  type InstructorReportType,
  type InstructorTabId,
} from './instructor';
export {
  COURSE_LIBRARY_SYNC_SELECTORS,
  LEGACY_MIGRATION_SELECTORS,
  LIBRARY_CONTAINER_TYPES,
  LIBRARY_PICKER_SELECTORS,
  LIBRARY_SELECTORS,
  LIBRARY_TABS,
  courseLibrariesPath,
  createLibraryPath,
  legacyMigrationPath,
  libraryCollectionPath,
  libraryContainerPath,
  libraryPath,
  type LibraryContainerType,
  type LibraryTab,
} from './library';
export * from './studio-updates';
