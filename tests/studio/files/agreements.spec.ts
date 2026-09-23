import { request, type APIRequestContext } from '@playwright/test';

import {
  acceptAgreement,
  bumpAgreementUpdated,
  editAgreement,
  fetchAgreementRecord,
  listAgreements,
  setCourseTeamRole,
  loginSession,
  type AgreementGating,
} from '../../../src/api';
import { provisionLearnerSession, withAdminSession } from '../../../src/accounts';
import { STUDIO_FILES_SELECTORS, TIMEOUTS, type AppConfig } from '../../../src/config';
import { FilesPage } from '../../../src/pages/studio/files/files.page';
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
/** Every gating key that applies to the Files page: the shared one and its own. */
const FILES_KEYS = ['upload', 'upload.files'] as const;

/** The distinct types a set of gating keys names. */
function typesFor(gating: AgreementGating, keys: readonly string[]): string[] {
  const all: string[] = [];
  for (const k of keys) all.push(...(gating[k] ?? []));
  return [...new Set(all)];
}

/**
 * Runs `work` as a throwaway account holding its own API session.
 *
 * Acceptance is recorded per user and never expires, so a case whose premise is
 * "this user has accepted nothing yet" cannot use the worker author: the first
 * attempt records an acceptance that the author keeps, and every retry then
 * finds the gate already satisfied. A fresh user restores the premise on each
 * attempt, and leaves no acceptance another case depends on.
 */
