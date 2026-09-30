import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { ApiError } from './errors';
import { listAgreements } from './agreements';

/**
 * Seeding and editing `UserAgreement` rows (the agreement *definitions*) through
 * the LMS Django admin — the only way to create them or bump their `updated`
 * time; there is no REST API. Runs on an **LMS Django session** for the admin (a
 * context signed in with `loginSession`), not the captured staff API state, which
 * the admin refuses. Mirrors the certificate-generation admin helper.
 *
 * Rows are global and idempotent by `type`; nothing deletes them (a target keeps
 * its agreements, like a `CertificateGenerationConfiguration`).
 */
const ADMIN_BASE = '/admin/agreements/useragreement';

const csrfOf = (html: string): string | undefined =>
  /name="csrfmiddlewaretoken" value="([^"]+)"/.exec(html)?.[1];

/** The handful of entities Django's HTML escaping produces, back to their characters. */
const decodeEntities = (value: string): string =>
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
 * gives. That is what made the `updated` bump look like a failing save.
 */
function formValue(html: string, name: string): string {
  const input = new RegExp(`<input[^>]*\\bname="${name}"[^>]*>`, 'i').exec(html)?.[0];
  if (input !== undefined) return decodeEntities(/\bvalue="([^"]*)"/.exec(input)?.[1] ?? '');
  const textarea = new RegExp(
    `<textarea[^>]*\\bname="${name}"[^>]*>([\\s\\S]*?)</textarea>`,
    'i',
  ).exec(html)?.[1];
  return decodeEntities(textarea ?? '');
}

