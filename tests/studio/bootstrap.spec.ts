import { expect, test } from '../../src/fixtures';
import {
  createCourse,
  fetchCourseCreatorStatus,
  newCourseIdentity,
  fetchCourseDetail,
  fetchStudioHome,
  listStudioCourses,
  STUDIO_ME_PATH,
} from '../../src/api';

/**
 * The Studio bootstrap layer's own contract (Epic 7 acceptance criteria), asserted
 * directly so a broken author session or course factory is reported here rather
 * than as a confusing failure in a settings spec. No BTR case maps to these.
 */
test.describe(
  'Studio bootstrap',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring'] },
  () => {
    test('the author session authenticates Studio without a second sign-in', async ({
      request,
      config,
      studio,
    }) => {
      // The project loaded the captured author state into `request` and the page;
      // Studio must recognise it as-is.
      const me = await request.get(`${studio}${STUDIO_ME_PATH}`);
      expect(me.status()).toBe(200);
      expect(await fetchCourseCreatorStatus(request, config)).toBe('granted');
    });

    test('the worker-scoped course exists in Studio and is served by the LMS', async ({
      request,
      config,
      studio,
      authoredCourse,
    }) => {
      void studio;
      // Studio Home reads the course overview, which a background task refreshes
      // after creation, so the list can trail the create by a moment under load.
      await expect
        .poll(async () => {
          const listed = await listStudioCourses(request, config, {
            search: authoredCourse.number,
          });
          return listed.courses.map((course) => course.courseKey);
        })
        .toContain(authoredCourse.courseKey);

      const detail = await fetchCourseDetail(request, config, authoredCourse.courseKey);
      expect(detail.number).toBe(authoredCourse.number);
      expect(detail.org).toBe(authoredCourse.org);
    });

    test('re-requesting the worker course does not create a second one', async ({
      request,
      config,
      studio,
      authoredCourse,
    }) => {
      void studio;
      const home = await fetchStudioHome(request, config);
      expect(home.courseCreatorStatus).toBe('granted');

      // Every course in this run's list that carries this worker's number must be
      // the one course: the factory is idempotent per (run, worker).
      await expect
        .poll(async () => {
          const listed = await listStudioCourses(request, config, {
            search: authoredCourse.number,
          });
          return listed.courses
            .filter((course) => course.number === authoredCourse.number)
            .map((course) => course.courseKey);
        })
        .toEqual([authoredCourse.courseKey]);
    });

    // `STUDIO-001`: creating two courses at once under an organization that does
    // not exist yet races the platform's org get-or-create, and one request fails
    // with 500 (IntegrityError on organizations_organization.short_name) instead
    // of joining the org the other request created. Non-deterministic, so it cannot
    // run as a stable assertion; `ensureCourse` works around it with a re-check and
    // retry. Lift once the platform serialises or tolerates the org creation.
    test.fixme('two courses created concurrently under a new organization both succeed', async ({
      request,
      config,
    }) => {
      // A fresh org per attempt, so the get-or-create race is reachable. Plain
      // `createCourse` — no `ensureCourse` retry — is the point.
      const freshOrg = { ...config, org: `E2ERACE${Date.now().toString(36)}`.toUpperCase() };
      const runId = Date.now().toString(36);
      const keys = await Promise.all(
        ['A', 'B'].map((slot) =>
          createCourse(request, freshOrg, newCourseIdentity(freshOrg, runId, slot, 'race')),
        ),
      );
      expect([...new Set(keys)].sort()).toEqual([...keys].sort());
      expect(keys.every((key) => key.startsWith('course-v1:'))).toBe(true);
    });
  },
);
