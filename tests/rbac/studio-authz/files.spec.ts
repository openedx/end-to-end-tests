import { expect, test } from '../../../src/fixtures';
import {
  canI,
  deleteAsset,
  fetchAllAssets,
  setAssetLock,
  studioOrigin,
  uploadAsset,
  STUDIO_JSON_ACCEPT,
} from '../../../src/api';
import { TIMEOUTS } from '../../../src/config';
import { seedScopeAssignments } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { STUDIO_AUTHZ_TAGS } from './helpers';

/** A one-pixel PNG, so an upload carries a real file without a fixture on disk. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Course files under AuthZ (`TC-00623`, `TC-00624`, `TC-00642`, `TC-00650`).
 *
 * Uploading, locking and deleting are all one question — may this role write to
 * the course's asset store? — so each is driven as the role and read back from
 * the store itself. The video surface is asserted by what the platform answers
 * the role and an outsider: uploading an actual video needs a transcoding
 * pipeline this installation does not run.
 */
test.describe('Studio under AuthZ — files', { tag: ['@regression', ...STUDIO_AUTHZ_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'uploads a file as course staff',
    { annotation: testId('TC-00623') },
    async (
      { page, config, authzTarget, studioAuthorSession, resyncStudioAuthor, rbacCast },
      testInfo,
    ) => {
      void studioAuthorSession;
      const courseKey = authzTarget.courseKey;
      const staff = await rbacCast('courseStaff');
      await seedScopeAssignments(
        page.request,
        config,
        courseKey,
        [staff.identity.username],
        ['course_staff'],
      );
      // Provisioning a colleague rotates the worker author's Studio session, and
      // the author's own uploads and reads below need it live again.
      await resyncStudioAuthor();

      const name = `e2e-authz-${testInfo.testId.slice(-6)}.png`;
      const asset = await uploadAsset(staff.request, config, courseKey, {
        name,
        mimeType: 'image/png',
        buffer: PNG,
      });
      expect(asset.display_name).toBe(name);
      // The store, read separately: the file is there and has a URL to embed.
      const stored = (await fetchAllAssets(page.request, config, courseKey)).find(
        (row) => row.display_name === name,
      );
      expect(stored?.url ?? '').toContain(name);
    },
  );

  test(
    'deletes a file as course staff',
    { annotation: testId('TC-00624') },
    async (
      { page, config, authzTarget, studioAuthorSession, resyncStudioAuthor, rbacCast },
      testInfo,
    ) => {
      void studioAuthorSession;
      const courseKey = authzTarget.courseKey;
      const staff = await rbacCast('courseStaff');
      await seedScopeAssignments(
        page.request,
        config,
        courseKey,
        [staff.identity.username],
        ['course_staff'],
      );
      // Provisioning a colleague rotates the worker author's Studio session, and
      // the author's own uploads and reads below need it live again.
      await resyncStudioAuthor();

      const name = `e2e-authz-delete-${testInfo.testId.slice(-6)}.png`;
      const asset = await uploadAsset(page.request, config, courseKey, {
        name,
        mimeType: 'image/png',
        buffer: PNG,
      });
      await deleteAsset(staff.request, config, courseKey, asset);
      expect(
        (await fetchAllAssets(page.request, config, courseKey)).map((row) => row.display_name),
      ).not.toContain(name);
    },
  );

  test(
    'locks a file as a course admin',
    { annotation: testId('TC-00650') },
    async ({ page, config, authzTarget, studioAuthorSession }, testInfo) => {
      void studioAuthorSession;
      const courseKey = authzTarget.courseKey;
      // The course's AuthZ administrator is the worker author itself: migrating
      // the course turned its legacy `instructor` row into `course_admin`. One
      // fewer account per case keeps these specs inside the platform's sign-in
      // rate limit.
      expect(await canI(page.request, config, 'courses.manage_course_team', courseKey)).toBe(true);
      const admin = { request: page.request };

      const name = `e2e-authz-lock-${testInfo.testId.slice(-6)}.png`;
      const asset = await uploadAsset(page.request, config, courseKey, {
        name,
        mimeType: 'image/png',
        buffer: PNG,
      });
      expect(asset.locked).toBe(false);

      const locked = await setAssetLock(admin.request, config, courseKey, asset, true);
      expect(locked.locked).toBe(true);
      expect(
        (await fetchAllAssets(page.request, config, courseKey)).find(
          (row) => row.display_name === name,
        )?.locked,
      ).toBe(true);
    },
  );

  test(
    'opens the video surface to a course admin and not to an outsider',
    { annotation: testId('TC-00642') },
    async ({ page, config, authzTarget, studioAuthorSession, rbacCast }) => {
      void studioAuthorSession;
      const courseKey = authzTarget.courseKey;
      // The course's AuthZ administrator is the worker author itself: migrating
      // the course turned its legacy `instructor` row into `course_admin`. One
      // fewer account per case keeps these specs inside the platform's sign-in
      // rate limit.
      expect(await canI(page.request, config, 'courses.manage_course_team', courseKey)).toBe(true);
      const admin = { request: page.request };
      const outsider = await rbacCast('outsider');
      const videos = `${studioOrigin(config)}/api/contentstore/v1/videos/${courseKey}`;

      // The role is served the page's own data — including the handler it would
      // upload through. (Uploading a video itself needs a transcoding pipeline
      // this installation does not run, so the permission is what is asserted.)
      const allowed = await admin.request.get(videos, { headers: STUDIO_JSON_ACCEPT });
      expect(allowed.status()).toBe(200);
      expect(
        ((await allowed.json()) as { video_handler_url?: string }).video_handler_url,
      ).toContain(courseKey);

      // An account with no role in the course is refused it.
      expect((await outsider.request.get(videos, { headers: STUDIO_JSON_ACCEPT })).status()).toBe(
        403,
      );
    },
  );
});
