import type { APIRequestContext } from '@playwright/test';

import { ApiError } from './errors';

/**
 * Driving the platform's **Django admin** over HTTP.
 *
 * Some platform state has no REST API at all — agreement definitions, waffle
 * flag overrides, course access roles — and the only portable way to set it is
 * the admin's own forms. These helpers are the shared mechanics of that: read a
 * form for its CSRF token and current values, post it back, and turn a rejected
 * save into an `ApiError` carrying the admin's own validation messages.
 *
 * Two rules the platform imposes on every caller:
 *
 * - **An LMS Django *session* is required.** The admin refuses the captured
 *   staff API state (JWT), so callers run on a context signed in with
 *   `loginSession`, under the cross-worker admin lock.
 * - **A save redirects.** Posting with `maxRedirects: 0`, a 3xx means saved and
 *   a 200 means the form came back re-rendered with an `errorlist` — the
 *   difference between "done" and "silently rejected".
 *
 * Stock admin markup is stable across releases and carries no localized copy of
 * ours, so parsing it is allowed here (the same exemption
 * `src/config/selectors/django-admin.ts` documents for its selectors).
 */

/** The CSRF token a rendered admin form carries, if it rendered at all. */
export const adminCsrfToken = (html: string): string | undefined =>
  /name="csrfmiddlewaretoken" value="([^"]+)"/.exec(html)?.[1];

/** The handful of entities Django's HTML escaping produces, back to their characters. */
export const decodeAdminEntities = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/&amp;/g, '&');

/**
 * The value a rendered admin form carries for the field `name`.
 *
 * The admin renders short fields as `<input value="…">` but long ones as
 * `<textarea>…</textarea>`. Reading only inputs returns an empty string for the
 * latter, and posting that back blanks the field: the admin then answers **200**
 * with the form re-rendered and its `errorlist`, rather than the 302 a save
 * gives.
 */
/**
 * Fails unless `html` really is a Django admin page.
 *
 * A Django session that has been evicted — `PREVENT_CONCURRENT_LOGINS` ends it
 * whenever the same account signs in elsewhere — does not produce an error:
 * `/admin/…` answers **302 to the admin login**, which the request context
 * follows to the LMS landing page and reports as `200`. A reader that only
 * checks the status then counts zero rows and reports "nothing there", which is
 * indistinguishable from a real empty list and silently passes tests that should
 * have failed or healed.
 *
 * The message deliberately contains "did not render", which is what
 * `withAdminLmsSession` retries on: a guarded reader signs in again and repeats
 * the work instead of lying.
 */
export function assertAdminPage(html: string, status: number, url: string, what: string): void {
  if (status < 400 && html.includes('id="content"') && html.includes('/admin/')) return;
  throw new ApiError(
    `${what}: the admin page did not render (HTTP ${status}). The context must hold an LMS ` +
      'Django session for a superuser, and that session must still be live.',
    { status, url, body: html.slice(0, 300) },
  );
}

/**
 * The number of data rows in an admin change list — its `#result_list` minus the
 * header row. A change list with no matches renders no result table at all.
 */
export function countAdminResultRows(html: string): number {
  const table = /id="result_list"[\s\S]*?<\/table>/.exec(html)?.[0];
  if (table === undefined) return 0;
  return Math.max(0, (table.match(/<tr\b/g) ?? []).length - 1);
}

export function adminFormValue(html: string, name: string): string {
  const input = new RegExp(`<input[^>]*\\bname="${name}"[^>]*>`, 'i').exec(html)?.[0];
  if (input !== undefined) return decodeAdminEntities(/\bvalue="([^"]*)"/.exec(input)?.[1] ?? '');
  const textarea = new RegExp(
    `<textarea[^>]*\\bname="${name}"[^>]*>([\\s\\S]*?)</textarea>`,
    'i',
  ).exec(html)?.[1];
  return decodeAdminEntities(textarea ?? '');
}

/** The admin's own validation messages, when a POST came back as a re-rendered form. */
/**
 * Every field of a rendered admin form, as a form body ready to post back.
 *
 * Django's admin saves the **whole** form, inline formsets and all, so editing
 * one value means returning everything else unchanged — a change form posted
 * without its inline management fields is rejected outright. This reads the
 * page: text-like inputs, checked checkboxes and radios, selected options
 * (including multi-selects, joined the way a form body repeats them) and
 * textareas. The CSRF token and the submit button are left to
 * {@link postAdminForm}.
 */
