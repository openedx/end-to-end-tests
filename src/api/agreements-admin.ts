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
  if (saved.status() < 300 || saved.status() >= 400) {
    throw new ApiError(`Creating agreement "${agreement.type}" failed (HTTP ${saved.status()}).`, {
      status: saved.status(),
      url,
      body: (await saved.text()).slice(0, 500),
    });
  }
}

/** The admin change-list primary key of the agreement of `type`, or undefined. */
async function agreementPk(
  adminSession: APIRequestContext,
  config: AppConfig,
  type: string,
): Promise<string | undefined> {
  const url = `${config.baseUrls.lms}${ADMIN_BASE}/?q=${encodeURIComponent(type)}`;
  const html = await (await adminSession.get(url)).text();
  return new RegExp(`/agreements/useragreement/(\\d+)/change/`).exec(html)?.[1];
}

/**
 * Sets an agreement's `updated` time to `when` (default now) — the admin edit
 * behind TC-00504/00505. After a bump past a record's acceptance time, that
 * record's `is_current` flips back to false.
 */
export async function bumpAgreementUpdated(
  adminSession: APIRequestContext,
  config: AppConfig,
  type: string,
  when: Date = new Date(),
): Promise<void> {
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
  const field = (name: string): string =>
    new RegExp(`name="${name}"[^>]*value="([^"]*)"`).exec(html)?.[1] ?? '';
  const stamp = splitDateTime(when);
  const saved = await adminSession.post(url, {
    form: {
      csrfmiddlewaretoken: token,
      type: field('type') || type,
      name: field('name'),
      summary: field('summary'),
      text: '',
      url: field('url'),
      updated_0: stamp.date,
      updated_1: stamp.time,
      _save: 'Save',
    },
    headers: { Referer: url },
    maxRedirects: 0,
  });
  if (saved.status() < 300 || saved.status() >= 400) {
    throw new ApiError(`Bumping agreement "${type}" failed (HTTP ${saved.status()}).`, {
      status: saved.status(),
      url,
      body: (await saved.text()).slice(0, 500),
    });
  }
}
