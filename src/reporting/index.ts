export {
  TEST_ID_ANNOTATION_TYPE,
  testId,
  testIdsFromAnnotations,
  type TestIdAnnotation,
} from './test-id';
export {
  summarizeCoverage,
  verdictFor,
  type CoverageSummary,
  type CoverageVerdict,
  type TestOutcome,
  type TestIdOutcome,
  type TestStatus,
  type VerdictTotals,
} from './coverage';
export { default as CoverageReporter, type CoverageReporterOptions } from './coverage-reporter';
export {
  summarizeA11yViolations,
  type A11ySummary,
  type A11yRuleSummary,
  type A11yOccurrence,
  type A11yStatus,
} from './a11y';
export { default as A11yReporter, type A11yReporterOptions } from './a11y-reporter';
export { ISSUE_ANNOTATION_TYPE, issue, type IssueAnnotation } from './issue';
