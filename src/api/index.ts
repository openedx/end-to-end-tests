// Barrel for the typed API client & data-factory layer.
export { ApiError } from './errors';
export { CSRF_HEADER, CSRF_TOKEN_PATH, fetchCsrfToken } from './csrf';
export { REGISTRATION_PATH, registerLearnerAccount } from './registration';
export { ACTIVATE_PATH, activateAccount, extractActivationKey } from './activation';
export { LOGIN_SESSION_PATH, loginSession, type LoginCredentials } from './login';
export { newLearnerIdentity, type LearnerIdentity } from './user-identity';
export {
  COURSE_BLOCKS_PATH,
  buildOutline,
  fetchCourseOutline,
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
export { ENROLLMENT_PATH, enrollInCourseViaApi, isEnrolled } from './enrollment';
export { COURSE_DETAIL_PATH, fetchCourseDetail, type CourseDetail } from './course-detail';
export {
  CoursePreflightError,
  assertCourseAccessible,
  courseKeySkipReason,
} from './course-preflight';
