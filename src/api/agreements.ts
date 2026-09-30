import type { APIRequestContext } from '@playwright/test';

import type { AppConfig } from '../config';
import { CSRF_HEADER, fetchCsrfToken } from './csrf';
import { ApiError } from './errors';

/**
 * The LMS user-agreement API (`/api/agreements/v1/`) behind the authoring MFE's
 * file/video upload gating. A `UserAgreement` row (type, name, summary, url,
 * updated) is created by an admin in Django admin; the MFE shows a banner for
 * each configured type until the user's acceptance record is current, and blurs
 * the upload control. Measured on Tutor `main` (2026-09-16, Epic 11 plan §1.3);
 * `release/verawood` has the same views.
 *
 * These views authenticate the request (`is_authenticated`), so they ride the
 * caller's JWT; the acceptance POST also sends the LMS CSRF token.
 */
export const AGREEMENTS_BASE = '/api/agreements/v1';

/** One user's acceptance record for an agreement type. */
export interface AgreementRecord {
  readonly agreementType: string;
  /** When the user accepted, or null if never. */
  readonly acceptedAt: string | null;
  /** Whether the acceptance is current (accepted at or after the agreement's `updated`). */
  readonly isCurrent: boolean;
}

interface RawAgreementRecord {
  readonly agreement_type: string;
  readonly accepted_at: string | null;
  readonly is_current: boolean;
}

function toRecord(raw: RawAgreementRecord): AgreementRecord {
  return {
    agreementType: raw.agreement_type,
    acceptedAt: raw.accepted_at,
    isCurrent: raw.is_current,
  };
}

/**
 * Reads the caller's acceptance record for an agreement type — the oracle for
 * "the banner shows / is gone". Answers `200` with `is_current: false` even for
 * a type that has no agreement row or was never accepted.
 */
export async function fetchAgreementRecord(
  request: APIRequestContext,
  config: AppConfig,
  agreementType: string,
): Promise<AgreementRecord> {
  const url = `${config.baseUrls.lms}${AGREEMENTS_BASE}/agreement_record/${agreementType}`;
  const response = await request.get(url);
  if (!response.ok()) {
    throw new ApiError(
      `Reading the agreement record for "${agreementType}" failed (HTTP ${response.status()}).`,
      {
        status: response.status(),
        url,
        body: await response.text(),
      },
    );
  }
  return toRecord((await response.json()) as RawAgreementRecord);
}

/**
 * Records the caller's acceptance of an agreement type — what the banner's Agree
 * button does. Idempotent enough for a test: a fresh record is stamped with the
 * current time, making {@link fetchAgreementRecord} `is_current` true.
 */
export async function acceptAgreement(
  request: APIRequestContext,
  config: AppConfig,
  agreementType: string,
): Promise<AgreementRecord> {
  const url = `${config.baseUrls.lms}${AGREEMENTS_BASE}/agreement_record/${agreementType}`;
  const token = await fetchCsrfToken(request, config);
  const response = await request.post(url, {
    headers: { [CSRF_HEADER]: token, Referer: config.baseUrls.lms },
  });
  if (!response.ok()) {
    throw new ApiError(
      `Accepting the agreement "${agreementType}" failed (HTTP ${response.status()}).`,
      {
        status: response.status(),
        url,
        body: await response.text(),
      },
    );
  }
  return toRecord((await response.json()) as RawAgreementRecord);
}

/** One configured agreement, as `GET agreement/` lists it. */
export interface UserAgreement {
  readonly type: string;
  readonly name: string;
  readonly summary: string;
  readonly url: string | null;
  readonly updated: string;
}

/** Lists the agreements configured on the target (their types, names and update times). */
export async function listAgreements(
  request: APIRequestContext,
  config: AppConfig,
): Promise<readonly UserAgreement[]> {
  const url = `${config.baseUrls.lms}${AGREEMENTS_BASE}/agreement/`;
  const response = await request.get(url);
  if (!response.ok()) {
    throw new ApiError(`Listing agreements failed (HTTP ${response.status()}).`, {
      status: response.status(),
      url,
      body: await response.text(),
    });
  }
  const raw = (await response.json()) as readonly {
    readonly type: string;
    readonly name: string;
    readonly summary: string;
    readonly url: string | null;
    readonly updated: string;
  }[];
  return raw.map((a) => ({
    type: a.type,
    name: a.name,
    summary: a.summary,
    url: a.url,
    updated: a.updated,
  }));
}
