// Barrel for reusable business-flow steps.
export { registerLearner, signIn, signOut } from './auth';
export { catalogSearchTermFor, locateCourseInCatalog } from './course';
export {
  COMPLETABLE_BLOCK_TYPES,
  answerProblemsInUnit,
  canCompleteUnit,
  completeUnit,
  recordCompletions,
  viewAllBlocksInUnit,
  type CompletionRecorder,
  type UnviewedBlock,
} from './completion';