async function withFreshUser(
  config: AppConfig,
  work: (session: APIRequestContext) => Promise<void>,
): Promise<void> {
  const session = await request.newContext();
  try {
    await provisionLearnerSession(session, config);
    await work(session);
  } finally {
    await session.dispose();
  }
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
      async ({ config, uploadAgreements }) => {
        const type = uploadAgreements.gating['upload.files']?.[0];
        expect(type, 'AGREEMENT_GATING must gate upload.files').toBeDefined();
        const t = type as string;

        await withFreshUser(config, async (session) => {
          expect((await fetchAgreementRecord(session, config, t)).isCurrent).toBe(false);
          await acceptAgreement(session, config, t);
          expect((await fetchAgreementRecord(session, config, t)).isCurrent).toBe(true);
        });
      },
    );

    test(
      'shows the Files page as gated until the agreements are accepted',
      { annotation: testId('TC-00501') },
      async ({
        page,
        config,
        authoringCourse,
        uploadAgreements,
        resyncStudioAuthor,
        studioColleague,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        // Every type the Files page is gated by, for an account that has
        // accepted none of them.
        const types = typesFor(uploadAgreements.gating, FILES_KEYS);
        expect(types.length, 'AGREEMENT_GATING must gate the Files page').toBeGreaterThan(0);

        const member = await studioColleague();
        await resyncStudioAuthor();
        await setCourseTeamRole(
          page.request,
          config,
          authoringCourse.courseKey,
          member.identity.email,
          'staff',
        );

        // Gated: one banner per outstanding agreement, and the dropzone's file
        // input cannot be used.
        const files = new FilesPage(member.page, config);
        await files.goto(authoringCourse.courseKey);
        await expect(member.page.locator(STUDIO_FILES_SELECTORS.agreementAlert)).toHaveCount(
          types.length,
        );
        await expect(member.page.locator(STUDIO_FILES_SELECTORS.dropzoneInput)).toBeDisabled();

        // Accepted: the banners go and the upload control opens.
        for (const t of types) await acceptAgreement(member.request, config, t);
        await files.goto(authoringCourse.courseKey);
        await expect(member.page.locator(STUDIO_FILES_SELECTORS.agreementAlert)).toHaveCount(0);
        await expect(member.page.locator(STUDIO_FILES_SELECTORS.dropzoneInput)).toBeEnabled();
      },
    );

    test(
      'gates video uploads by a distinct videos agreement',
      { annotation: testId('TC-00502') },
      async ({ config, uploadAgreements }) => {
        const type = uploadAgreements.gating['upload.videos']?.[0];
        expect(type, 'AGREEMENT_GATING must gate upload.videos').toBeDefined();
        const t = type as string;

        await withFreshUser(config, async (session) => {
          expect((await fetchAgreementRecord(session, config, t)).isCurrent).toBe(false);
          await acceptAgreement(session, config, t);
          expect((await fetchAgreementRecord(session, config, t)).isCurrent).toBe(true);
        });
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
        // The two surfaces must be gated by **different** types for the case to
        // mean anything; that much is configuration, so it is a precondition
        // rather than the assertion.
        // Each surface's **own** types: what gates it and neither the other
        // surface nor the shared `upload` key, which by definition gates both.
        const shared = uploadAgreements.gating.upload ?? [];
        const onlyFor = (mine: readonly string[], theirs: readonly string[]): string[] =>
          mine.filter((t) => !theirs.includes(t) && !shared.includes(t));
        const filesOnly = onlyFor(
          uploadAgreements.gating['upload.files'] ?? [],
          uploadAgreements.gating['upload.videos'] ?? [],
        );
        const videosOnly = onlyFor(
          uploadAgreements.gating['upload.videos'] ?? [],
          uploadAgreements.gating['upload.files'] ?? [],
        );
        expect(
          filesOnly.length,
          'AGREEMENT_GATING must gate files by a type videos does not use',
        ).toBeGreaterThan(0);
        expect(
          videosOnly.length,
          'AGREEMENT_GATING must gate videos by a type files does not use',
        ).toBeGreaterThan(0);

        // The assertion is the platform's: accepting the files terms says
        // nothing about the videos terms, and the account is still outstanding
        // for the surface it has not agreed to.
        const files = filesOnly[0] as string;
        const videos = videosOnly[0] as string;
        await withFreshUser(config, async (session) => {
          await acceptAgreement(session, config, files);
          expect((await fetchAgreementRecord(session, config, files)).isCurrent).toBe(true);
          expect((await fetchAgreementRecord(session, config, videos)).isCurrent).toBe(false);

          // …and the reverse, on the same account: accepting videos leaves the
          // files acceptance alone.
          await acceptAgreement(session, config, videos);
          expect((await fetchAgreementRecord(session, config, videos)).isCurrent).toBe(true);
          expect((await fetchAgreementRecord(session, config, files)).isCurrent).toBe(true);
        });
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

        // A real edit of the agreement row that leaves `updated` where it was: the
        // summary changes, the stamp does not. `is_current` compares an
        // acceptance against `updated` alone, so the acceptance has to hold.
        const summary = `E2E edited ${test.info().testId.slice(-6)}`;
        await withAdmin(config, async (session) => {
          await editAgreement(session, config, t, { summary });
        });
        expect(
          (await listAgreements(page.request, config)).find((a) => a.type === t)?.summary,
        ).toBe(summary);
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
        //
        // Strictly after the acceptance, and never into the future. The admin
        // stores `updated` **to the second**, so "now" is not enough on its own:
        // an acceptance recorded in the same second reads as "at or after" and
        // stays current, which is what made this case flaky. The stamp is taken
        // from the acceptance the platform recorded, one second on — and clamped
        // to now, because a future `updated` could not be satisfied by any
        // acceptance until that time arrived, leaving the type outstanding for
        // every other worker sharing it.
        const acceptedAt = (await fetchAgreementRecord(page.request, config, t)).acceptedAt;
        const justAfter = new Date(new Date(acceptedAt ?? Date.now()).getTime() + 1000);
        await expect
          .poll(() => Date.now() >= justAfter.getTime(), { timeout: TIMEOUTS.action })
          .toBe(true);
        await withAdmin(config, async (session) => {
          await bumpAgreementUpdated(session, config, t, justAfter);
        });
        await expect
          .poll(() => fetchAgreementRecord(page.request, config, t).then((r) => r.isCurrent))
          .toBe(false);

        // Re-accepting restores it (leaving no other worker blocked). Accepting
        // inside the poll because `updated` is stored to the second: an
        // acceptance in the same second as the bump does not count as later, and
        // the next one a second on does.
        await expect
          .poll(
            async () => {
              await acceptAgreement(page.request, config, t);
              return (await fetchAgreementRecord(page.request, config, t)).isCurrent;
            },
            { intervals: [1000, 1000, 1000, 2000, 2000] },
          )
          .toBe(true);
      },
    );
  },
);