/** The admin's own validation messages, when a POST came back as a re-rendered form. */
function formErrors(html: string): string {
  const lists = [...html.matchAll(/<ul[^>]*class="[^"]*errorlist[^"]*"[^>]*>([\s\S]*?)<\/ul>/g)];
  const items = lists
    .flatMap((list) => [...(list[1] ?? '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)])
    .map((item) =>
      decodeEntities(item[1] ?? '')
        .replace(/<[^>]*>/g, '')
        .trim(),
    )
    .filter((text) => text.length > 0);
  return [...new Set(items)].slice(0, 5).join('; ');
}

/** Whether a `maxRedirects: 0` admin POST saved: the admin redirects on success. */
const savedOk = (status: number): boolean => status >= 300 && status < 400;

/** A date + time pair Django's split DateTimeField widget expects (`updated_0/1`). */
function splitDateTime(when: Date): { date: string; time: string } {
  const iso = when.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

/** Creates a `UserAgreement` of `type` if none exists (idempotent). */
export async function ensureAgreement(
  adminSession: APIRequestContext,
  config: AppConfig,
  agreement: {
    readonly type: string;
    readonly name: string;
    readonly summary: string;
    readonly url: string;
  },
): Promise<void> {
  const existing = (await listAgreements(adminSession, config)).some(
    (a) => a.type === agreement.type,
  );
  if (existing) return;

  const url = `${config.baseUrls.lms}${ADMIN_BASE}/add/`;
  const form = await adminSession.get(url);
  const token = csrfOf(await form.text());
  if (!form.ok() || token === undefined) {
    throw new ApiError(
      `The agreements admin add form did not render (HTTP ${form.status()}): the session is ` +
        'not an LMS Django session for a superuser.',
      { status: form.status(), url, body: '' },
    );
  }
  const now = splitDateTime(new Date());
  const saved = await adminSession.post(url, {
    form: {
      csrfmiddlewaretoken: token,
      type: agreement.type,
      name: agreement.name,
      summary: agreement.summary,
      text: '',
      url: agreement.url,
      updated_0: now.date,
      updated_1: now.time,
      _save: 'Save',
    },
    headers: { Referer: url },
    maxRedirects: 0,
  });
  if (!savedOk(saved.status())) {
    const body = await saved.text();
    const errors = formErrors(body);
    throw new ApiError(
      `Creating agreement "${agreement.type}" failed (HTTP ${saved.status()})` +
        (errors === '' ? '.' : `: ${errors}`),
      { status: saved.status(), url, body: body.slice(0, 500) },
    );
  }
}

/**
 * The admin change-list primary key of the agreement of `type`, or undefined.
 *
 * Filtered by the **field**, not by the admin's search box: `UserAgreementAdmin`
 * declares no `search_fields`, so Django drops `?q=` and renders the whole change
 * list (measured — `?q=` for a type that does not exist still returns every row).
 * A search that is silently ignored would hand back whichever row sorts first,
 * which on an installation with an operator's own agreements is not ours.
 * `?type=` is a plain local-field lookup, which `lookup_allowed` permits without
 * `list_filter`, and `type` is unique.
 */
async function agreementPk(
  adminSession: APIRequestContext,
  config: AppConfig,
  type: string,
): Promise<string | undefined> {
  const url = `${config.baseUrls.lms}${ADMIN_BASE}/?type=${encodeURIComponent(type)}`;
  const html = await (await adminSession.get(url)).text();
  return new RegExp(`/agreements/useragreement/(\\d+)/change/`).exec(html)?.[1];
}

/**
 * Edits an agreement through the admin — the write behind TC-00504/00505.
 *
 * `when` moves the `updated` stamp; leaving it out **keeps the stamp the form
 * rendered**, which is the no-op edit TC-00504 needs: the row is really saved
 * (its summary changes), and an acceptance stays current because `is_current`
 * compares against `updated` alone.
 */
export async function editAgreement(
  adminSession: APIRequestContext,
  config: AppConfig,
  type: string,
  changes: { readonly when?: Date; readonly summary?: string } = {},
): Promise<void> {
  const when = changes.when;
  const pk = await agreementPk(adminSession, config, type);
  if (pk === undefined)
    throw new ApiError(`No agreement "${type}" to update.`, { status: 0, url: type, body: '' });
  const url = `${config.baseUrls.lms}${ADMIN_BASE}/${pk}/change/`;
  const form = await adminSession.get(url);
  const html = await form.text();
  const token = csrfOf(html);
  if (!form.ok() || token === undefined) {
    throw new ApiError(`The agreement change form did not render (HTTP ${form.status()}).`, {
      status: form.status(),
      url,
      body: '',
    });
  }
  // A Django admin save posts the whole form, so every field the change form
  // renders is read back and returned unchanged; only `updated` moves. Fields the
  // admin renders as a textarea (`summary`, `text`) have to be read as such — an
  // input-only read blanks them, which the admin rejects.
  const stamp = when === undefined ? undefined : splitDateTime(when);
  const saved = await adminSession.post(url, {
    form: {
      csrfmiddlewaretoken: token,
      type: formValue(html, 'type') || type,
      name: formValue(html, 'name'),
      summary: changes.summary ?? formValue(html, 'summary'),
      text: formValue(html, 'text'),
      url: formValue(html, 'url'),
      updated_0: stamp?.date ?? formValue(html, 'updated_0'),
      updated_1: stamp?.time ?? formValue(html, 'updated_1'),
      _save: 'Save',
    },
    headers: { Referer: url },
    maxRedirects: 0,
  });
  if (!savedOk(saved.status())) {
    const body = await saved.text();
    const errors = formErrors(body);
    // A 200 is the change form re-rendered with its errors, not a saved row.
    throw new ApiError(
      `Editing agreement "${type}" failed (HTTP ${saved.status()})` +
        (errors === '' ? '.' : `: the admin rejected the form: ${errors}`),
      { status: saved.status(), url, body: body.slice(0, 500) },
    );
  }
}

/**
 * Moves an agreement's `updated` time to `when` (default now) — TC-00505. After
 * a bump past a record's acceptance time, that record's `is_current` flips back
 * to false.
 */
export async function bumpAgreementUpdated(
  adminSession: APIRequestContext,
  config: AppConfig,
  type: string,
  when: Date = new Date(),
): Promise<void> {
  await editAgreement(adminSession, config, type, { when });
}
