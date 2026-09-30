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
export { pollUntil, type PollOutcome } from './poll';
export {
  TAG,
  IMPORT_EXTRA_TAG,
  seedTaxonomy,
  taxonomyImportFile,
  taxonomyImportFileCsv,
  taxonomyImportFileExtended,
} from './tagging';
