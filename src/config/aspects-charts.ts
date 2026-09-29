/**
 * Where the Aspects Course Dashboard keeps each reading the sheet names, and how
 * to recognise the chart that shows it without its (translated) title.
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
