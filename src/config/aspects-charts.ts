/**
 * Where Aspects' dashboards (Course Dashboard, Course Comparison, Individual
 * Learner) keep each reading the sheet names, and how to recognise the chart
 * that shows it without its (translated) title: each dashboard's slug, its tabs
 * and native filters by asset id, and its chart keys.
 *
 * Superset's chart and dashboard ids are numeric and differ per install, but a
 * dashboard's tab ids come from its asset file and are the same everywhere, and
 * inside one tab each chart is told apart by its viz type and metric labels (SQL
 * names, not copy). A chart loads only while its tab is shown, so a key names the
 * tab its chart is read from. Measured on Aspects 5.0.0 (tutor-contrib-aspects
 * `openedx-assets/assets/dashboards/Course_Dashboard.yaml`) on 2026-09-29.
 */

/** A chart as the replay oracle finds it: the tab it loads on, its viz type, its metrics. */
export interface AspectsChartKey {
  readonly tab: string;
  readonly vizType: string;
  readonly metrics: readonly string[];
}

/** The Course Dashboard's tabs, by asset layout id. */
export const COURSE_DASHBOARD_TABS = {
  /** "Enrollment" (the default tab). The header charts above the tabs load with it. */
  enrollment: 'TAB-4ptSkqs5MS',
  /** "Engagement", which holds the three tabs below. */
  engagement: 'TAB-_Ey4nPhFr',
  /** "Engagement / Pages". */
  pages: 'TAB-nqLFUR_Tg',
  /** "Engagement / Problems". */
  problems: 'TAB-vze5iq6jg',
  /** "Engagement / Videos". */
  videos: 'TAB-V5zNdxwhsP',
} as const;

const T = COURSE_DASHBOARD_TABS;

/** The tab a nested tab sits in, which must be shown first. */
export const COURSE_DASHBOARD_TAB_PARENTS: Readonly<Record<string, string>> = {
  [T.pages]: T.engagement,
  [T.problems]: T.engagement,
  [T.videos]: T.engagement,
};

/** The Course Dashboard charts TC-00545–00548 read. */
export const COURSE_DASHBOARD_CHARTS = {
  /** "Current Enrollees" (header). */
  currentEnrollees: {
    tab: T.enrollment,
    vizType: 'big_number_total',
    metrics: ['number_of_learners'],
  },
  /** "Enrollees per Enrollment Track", one bar per `enrollment_mode`. */
  enrolleesPerTrack: {
    tab: T.enrollment,
    vizType: 'echarts_timeseries_bar',
    metrics: ['number_of_learners'],
  },
  /** "Cumulative Enrollments by Track", over `emission_time`. */
  cumulativeEnrollments: {
    tab: T.enrollment,
    vizType: 'echarts_area',
    metrics: ['number_of_learners'],
  },
  /** "Section Summary": learners who viewed a page, per section. */
  sectionSummary: { tab: T.pages, vizType: 'table', metrics: ['number_of_learners'] },
  /** "Subsection Summary": learners and views, per section and subsection. */
  subsectionSummary: { tab: T.pages, vizType: 'table', metrics: ['number_of_learners', 'views'] },
  /** "Page Engagement per Section/Subsection". */
  pageEngagement: {
    tab: T.pages,
    vizType: 'echarts_timeseries_bar',
    metrics: ['all_pages_viewed', 'at_leat_one_page_viewed'],
  },
  /** "Problem Engagement per Section/Subsection". */
  problemEngagement: {
    tab: T.problems,
    vizType: 'echarts_timeseries_bar',
    metrics: ['attempted_at_least_one_problem', 'attempted_all_problems'],
  },
  /** "Problem Attempts and Results", one row per problem. */
  problemAttempts: {
    tab: T.problems,
    vizType: 'table',
    metrics: [
      'number_of_learners',
      'median_attemps',
      'avg_attemps',
      'correct_attempts',
      'incorrect_attempts',
      'correct_percent',
      'incorrect_percent',
    ],
  },
  /** "Video Engagement per Section/Subsection". */
  videoEngagementPerSection: {
    tab: T.videos,
    vizType: 'echarts_timeseries_bar',
    metrics: ['all_videos_viewed', 'at_least_one_viewed'],
  },
  /** "Video Engagement", one row per video. */
  videoEngagement: { tab: T.videos, vizType: 'table', metrics: ['unique_viewers', 'total_views'] },
  /** "Partial and Full Video Views", per video. */
  partialAndFullViews: {
    tab: T.videos,
    vizType: 'echarts_timeseries_bar',
    metrics: ['partial_views', 'full_views'],
  },
  /** "Number of Views across Video Duration": the watched segments. */
  viewsAcrossDuration: {
    tab: T.videos,
    vizType: 'echarts_timeseries_bar',
    metrics: ['total_views', 'repeat_views'],
  },
} as const satisfies Record<string, AspectsChartKey>;

/** The Course Dashboard's slug, before the locale suffix Aspects appends (`-en`). */
export const COURSE_DASHBOARD_SLUG = 'course-dashboard';

