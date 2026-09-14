import { checkA11y } from '../../../src/a11y';
import {
  courseExists,
  createCourse,
  fetchCourseDetail,
  fetchStudioHome,
  listStudioCourses,
  newCourseIdentity,
} from '../../../src/api';
import { getRunId } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { createCourseThroughStudioHome } from '../../../src/steps';

/**
 * Creating a course from Studio Home — the epic's core claim and the suite's
 * Studio `@smoke` path. These are the only specs in the tree that create a course
 * (§2.4 course budget): the created course *is* the assertion.
 *
 * The MFE drives the creation; Studio's own list and the LMS decide whether it
 * happened. "Taken to an empty course outline page" is the URL carrying the new
 * key, the header lock-up naming it, and the outline's empty placeholder.
 */
test.describe(
  'Create a course from Studio Home',
  { tag: ['@studio', '@author', '@mfe-authoring'] },
  () => {
    test(
      'creates a course under an existing organization',
      { tag: '@smoke', annotation: testId('TC-00249') },
      async ({
        page,
        config,
        studioHomePage,
        studioCourseOutlinePage,
        lifecycleCourse,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
        const api = page.request;
        // An org the target already has: the worker course's (the fixture put it
        // there), so the form's org control offers it whichever shape it takes.
        expect(await courseExists(api, config, lifecycleCourse.courseKey)).toBe(false);

        const created = await createCourseThroughStudioHome(
          studioHomePage,
          studioCourseOutlinePage,
          lifecycleCourse,
        );

        expect(created.response.status).toBe(200);
        expect(created.courseKey).toBe(lifecycleCourse.courseKey);

        // Landed on the new course's (empty) outline.
        expect(new URL(page.url()).pathname).toContain(`/course/${lifecycleCourse.courseKey}`);
        await expect(studioCourseOutlinePage.courseLockUp).toHaveAttribute(
          'href',
          new RegExp(`/course/${lifecycleCourse.courseKey.replace(/[+:]/g, '\\$&')}$`),
        );
        await expect(studioCourseOutlinePage.emptyPlaceholder).toBeVisible();

        // Studio lists it and the LMS serves it.
        await expect
          .poll(async () => {
            const listed = await listStudioCourses(api, config, {
              search: lifecycleCourse.number,
            });
            return listed.courses.map((course) => course.courseKey);
          })
          .toContain(lifecycleCourse.courseKey);
        const detail = await fetchCourseDetail(api, config, lifecycleCourse.courseKey);
        expect(detail.org).toBe(lifecycleCourse.org);
        expect(detail.number).toBe(lifecycleCourse.number);

        // `STUDIO-003` (see `.private/findings.md`): the authoring MFE's course
        // outline ships two critical axe violations in its own chrome — the
        // right-hand sidebar's icon buttons carry `aria-selected` (not allowed on
        // a plain button), and the card action toggle has no accessible name.
        // Upstream (`frontend-app-course-authoring`) debt this suite cannot fix, so
        // it is tolerated here — on this screen only, so the rules still fail
        // anywhere else — and attached for triage. Remove when STUDIO-003 lands.
        await checkA11y(page, {
          label: 'studio-course-outline',
          additionalBaseline: ['aria-allowed-attr', 'button-name'],
        });
      },
    );

    test(
      'creates a course under a new organization',
      { tag: '@smoke', annotation: testId('TC-00248') },
      async ({
        page,
        config,
        studioHomePage,
        studioCourseOutlinePage,
        lifecycleCourse,
        newOrgCreator,
      }) => {
        // An organization the target has never seen, in the creator's session
        // (the author where allowed to make organizations, else the admin).
        const org = `E2EORG${getRunId()}${lifecycleCourse.number.slice(-6)}`.toUpperCase();
        const identity = newCourseIdentity(
          { ...config, org },
          getRunId(),
          lifecycleCourse.number.slice(-8),
          'neworg',
        );
        const { request } = newOrgCreator;
        expect((await fetchStudioHome(request, config)).allowedOrganizations).not.toContain(org);

        const created = await createCourseThroughStudioHome(
          studioHomePage,
          studioCourseOutlinePage,
          identity,
        );

        expect(created.response.status).toBe(200);
        expect(created.courseKey).toBe(identity.courseKey);
        expect(new URL(page.url()).pathname).toContain(`/course/${identity.courseKey}`);
        await expect(studioCourseOutlinePage.emptyPlaceholder).toBeVisible();

        await expect
          .poll(async () => {
            const listed = await listStudioCourses(request, config, { search: identity.number });
            return listed.courses.map((course) => course.courseKey);
          })
          .toContain(identity.courseKey);
        const detail = await fetchCourseDetail(request, config, identity.courseKey);
        expect(detail.org).toBe(org);
      },
    );

    test('Studio Home offers the form and lists the worker course', async ({
      page,
      studioHomePage,
      authoredCourse,
      studioAuthorSession,
    }) => {
      void studioAuthorSession;
      // The smoke path's surface, checked without spending a course: the form
      // opens with its fields, and the list carries the course this worker owns.
      await studioHomePage.goto();
      await expect(studioHomePage.courseCardLink(authoredCourse.courseKey)).toBeVisible();

      await studioHomePage.openNewCourseForm();
      await expect(studioHomePage.courseNameInput).toBeVisible();
      await expect(studioHomePage.courseNumberInput).toBeVisible();
      await expect(studioHomePage.courseRunInput).toBeVisible();
      await expect(studioHomePage.createButton).toBeDisabled();

      await checkA11y(page, { label: 'studio-home' });
    });

    // `STUDIO-002` (see `.private/findings.md`): the MFE hides the "new
    // organization" option from an author whose `allow_to_create_new_org` is
    // false — the org control is a dropdown of allowed orgs — yet Studio accepts a
    // `POST /course/` from that author under an organization that does not exist
    // and creates both. The flag is enforced in the UI only. Lift when the server
    // refuses (403) an org the session may not create.
    test.fixme('refuses an author a course under an organization they may not create', async ({
      request,
      config,
      lifecycleCourse,
    }) => {
      // Only meaningful where the author may not create organizations.
      expect((await fetchStudioHome(request, config)).allowToCreateNewOrg).toBe(false);
      const org = `E2EDENY${getRunId()}`.toUpperCase();
      const identity = newCourseIdentity(
        { ...config, org },
        getRunId(),
        lifecycleCourse.number.slice(-8),
        'deny',
      );
      await expect(createCourse(request, config, identity)).rejects.toThrow(/403/);
    });
  },
);
