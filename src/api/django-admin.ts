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
