// Barrel for the typed API client & data-factory layer.
export { ApiError, StudioSessionExpiredError } from './errors';
export { CSRF_HEADER, CSRF_TOKEN_PATH, fetchCsrfToken } from './csrf';
export { REGISTRATION_PATH, registerLearnerAccount } from './registration';
export { ACTIVATE_PATH, activateAccount, extractActivationKey } from './activation';
export { LOGIN_SESSION_PATH, loginSession, type LoginCredentials } from './login';
export { newLearnerIdentity, DEFAULT_PASSWORD, type LearnerIdentity } from './user-identity';
export {
  COURSE_BLOCKS_PATH,
  buildOutline,
  COURSEWARE_SEQUENCE_PATH,
  fetchCourseOutline,
  primeCoursewareForLearner,
  unitsContaining,
  type CourseBlock,
  type CourseOutline,
  type CourseUnit,
} from './course-outline';
export {
  COURSE_PROGRESS_PATH,
  fetchCourseProgress,
  totalUnits,
  type CourseProgress,
} from './progress';
export {
  ENROLLMENT_PATH,
  COURSE_ENROLLMENT_DETAILS_PATH,
  enrollInCourseViaApi,
  fetchCourseEnrollmentDetails,
  isEnrolled,
  type CourseEnrollmentDetails,
} from './enrollment';
export { COURSE_MODES_PATH, ensureCertificateBearingMode, fetchCourseModes } from './course-modes';
export { COURSE_DETAIL_PATH, fetchCourseDetail, type CourseDetail } from './course-detail';
export {
  CoursePreflightError,
  assertCourseAccessible,
  courseKeySkipReason,
} from './course-preflight';

// Studio (CMS) — see `src/api/README.md`, "Studio clients".
export { studioOrigin, studioWriteHeaders, STUDIO_JSON_ACCEPT } from './studio-origin';
export {
  STUDIO_LOGIN_PATH,
  STUDIO_ME_PATH,
  establishStudioSession,
  hasStudioSession,
  fetchStudioUsername,
} from './studio-session';
export {
  STUDIO_HOME_PATH,
  STUDIO_COURSES_PATH,
  fetchStudioHome,
  listStudioCourses,
  type CourseCreatorStatus,
  type InProcessCourseAction,
  type StudioCourseList,
  type StudioCourseListQuery,
  type StudioCourseSummary,
  type StudioHome,
} from './studio-home';
export {
  REQUEST_COURSE_CREATOR_PATH,
  COURSE_CREATOR_ADMIN_PATH,
  fetchCourseCreatorStatus,
  grantCourseCreator,
  requestCourseCreator,
} from './course-creator';
export {
  CREATE_COURSE_PATH,
  COURSE_NUMBER_PREFIX,
  DEFAULT_COURSE_ORG,
  CourseExistsError,
  courseExists,
  courseKeyFor,
  createCourse,
  ensureCourse,
  newCourseIdentity,
  rerunCourse,
  waitForRerun,
  type CourseIdentity,
} from './course-factory';
export {
  ADVANCED_SETTINGS_PATH,
  COURSE_DETAILS_PATH,
  COURSE_GRADING_PATH,
  COURSE_SETTINGS_PATH,
  fetchAdvancedSettings,
  fetchCourseDetails,
  fetchCourseSettingsFlags,
  fetchGradingPolicy,
  updateAdvancedSettings,
  updateCourseDetails,
  updateGradingPolicy,
  type AdvancedSetting,
  type AdvancedSettings,
  type CourseDetails,
  type CourseSettingsFlags,
  type Grader,
  type GradingPolicy,
} from './course-settings';
export {
  COURSE_TEAM_PATH,
  COURSE_TEAM_MEMBER_PATH,
  fetchCourseTeam,
  removeCourseTeamMember,
  setCourseTeamRole,
  type CourseTeamMember,
  type CourseTeamRole,
} from './course-team';
export {
  GROUP_CONFIGURATIONS_PATH,
  GROUP_CONFIGURATIONS_WRITE_PATH,
  createContentGroups,
  fetchGroupConfigurations,
  type ContentGroup,
  type GroupConfiguration,
} from './group-configurations';
export {
  CERTIFICATES_PATH,
  CERTIFICATES_WRITE_PATH,
  CERTIFICATE_ACTIVATION_PATH,
  createCertificate,
  deleteCertificate,
  fetchCertificateConfiguration,
  resetCertificates,
  setCertificateActive,
  type Certificate,
  type CertificateConfiguration,
  type Signatory,
} from './certificates';
export {
  COURSE_APPS_PATH,
  fetchCourseApps,
  setCourseAppEnabled,
  type CourseApp,
} from './course-apps';
export {
  TABS_PATH,
  createCustomPage,
  deleteCustomPage,
  fetchCustomPages,
  setCustomPageName,
  type CustomPage,
} from './custom-pages';
export {
  EXPORT_PATH,
  EXPORT_STATUS_PATH,
  IMPORT_STATUS_PATH,
  IMPORT_SUCCESS,
  downloadCourseExport,
  fetchExportState,
  fetchImportState,
  startCourseExport,
  waitForCourseExport,
  waitForCourseImport,
  type ExportState,
  type ImportState,
} from './course-transfer';
export {
  COURSE_VALIDATION_PATH,
  COURSE_QUALITY_PATH,
  fetchCourseQuality,
  fetchCourseValidation,
  type CourseQuality,
  type CourseValidation,
} from './course-checklists';
export {
  COURSE_METADATA_PATH,
  fetchCourseMetadata,
  type CourseAccess,
  type CourseMetadata,
  type CourseTab,
} from './course-metadata';
