import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  fetchInstructorLearner,
  isEnrolled,
  listEnrollments,
  type BetaTesterModifyResult,
  type EnrollmentModifyResult,
} from '../../../src/api';
import { checkA11y } from '../../../src/a11y';
import { testId } from '../../../src/reporting';
import { INSTRUCTOR_A11Y_BASELINE, INSTRUCTOR_TAGS, buildFutureSection, label } from './helpers';

/**
 * The Enrollments tab: bulk enrollment with notification (TC-00517), the
 * enrollment-status check (TC-00518) and beta-tester early access (TC-00519).
 *
 * The UI drives each change; the instructor API's per-identifier results and
 * the learner's own readings (`isEnrolled`, the Blocks API) decide pass/fail.
 * E-mail *delivery* is not observable here; the request is asserted to carry
 * the notification flag and to be accepted.
 */
test.describe(
  'Instructor dashboard enrollments',
  { tag: ['@regression', ...INSTRUCTOR_TAGS] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'enrolls an existing learner and invites an unknown e-mail address',
      { annotation: testId('TC-00517') },
      async ({
        page,
        config,
        contentCourse,
        instructorEnrollments,
        newLearner,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const courseKey = contentCourse.courseKey;
        // A learner with an account but no enrollment, and an address with neither.
        const learner = await newLearner();
        const invited = `e2e-invite-${test.info().testId.slice(-6)}-${Date.now()}@example.com`;
        expect(await isEnrolled(learner.request, config, courseKey)).toBe(false);

        await instructorEnrollments.gotoTab(courseKey);
        const modal = await instructorEnrollments.openEnrollLearners();
        await modal.fillIdentifiers([learner.identity.username, invited]);
        await modal.setNotifyByEmail(true);
        const response = await modal.submit();
        expect(response.status()).toBe(200);
        const body = (await response.json()) as {
          action: string;
          results: EnrollmentModifyResult[];
        };
        expect(body.action).toBe('enroll');
        const byId = new Map(body.results.map((row) => [row.identifier, row]));
        expect(byId.get(learner.identity.username)?.after).toMatchObject({
          user: true,
          enrollment: true,
        });
        // No account: the platform records an invitation instead (what the
        // pending-enrollments report lists).
        expect(byId.get(invited)?.after).toMatchObject({
          user: false,
          enrollment: false,
          allowed: true,
        });

        // The learner's own session confirms the enrollment; the table lists them.
        expect(await isEnrolled(learner.request, config, courseKey)).toBe(true);
        await expect(instructorEnrollments.rowFor(learner.identity.username)).toBeVisible();

        await checkA11y(page, {
          label: 'instructor-enrollments',
          additionalBaseline: INSTRUCTOR_A11Y_BASELINE,
        });
      },
    );

    test(
      'checks a learner’s enrollment status',
      { annotation: testId('TC-00518') },
      async ({
        page,
        config,
        contentCourse,
        instructorEnrollments,
        roundTripLearner,
        newLearner,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const courseKey = contentCourse.courseKey;
        const outsider = await newLearner();
        await instructorEnrollments.gotoTab(courseKey);

        // The modal's sentence is localized; the API's boolean decides.
        const enrolled = await instructorEnrollments.checkEnrollmentStatus(
          roundTripLearner.identity.username,
        );
        expect(enrolled.status()).toBe(200);
        expect(
          (
            await fetchInstructorLearner(
              page.request,
              config,
              courseKey,
              roundTripLearner.identity.username,
            )
          ).is_enrolled,
        ).toBe(true);
        await instructorEnrollments.closeDialog();

        const notEnrolled = await instructorEnrollments.checkEnrollmentStatus(
          outsider.identity.username,
        );
        expect(notEnrolled.status()).toBe(200);
        expect(
          (
            await fetchInstructorLearner(
              page.request,
              config,
              courseKey,
              outsider.identity.username,
            )
          ).is_enrolled,
        ).toBe(false);
      },
    );

    test(
      'grants beta-tester early access and removes it again',
      { annotation: testId('TC-00519') },
      async ({
        page,
        config,
        contentCourse,
        instructorEnrollments,
        roundTripLearners,
        studioAuthorSession,
      }) => {
        void studioAuthorSession;
        const courseKey = contentCourse.courseKey;
        const [beta, other] = roundTripLearners;
        // A section released a month from now; the content course lets beta
        // testers in 365 days early.
        const section = await buildFutureSection(
          page.request,
          config,
          courseKey,
          label('beta', test.info().testId),
        );
        const unitKey = section.units[0]?.usageKey ?? '';
        const sees = async (learner: typeof beta) =>
          (await learner.outline()).units.some((unit) => unit.id === unitKey);
        expect(await sees(beta)).toBe(false);

        await instructorEnrollments.gotoTab(courseKey);
        const modal = await instructorEnrollments.openAddBetaTesters();
        await modal.fillIdentifiers([beta.identity.username]);
        await modal.setNotifyByEmail(false);
        const added = (await (await modal.submit()).json()) as {
          action: string;
          results: BetaTesterModifyResult[];
        };
        expect(added.action).toBe('add');
        expect(added.results[0]).toMatchObject({
          identifier: beta.identity.username,
          error: false,
        });

        // Instructor side: the beta filter lists them; learner side: the unreleased
        // unit is now served (block structure, polled).
        await instructorEnrollments.filterBetaTesters('true');
        await expect(instructorEnrollments.rowFor(beta.identity.username)).toBeVisible();
        expect(
          (
            await listEnrollments(page.request, config, courseKey, { isBetaTester: true })
          ).results.some((row) => row.username === beta.identity.username),
        ).toBe(true);
        await expect.poll(() => sees(beta), { timeout: TIMEOUTS.contentPublish }).toBe(true);
        expect(await sees(other)).toBe(false);

        // Remove the role from the row menu: the unit disappears for them again.
        const removed = (await (
          await instructorEnrollments.toggleBetaTester(beta.identity.username)
        ).json()) as {
          action: string;
        };
        expect(removed.action).toBe('remove');
        await expect.poll(() => sees(beta), { timeout: TIMEOUTS.contentPublish }).toBe(false);
        expect(
          (
            await listEnrollments(page.request, config, courseKey, { isBetaTester: true })
          ).results.some((row) => row.username === beta.identity.username),
        ).toBe(false);
      },
    );
  },
);