/** Course Comparison's slug, before the locale suffix. It is not embeddable: read on Superset. */
export const COURSE_COMPARISON_SLUG = 'course-comparison';

/** Course Comparison's tabs, by asset layout id (`Course_Comparison_Dashboard.yaml`). */
export const COURSE_COMPARISON_TABS = {
  /** "Course Metrics": one row per course. */
  courseMetrics: 'TAB-J31MdXj-sa',
  /** "Run Metrics": one row per course run. */
  runMetrics: 'TAB-GuHDMLqRC',
} as const;

/** Course Comparison's native filters, by id (`native_filter_configuration` in its asset). */
export const COURSE_COMPARISON_FILTERS = {
  /** "Organization": preselects the first organization; the course filters cascade from it. */
  organization: 'NATIVE_FILTER-QrTlO4wBf',
  /** "Tag": course-level tags. */
  tag: 'NATIVE_FILTER-M1zEXEB97',
  /** "Course Name". */
  courseName: 'NATIVE_FILTER-IfS-Rd0ZS',
  /** "Course Run". */
  courseRun: 'NATIVE_FILTER-w863AfFgi',
} as const;

const CC = COURSE_COMPARISON_TABS;

/** The Course Comparison charts TC-00553–00559 read, per tab (each tab has its own copy). */
export const COURSE_COMPARISON_CHARTS = {
  /** "Course Info" per course: enrollees, active in the last 7 days, tags, "More details". */
  courseInfo: {
    tab: CC.courseMetrics,
    vizType: 'table',
    metrics: ['enrollees', 'active_count', 'tag_list'],
  },
  /** "Enrollment Counts" per course and enrollment mode. */
  courseEnrollmentCounts: {
    tab: CC.courseMetrics,
    vizType: 'pivot_table_v2',
    metrics: ['enrollees'],
  },
  /** "Learner Performance Breakdown" per course (`name_org`). */
  coursePerformanceBreakdown: {
    tab: CC.courseMetrics,
    vizType: 'echarts_timeseries_bar',
    metrics: ['count', 'passed', 'active', 'at_risk'],
  },
  /** "Learner Performance" per course. */
  coursePerformance: {
    tab: CC.courseMetrics,
    vizType: 'table',
    metrics: ['first_try_correct', 'count_passing', 'avg_course_grade', 'med_course_grade'],
  },
  /** "Video Engagement" per course (`video_count` is a column). */
  courseVideoEngagement: {
    tab: CC.courseMetrics,
    vizType: 'table',
    metrics: ['avg_video_length', 'num_videos_watched', 'watched_percent', 'rewatched_percent'],
  },
  /** "Course Info" per run. */
  runInfo: {
    tab: CC.runMetrics,
    vizType: 'table',
    metrics: ['enrollees', 'active_count', 'tag_list'],
  },
  /** "Enrollment Counts" per run and enrollment mode. */
  runEnrollmentCounts: { tab: CC.runMetrics, vizType: 'pivot_table_v2', metrics: ['enrollees'] },
  /** "Learner Performance Breakdown" per run (`run_name`). */
  runPerformanceBreakdown: {
    tab: CC.runMetrics,
    vizType: 'echarts_timeseries_bar',
    metrics: ['passed', 'count', 'at_risk', 'active'],
  },
  /** "Learner Performance" per run. */
  runPerformance: {
    tab: CC.runMetrics,
    vizType: 'table',
    metrics: ['first_try_correct', 'count_passing', 'avg_course_grade', 'med_course_grade'],
  },
  /** "Video Engagement" per run. */
  runVideoEngagement: {
    tab: CC.runMetrics,
    vizType: 'table',
    metrics: [
      'Number of Videos',
      'avg_video_length',
      'num_videos_watched',
      'watched_percent',
      'rewatched_percent',
    ],
  },
} as const satisfies Record<string, AspectsChartKey>;

/** The Individual Learner dashboard's slug, before the locale suffix (offered where Aspects exposes PII). */
export const INDIVIDUAL_LEARNER_SLUG = 'individual-learner';

/** Individual Learner's tabs, by asset layout id (`Individual_Learner.yaml`). */
export const INDIVIDUAL_LEARNER_TABS = {
  /** "Pages" (the default tab). The Learner Summary above the tabs loads with it. */
  pages: 'TAB-LMmJ7FePiY',
} as const;

/** Individual Learner's native filters, by id. */
export const INDIVIDUAL_LEARNER_FILTERS = {
  /** "Username": the course's learners, row-level-secured to the course. */
  username: 'NATIVE_FILTER-FDZVMcK41',
} as const;

/** The Individual Learner charts TC-00544 reads. */
export const INDIVIDUAL_LEARNER_CHARTS = {
  /** "Learner Summary": one row per learner (`username`, `name`, `email`, grade, …), no metrics. */
  learnerSummary: { tab: INDIVIDUAL_LEARNER_TABS.pages, vizType: 'table', metrics: [] },
} as const satisfies Record<string, AspectsChartKey>;
