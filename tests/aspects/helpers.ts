import type { APIRequestContext, Page } from '@playwright/test';

import type { AppConfig } from '../../src/config';
import { fetchInstructorReports, supersetOrigin } from '../../src/api';
import {
  dashboardLocaleSuffix,
  openCourseComparison,
  signInToSuperset,
  type CourseComparison,
} from '../../src/steps';

/** A chart's answer rows, as the dashboards' replays return them. */
export type Rows = readonly Readonly<Record<string, unknown>>[];

/** A chart cell as text (name columns, tag lists and links are strings; anything else reads as empty). */
export function cellText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Whether any cell of `row` names `text` (the test's own course, run or content name). */
function names(row: Readonly<Record<string, unknown>>, text: string): boolean {
  return Object.values(row).some((cell) => cellText(cell).includes(text));
}

/** The row of a chart that belongs to the test's course (or run): any cell naming it. */
export function rowFor(rows: Rows, text: string) {
  return rows.find((row) => names(row, text));
}

/** The sum of `metric` over the rows that belong to the test's course. */
export function sumFor(rows: Rows, text: string, metric: string): number {
  return rows.filter((row) => names(row, text)).reduce((n, row) => n + Number(row[metric] ?? 0), 0);
}

/** The choice index (`selectChoice`) of a multiple-choice answer (`choice_1` → 1). */
export function choiceIndex(answer: { readonly values: readonly string[] }): number {
  return Number(answer.values[0]?.replace('choice_', ''));
}

/** Superset's origin and the viewer's dashboard locale, as the platform advertises them. */
export async function supersetFor(reader: APIRequestContext, config: AppConfig, courseKey: string) {
  const reports = await fetchInstructorReports(reader, config, courseKey);
  return { origin: supersetOrigin(config, reports), localeSuffix: dashboardLocaleSuffix(reports) };
}

/** Signs `page`'s user in to Superset and opens Course Comparison once it lists `courses`. */
export async function comparisonFor(
  reader: APIRequestContext,
  page: Page,
  config: AppConfig,
  courseKey: string,
  courses: readonly string[],
): Promise<CourseComparison> {
  const { origin, localeSuffix } = await supersetFor(reader, config, courseKey);
  await signInToSuperset(page, origin);
  return openCourseComparison(page, origin, localeSuffix, courses);
}
