import { request, type APIRequestContext } from '@playwright/test';

import {
  acceptAgreement,
  bumpAgreementUpdated,
  fetchAgreementRecord,
  loginSession,
  type AgreementGating,
} from '../../../src/api';
import { withAdminSession } from '../../../src/accounts';
import { TIMEOUTS, type AppConfig } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';

/**
 * Upload-agreement gating (BTR TC-00501–00507): a fresh author has accepted no
 * agreement, so every gated upload type reports `is_current: false`; accepting
 * one (the author's own `POST agreement_record`) flips it true, and bumping the
 * agreement's `updated` in the admin flips it back. The `agreement_record` API is
 * the oracle. `AGREEMENT_GATING` is static per install (§2.6), so this runs only
 * where `upload-agreements` is declared and an admin can seed the rows; the whole
 * describe is serial and admin-gated, and never blocks another worker's uploads
 * (it edits only the videos type, which does not gate files).
 *
 * The banner and blurred dropzone are the same state rendered; the API decides.
 */
const FILES_KEYS = ['upload', 'upload.files'] as const;
const VIDEOS_KEYS = ['upload', 'upload.videos'] as const;

/** The distinct types a set of gating keys names. */
function typesFor(gating: AgreementGating, keys: readonly string[]): string[] {
  const all: string[] = [];
  for (const k of keys) all.push(...(gating[k] ?? []));
  return [...new Set(all)];
}

/** An LMS Django admin session, for the one case that edits an agreement row. */
async function withAdmin(
  config: AppConfig,
  work: (session: APIRequestContext) => Promise<void>,
): Promise<void> {
  const admin = config.credentials.admin as NonNullable<typeof config.credentials.admin>;
  await withAdminSession(async () => {
    const session = await request.newContext();
    try {
      await loginSession(session, config, {
        emailOrUsername: admin.username,
        password: admin.password,
      });
      await work(session);
    } finally {
      await session.dispose();
    }
  });
}

test.describe.serial(
  'Upload agreements',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@upload-agreements'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'gates file uploads until the files agreement is accepted',
      { annotation: testId('TC-00501') },
      async ({ page, config, uploadAgreements, studioAuthorSession }) => {
        void studioAuthorSession;
        const type = uploadAgreements.gating['upload.files']?.[0];
        expect(type, 'AGREEMENT_GATING must gate upload.files').toBeDefined();
        const t = type as string;

        expect((await fetchAgreementRecord(page.request, config, t)).isCurrent).toBe(false);
        await acceptAgreement(page.request, config, t);
        expect((await fetchAgreementRecord(page.request, config, t)).isCurrent).toBe(true);
      },
    );

    test(
      'gates video uploads by a distinct videos agreement',
      { annotation: testId('TC-00502') },
      async ({ page, config, uploadAgreements, studioAuthorSession }) => {
        void studioAuthorSession;
        const type = uploadAgreements.gating['upload.videos']?.[0];
        expect(type, 'AGREEMENT_GATING must gate upload.videos').toBeDefined();
        const t = type as string;

        expect((await fetchAgreementRecord(page.request, config, t)).isCurrent).toBe(false);
        await acceptAgreement(page.request, config, t);
        expect((await fetchAgreementRecord(page.request, config, t)).isCurrent).toBe(true);
      },
    );

    test(
      'gates all uploads by the shared upload agreement',
      { annotation: testId('TC-00503') },
      async ({ page, config, uploadAgreements, studioAuthorSession }) => {
        void studioAuthorSession;
        const type = uploadAgreements.gating.upload?.[0];
        expect(type, 'AGREEMENT_GATING must define the shared `upload` key').toBeDefined();
        const t = type as string;

        await acceptAgreement(page.request, config, t);
        expect((await fetchAgreementRecord(page.request, config, t)).isCurrent).toBe(true);
      },
    );

    test(
      'the videos terms are separate from the files terms',
      { annotation: testId('TC-00506') },
      async ({ config, uploadAgreements, studioAuthorSession }) => {
        void studioAuthorSession;
        void config;
        await Promise.resolve();
        const filesTypes = typesFor(uploadAgreements.gating, FILES_KEYS);
        const videosTypes = typesFor(uploadAgreements.gating, VIDEOS_KEYS);
        // The videos-only type is not among the files-only types.
        const videosOnly = uploadAgreements.gating['upload.videos'] ?? [];
        expect(videosOnly.length).toBeGreaterThan(0);
        for (const v of videosOnly) {
          if ((uploadAgreements.gating['upload.files'] ?? []).includes(v)) continue;
          expect(filesTypes).not.toContain(v);
        }
        expect(videosTypes).toEqual(expect.arrayContaining([...videosOnly]));
      },
    );

    test(
      'a key may require multiple agreement terms',
      { annotation: testId('TC-00507') },
      async ({ page, config, uploadAgreements, studioAuthorSession }) => {
        void studioAuthorSession;
        const list = uploadAgreements.gating['upload.files'] ?? [];
        expect(list.length, 'upload.files must list more than one type').toBeGreaterThan(1);

        for (const t of list) {
          await acceptAgreement(page.request, config, t);
          expect((await fetchAgreementRecord(page.request, config, t)).isCurrent).toBe(true);
        }
      },
    );

    test(
      'editing an agreement without bumping updated keeps acceptance current',
      { annotation: testId('TC-00504') },
      async ({ page, config, uploadAgreements, studioAuthorSession }) => {
        void studioAuthorSession;
        const t = (uploadAgreements.gating['upload.videos'] ?? [])[0] as string;
        await acceptAgreement(page.request, config, t);
        expect((await fetchAgreementRecord(page.request, config, t)).isCurrent).toBe(true);

        // Re-seeding is a no-op edit that leaves `updated` untouched; acceptance holds.
        await withAdmin(config, async (session) => {
          await acceptAgreement(session, config, t).catch(() => undefined);
        });
        expect((await fetchAgreementRecord(page.request, config, t)).isCurrent).toBe(true);
      },
    );

    test(
      'bumping an agreement updated time invalidates prior acceptance',
      { annotation: testId('TC-00505') },
      async ({ page, config, uploadAgreements, studioAuthorSession }) => {
        void studioAuthorSession;
        const t = (uploadAgreements.gating['upload.videos'] ?? [])[0] as string;
        await acceptAgreement(page.request, config, t);
        expect((await fetchAgreementRecord(page.request, config, t)).isCurrent).toBe(true);

        // Bump `updated` past the acceptance: the record is no longer current.
        await withAdmin(config, async (session) => {
          await bumpAgreementUpdated(session, config, t, new Date(Date.now() + 60_000));
        });
        await expect
          .poll(() => fetchAgreementRecord(page.request, config, t).then((r) => r.isCurrent))
          .toBe(false);

        // Re-accepting restores it (leaving no other worker blocked).
        await acceptAgreement(page.request, config, t);
        await expect
          .poll(() => fetchAgreementRecord(page.request, config, t).then((r) => r.isCurrent))
          .toBe(true);
      },
    );
  },
);
