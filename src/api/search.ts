import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { STUDIO_JSON_ACCEPT, studioOrigin } from './studio-origin';

/** The LMS catalog-search endpoint the discovery UI posts to. */
export const COURSE_DISCOVERY_SEARCH_PATH = '/search/course_discovery/';

/** One hit from the course-discovery index, narrowed to what the specs read. */
export interface CourseDiscoveryHit {
  /** The course key. */
  readonly id: string;
  readonly display_name?: string;
}

/**
 * Searches the LMS course-discovery index for `term` and returns the matching
 * courses. Drives the catalog search the learner-facing discovery page runs.
 *
 * The index is only populated when courseware indexing is on (a stock feature,
 * but off on a plain Tutor `main` because of the `FEATURES` flattening — see the
 * reindex spec), so an empty result on a target that has authored content means
 * indexing is off there.
 */
export async function searchCourseDiscovery(
  request: APIRequestContext,
  config: AppConfig,
  term: string,
): Promise<readonly CourseDiscoveryHit[]> {
  const url = `${config.baseUrls.lms}${COURSE_DISCOVERY_SEARCH_PATH}`;
  const token = await fetchCsrfToken(request, config);
  const response = await request.post(url, {
    form: { search_string: term },
    headers: {
      [CSRF_HEADER]: token,
      Referer: config.baseUrls.lms,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  if (!response.ok()) {
    throw new ApiError(`Catalog search for "${term}" failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: await response.text(),
    });
  }
  const body = (await response.json()) as {
    results?: readonly { data?: { id?: string; content?: { display_name?: string } } }[];
  };
  return (body.results ?? []).flatMap((r) =>
    typeof r.data?.id === 'string'
      ? [{ id: r.data.id, display_name: r.data.content?.display_name }]
      : [],
  );
}

/**
 * Triggers a courseware reindex through Studio's `reindex_link` (the path
 * `course_index` hands the author when indexing is on and the session is global
 * staff). Rebuilds the course's search index so freshly authored or renamed
 * content becomes findable through {@link searchCourseDiscovery}.
 *
 * `reindexLink` is the deployment's own path (read from `course_index`), resolved
 * against the Studio origin — never hard-coded.
 */
export async function reindexCourse(
  request: APIRequestContext,
  config: AppConfig,
  reindexLink: string,
): Promise<void> {
  const url = `${studioOrigin(config)}${reindexLink}`;
  const response = await request.get(url, { headers: STUDIO_JSON_ACCEPT });
  if (!response.ok()) {
    throw new ApiError(`Reindexing via ${reindexLink} failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: await response.text(),
    });
  }
}
