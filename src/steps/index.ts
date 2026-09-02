// Barrel for reusable business-flow steps.
export { registerLearner, signIn, signOut } from './auth';
export {
  catalogSearchTermFor,
  enrollFromAboutPage,
  enrollThroughCatalog,
  gotoDashboard,
  locateCourseInCatalog,
} from './course';
export {
  COMPLETABLE_BLOCK_TYPES,
  answerProblemsInUnit,
  canCompleteUnit,
  completeUnit,
  viewAllBlocksInUnit,
  type UnviewedBlock,
} from './completion';
