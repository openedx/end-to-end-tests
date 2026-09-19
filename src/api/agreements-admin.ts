import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { adminFormValue, openAdminForm, postAdminForm, splitAdminDateTime } from './django-admin';
import { ApiError } from './errors';
import { listAgreements } from './agreements';

/**
 * Seeding and editing `UserAgreement` rows (the agreement *definitions*) through
 * the LMS Django admin — the only way to create them or bump their `updated`
 * time; there is no REST API. Runs on an **LMS Django session** for the admin (a
 * context signed in with `loginSession`), not the captured staff API state, which
 * the admin refuses. The form mechanics live in `./django-admin.ts`.
 *
 * Rows are global and idempotent by `type`; nothing deletes them (a target keeps
 * its agreements, like a `CertificateGenerationConfiguration`).
 */
const ADMIN_BASE = '/admin/agreements/useragreement';

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
  const what = `Creating agreement "${agreement.type}"`;
  const { token } = await openAdminForm(adminSession, url, what);
  const now = splitAdminDateTime(new Date());
  await postAdminForm(
    adminSession,
    url,
    token,
    {
      type: agreement.type,
      name: agreement.name,
      summary: agreement.summary,
      text: '',
      url: agreement.url,
      updated_0: now.date,
      updated_1: now.time,
    },
    what,
  );
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
 * `list_filter`, and `type` is unique. This is why `findAdminRowPk` is not used.
 */
async function agreementPk(
  adminSession: APIRequestContext,
  config: AppConfig,
  type: string,
): Promise<string | undefined> {
  const url = `${config.baseUrls.lms}${ADMIN_BASE}/?type=${encodeURIComponent(type)}`;
  const html = await (await adminSession.get(url)).text();
  return new RegExp(`${ADMIN_BASE}/(\\d+)/change/`).exec(html)?.[1];
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
  const pk = await agreementPk(adminSession, config, type);
  if (pk === undefined)
    throw new ApiError(`No agreement "${type}" to update.`, { status: 0, url: type, body: '' });
  const url = `${config.baseUrls.lms}${ADMIN_BASE}/${pk}/change/`;
  const what = `Editing agreement "${type}"`;
  const { html, token } = await openAdminForm(adminSession, url, what);
  // A Django admin save posts the whole form, so every field the change form
  // renders is read back and returned unchanged; only `updated` moves. Fields the
  // admin renders as a textarea (`summary`, `text`) have to be read as such — an
  // input-only read blanks them, which the admin rejects.
  const stamp = changes.when === undefined ? undefined : splitAdminDateTime(changes.when);
  await postAdminForm(
    adminSession,
    url,
    token,
    {
      type: adminFormValue(html, 'type') || type,
      name: adminFormValue(html, 'name'),
      summary: changes.summary ?? adminFormValue(html, 'summary'),
      text: adminFormValue(html, 'text'),
      url: adminFormValue(html, 'url'),
      updated_0: stamp?.date ?? adminFormValue(html, 'updated_0'),
      updated_1: stamp?.time ?? adminFormValue(html, 'updated_1'),
    },
    what,
  );
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
