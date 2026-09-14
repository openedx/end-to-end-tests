import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { fetchStudioHome, type CourseCreatorStatus } from './studio-home';
import { studioJson, studioOrigin, studioWriteHeaders } from './studio-origin';

/** Studio's "request course creator access" action (BTR TC-00310, first half). */
export const REQUEST_COURSE_CREATOR_PATH = '/request_course_creator';

/**
 * Django admin change list for course-creator rows. A default install offers
 * **no REST API for the grant** — the admin form is the only path, and needs a
 * superuser session (the suite's `staff` role). Second half of TC-00310.
 */
export const COURSE_CREATOR_ADMIN_PATH = '/admin/course_creators/coursecreator/';

/**
 * Asks Studio for course-creator access on behalf of the session's user. Moves the
 * status from `unrequested` to `pending`; harmless when already requested.
 *
 * @throws {ApiError} when Studio refuses the request.
 */
export async function requestCourseCreator(
  request: APIRequestContext,
  config: AppConfig,
): Promise<void> {
  const origin = studioOrigin(config);
  const headers = await studioWriteHeaders(request, config);
  const response = await request.post(`${origin}${REQUEST_COURSE_CREATOR_PATH}`, { headers });
  const body = await studioJson<{ Status?: string }>(response, 'Requesting course-creator access');
  if (body.Status !== 'OK') {
    throw new ApiError('Studio did not acknowledge the course-creator request.', {
      status: response.status(),
      url: response.url(),
      body: JSON.stringify(body),
    });
  }
}

/** Reads the session's course-creator status from Studio Home. */
export async function fetchCourseCreatorStatus(
  request: APIRequestContext,
  config: AppConfig,
): Promise<CourseCreatorStatus> {
  return (await fetchStudioHome(request, config)).courseCreatorStatus;
}

/** Finds the change-form path for `username`'s row on one change-list page. */
function findChangeFormPath(listHtml: string, username: string): string | undefined {
  // Each row is one <tr>; the row for a user contains the username as its link
  // text (or in a cell) and one link to that row's change form.
  const rowPattern = /<tr[\s\S]*?<\/tr>/g;
  const usernamePattern = new RegExp(`(^|[^\\w])${username}($|[^\\w])`);
  for (const [row] of listHtml.matchAll(rowPattern)) {
    if (!usernamePattern.test(row)) continue;
    const link = row.match(/href="([^"]*\/coursecreator\/\d+\/change\/)"/);
    if (link) return link[1];
  }
  return undefined;
}

/** Whether a change-list page links to a next page, and which index it is. */
function nextPageIndex(listHtml: string, current: number): number | undefined {
  const next = current + 1;
  return new RegExp(`[?&]p=${next}(&|")`).test(listHtml) ? next : undefined;
}

/**
 * Grants course-creator status to `username` through Studio's Django admin, as
 * the operator would by hand: locate the user's row on the change list, open its
 * change form, submit it with `state=granted`.
 *
 * `adminRequest` must be a request context holding a **superuser** Studio
 * session (the `staff` role after `establishStudioSession`). The user must have
 * requested access first ({@link requestCourseCreator}), which is what creates
 * the row.
 *
 * Measured detail: the form re-renders with HTTP 200 and saves nothing unless
 * the `all_organizations` box is checked (or organizations are chosen), so it is
 * always sent; a saved form answers with a redirect to the list.
 *
 * @throws {ApiError} when the row cannot be found or the form is not accepted.
 */
export async function grantCourseCreator(
  adminRequest: APIRequestContext,
  config: AppConfig,
  username: string,
): Promise<void> {
  const origin = studioOrigin(config);
  const listUrl = `${origin}${COURSE_CREATOR_ADMIN_PATH}`;

  let changePath: string | undefined;
  let page: number | undefined = 0;
  while (changePath === undefined && page !== undefined) {
    const pageUrl = page === 0 ? listUrl : `${listUrl}?p=${page}`;
    const list = await adminRequest.get(pageUrl);
    if (!list.ok()) {
      throw new ApiError(
        `Could not open the course-creator admin list (HTTP ${list.status()}). The session ` +
          'must belong to a superuser: check ADMIN_USERNAME / ADMIN_PASSWORD.',
        { status: list.status(), url: pageUrl, body: await list.text() },
      );
    }
    const html = await list.text();
    changePath = findChangeFormPath(html, username);
    page = nextPageIndex(html, page);
  }

  if (changePath === undefined) {
    throw new ApiError(
      `No course-creator row for "${username}" in the Studio admin. The user must request ` +
        'access first (POST /request_course_creator) — that creates the row.',
      { status: 404, url: listUrl, body: '' },
    );
  }

  const changeUrl = `${origin}${changePath}`;
  const form = await adminRequest.get(changeUrl);
  const formHtml = await form.text();
  const token = formHtml.match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1];
  if (!form.ok() || token === undefined) {
    throw new ApiError(`Could not open the course-creator change form (HTTP ${form.status()}).`, {
      status: form.status(),
      url: changeUrl,
      body: formHtml.slice(0, 500),
    });
  }

  const saved = await adminRequest.post(changeUrl, {
    form: {
      csrfmiddlewaretoken: token,
      state: 'granted',
      note: 'Granted by the end-to-end test suite.',
      all_organizations: 'on',
      _save: 'Save',
    },
    headers: { Referer: changeUrl },
    maxRedirects: 0,
  });

  // Django admin answers a successful save with a redirect back to the list; a
  // 200 means the form re-rendered with validation errors.
  if (saved.status() < 300 || saved.status() >= 400) {
    const body = await saved.text();
    const errors = [...body.matchAll(/<ul class="errorlist[^"]*">([\s\S]*?)<\/ul>/g)]
      .map((match) =>
        (match[1] ?? '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .join(' | ');
    throw new ApiError(
      `The course-creator grant for "${username}" was not saved (HTTP ${saved.status()})` +
        (errors ? `: ${errors}` : '.'),
      { status: saved.status(), url: changeUrl, body: body.slice(0, 500) },
    );
  }
}
