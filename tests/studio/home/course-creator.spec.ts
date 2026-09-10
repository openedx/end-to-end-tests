import { checkA11y } from '../../../src/a11y';
import {
  courseExists,
  fetchCourseCreatorStatus,
  fetchCourseDetail,
  newCourseIdentity,
} from '../../../src/api';
import { getRunId } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { createCourseThroughStudioHome, grantCourseCreatorThroughAdmin } from '../../../src/steps';

/**
 * TC-00310: a regular account requests course-creator access on Studio Home, an
 * administrator grants it in the Studio Django admin, and the account can then
 * create a course.
 *
 * Studio's home API is the arbiter of the status transitions
 * (`unrequested → pending → granted`); the UI is asserted structurally — the
 * "New course" button is absent, then present. The newcomer's course is the
 * proof of the grant, so this spec spends one course (§2.4).
 */
test.describe(
  'Course-creator access',
  { tag: ['@studio', '@author', '@mfe-authoring', '@regression'] },
  () => {
    test(
      'a regular user requests access, an admin grants it, and the user can create a course',
      { annotation: testId('TC-00310') },
      async ({
        page,
        config,
        studioHomePage,
        studioCourseOutlinePage,
        studioNewcomer,
        courseCreatorAdminPage,
      }) => {
        const { identity, request } = studioNewcomer;
        expect(await fetchCourseCreatorStatus(request, config)).toBe('unrequested');

        // As the regular user: no "New course" button, only the request panel.
        await studioHomePage.goto();
        await expect(studioHomePage.newCourseButton).toHaveCount(0);
        await expect(studioHomePage.creatorStatusPanel).toBeVisible();
        await checkA11y(page, { label: 'studio-home-newcomer' });

        await studioHomePage.expandCreatorStatusPanel();
        const requested = await studioHomePage.requestCreatorAccess();
        expect(requested.status).toBe(200);
        await expect.poll(() => fetchCourseCreatorStatus(request, config)).toBe('pending');
        // Still no button while pending; the panel now reports the request.
        await studioHomePage.goto();
        await expect(studioHomePage.newCourseButton).toHaveCount(0);
        await expect(studioHomePage.creatorStatusPanel).toBeVisible();

        // As the administrator: the request created a row; grant it.
        await courseCreatorAdminPage.gotoRowsFor(identity.username);
        await expect(courseCreatorAdminPage.rowFor(identity.username)).toHaveCount(1);
        await grantCourseCreatorThroughAdmin(courseCreatorAdminPage, identity.username);
        await expect(courseCreatorAdminPage.rowFor(identity.username)).toHaveCount(1);
        await expect.poll(() => fetchCourseCreatorStatus(request, config)).toBe('granted');

        // As the user again, no re-login: the button is there and works.
        await studioHomePage.goto();
        await expect(studioHomePage.newCourseButton).toBeVisible();

        const home = await fetchCourseCreatorStatus(request, config);
        expect(home).toBe('granted');
        const org = config.org ?? 'E2E';
        const grantee = newCourseIdentity(
          { ...config, org },
          getRunId(),
          `G${identity.username.slice(-6)}`,
          'grantee',
        );
        expect(await courseExists(request, config, grantee.courseKey)).toBe(false);
        const created = await createCourseThroughStudioHome(
          studioHomePage,
          studioCourseOutlinePage,
          grantee,
        );
        expect(created.courseKey).toBe(grantee.courseKey);
        await expect(studioCourseOutlinePage.emptyPlaceholder).toBeVisible();
        expect((await fetchCourseDetail(request, config, grantee.courseKey)).number).toBe(
          grantee.number,
        );
      },
    );
  },
);