export function readAdminForm(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const add = (name: string, value: string): void => {
    fields[name] = name in fields ? `${fields[name]}\n${value}` : value;
  };

  for (const input of html.matchAll(/<input\b[^>]*>/g)) {
    const tag = input[0];
    const name = /name="([^"]+)"/.exec(tag)?.[1];
    if (name === undefined || name === 'csrfmiddlewaretoken') continue;
    const type = (/type="([^"]+)"/.exec(tag)?.[1] ?? 'text').toLowerCase();
    if (type === 'submit' || type === 'file' || type === 'button') continue;
    const value = decodeAdminEntities(/value="([^"]*)"/.exec(tag)?.[1] ?? '');
    if (type === 'checkbox' || type === 'radio') {
      if (/\bchecked\b/.test(tag)) add(name, value === '' ? 'on' : value);
      continue;
    }
    add(name, value);
  }

  for (const select of html.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const [, name = '', body = ''] = select;
    for (const option of body.matchAll(/<option\b([^>]*)>/g)) {
      const attributes = option[1] ?? '';
      if (!/\bselected\b/.test(attributes)) continue;
      add(name, decodeAdminEntities(/value="([^"]*)"/.exec(attributes)?.[1] ?? ''));
    }
  }

  for (const area of html.matchAll(/<textarea\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) {
    add(area[1] ?? '', decodeAdminEntities(area[2] ?? ''));
  }

  return fields;
}

export function adminFormErrors(html: string): string {
  const lists = [...html.matchAll(/<ul[^>]*class="[^"]*errorlist[^"]*"[^>]*>([\s\S]*?)<\/ul>/g)];
  const items = lists
    .flatMap((list) => [...(list[1] ?? '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)])
    .map((item) =>
      decodeAdminEntities(item[1] ?? '')
        .replace(/<[^>]*>/g, '')
        .trim(),
    )
    .filter((text) => text.length > 0);
  return [...new Set(items)].slice(0, 5).join('; ');
}

/** Whether a `maxRedirects: 0` admin POST saved: the admin redirects on success. */
export const adminSaveSucceeded = (status: number): boolean => status >= 300 && status < 400;

/** A date + time pair Django's split `DateTimeField` widget expects (`<field>_0/_1`). */
export function splitAdminDateTime(when: Date): { date: string; time: string } {
  const iso = when.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

/**
 * Opens an admin form and hands back its HTML and CSRF token.
 *
 * Throws when the page is not a form the session may use — which is how a
 * missing admin session, a missing permission (the admin answers 403 for a
 * model whose `has_delete_permission` is false) or a moved URL surfaces, rather
 * than as a confusing failure at the POST.
 */
export async function openAdminForm(
  adminSession: APIRequestContext,
  url: string,
  what: string,
): Promise<{ html: string; token: string }> {
  const response = await adminSession.get(url);
  const html = await response.text();
  const token = adminCsrfToken(html);
  if (!response.ok() || token === undefined) {
    throw new ApiError(
      `${what}: the admin form did not render (HTTP ${response.status()}). The context must ` +
        'hold an LMS Django session for a superuser, and the model must allow this action.',
      { status: response.status(), url, body: html.slice(0, 300) },
    );
  }
  return { html, token };
}

/**
 * Posts an admin form and asserts it saved.
 *
 * `fields` is the whole form the admin expects — a Django admin save posts every
 * field, so a caller editing one value reads the rest back with
 * {@link adminFormValue} first. The CSRF token and `_save` are added here.
 */
export async function postAdminForm(
  adminSession: APIRequestContext,
  url: string,
  token: string,
  fields: Readonly<Record<string, string>>,
  what: string,
): Promise<void> {
  const response = await adminSession.post(url, {
    form: { csrfmiddlewaretoken: token, ...fields, _save: 'Save' },
    headers: { Referer: url },
    maxRedirects: 0,
  });
  if (adminSaveSucceeded(response.status())) return;
  const body = await response.text();
  const errors = adminFormErrors(body);
  throw new ApiError(
    `${what} failed (HTTP ${response.status()})` +
      (errors === '' ? '.' : `: the admin rejected the form: ${errors}`),
    { status: response.status(), url, body: body.slice(0, 500) },
  );
}

/**
 * The primary key of the first change-list row matching `query`, or undefined.
 *
 * `adminPath` is the model's admin base (e.g. `/admin/agreements/useragreement`);
 * the change list is searched with the admin's own `?q=` search box, so the model
 * must declare `search_fields` covering what is passed.
 */
export async function findAdminRowPk(
  adminSession: APIRequestContext,
  adminPath: string,
  origin: string,
  query: string,
): Promise<string | undefined> {
  const url = `${origin}${adminPath}/?q=${encodeURIComponent(query)}`;
  const html = await (await adminSession.get(url)).text();
  return new RegExp(`${adminPath}/(\\d+)/change/`).exec(html)?.[1];
}
