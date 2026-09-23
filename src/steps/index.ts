// Barrel for reusable business-flow steps.
export { registerLearner, signIn, signOut } from './auth';
export { catalogSearchTermFor, locateCourseInCatalog } from './course';
export {
  COMPLETABLE_BLOCK_TYPES,
  answerProblemsInUnit,
  canCompleteUnit,
  completeUnit,
  isDrivableBlock,
  recordCompletions,
  undrivableBlockKinds,
  viewAllBlocksInUnit,
  type CompletionRecorder,
  type UnviewedBlock,
} from './completion';
export {
  createCourseThroughStudioHome,
  grantCourseCreatorThroughAdmin,
  type StudioCourseCreation,
} from './studio';
export { satisfyPrerequisiteByScore, submitProblem } from './gating';
export {
  ensureDataResearcher,
  mintCertificateByException,
  waitForInstructorTask,
  waitForLearnerProgress,
  waitForReport,
  type CertificateMintOutcome,
  type TaskWaitOutcome,
} from './instructor';
export {
  authorLibrary,
  waitForLearnerBlock,
  waitForMigration,
  waitForSyncAvailable,
  type AuthoredLibrary,
  type LibraryBlockSpec,
  type LibraryShape,
} from './library';
export {
  COURSE_CAPABILITIES,
  FULL_COURSE_ACCESS,
  NO_COURSE_ACCESS,
  disableAuthzForCourse,
  enableAuthzForCourse,
  instructorTabsFor,
  readCoursePermissions,
  probeMigrationMode,
  seedScopeAssignments,
  waitForCourseFlagState,
  waitForMigrationRun,
  type AuthzEnableOutcome,
  type CourseCapability,
  type PermissionProbeTargets,
  type PermissionReadings,
  type MigrationMode,
  type MigrationModeProbe,
} from './rbac';
export { pollUntil, type PollOutcome } from './poll';
export {
  TAG,
  IMPORT_EXTRA_TAG,
  seedTaxonomy,
  taxonomyImportFile,
  taxonomyImportFileCsv,
  taxonomyImportFileExtended,
} from './tagging';
export {
  aboutOra,
  aboutThread,
  checkNotificationAbsent,
  turnOffEveryNotification,
  waitForNotification,
  type AbsenceCheck,
  type NotificationMatch,
  type NotificationWait,
} from './notifications';
export { linkIn, linkingTo, waitForMail } from './mail';
export {
  KNOWN_CHROME_DEFECTS,
  anonymousHeaderExpectation,
  chromeConfigSourceFor,
  horizontalOverflow,
  knownChromeDefects,
  partitionSiteLinks,
  readPageChrome,
  type AnonymousHeaderExpectation,
  type ChromeDefectContext,
  type KnownChromeDefect,
  type PageChrome,
} from './chrome';
