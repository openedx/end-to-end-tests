import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { LTI_ROLE, agsEndpoint, nrpsEndpoint } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { seedReadyLtiBlock } from '../../../src/steps';
import {
  LTI_TAGS,
  asCourseStaff,
  launchAsStaff,
  launchOf,
  ltiLabel,
  ltiUnit,
  openUnitAs,
} from './helpers';

/**
 * Course membership a tool reads through Names and Role Provisioning Services
 * (TC-00658): the learner and the course staff, each with their role, under the
 * course's context. The members are identified by their LTI user ids — the
 * `sub` of their own launches — since the block shares no names or emails.
 *
 * The tool makes the call (it is the actor in this case); the platform's answer
 * decides.
 */
test.describe('LTI 1.3 course membership (NRPS)', { tag: [...LTI_TAGS] }, () => {
  test.describe.configure({ timeout: TIMEOUTS.contentTest });

  test(
    'a tool reads the course membership with each member’s role',
    { annotation: testId('TC-00658') },
    async (
      {
        page,
        config,
        contentCourse,
        studioAuthorSession,
        roundTripLearner,
        instructorCast,
        ltiTool,
      },
      testInfo,
    ) => {
      void studioAuthorSession;
      const { courseKey } = contentCourse;
      const unit = await ltiUnit(page.request, config, courseKey, ltiLabel('nrps', testInfo));
      const { blockKey } = await seedReadyLtiBlock(page.request, config, ltiTool, unit.usageKey, {
        nrps: true,
        launchTarget: 'new_window',
      });

      // Course staff launch once, to learn their LTI user id, and hold the role
      // while the tool reads the membership.
      const staff = await instructorCast('staff');
      await asCourseStaff(page.request, config, courseKey, staff, async () => {
        const staffLaunch = await launchAsStaff(config, ltiTool, staff, courseKey, unit, blockKey);

        await openUnitAs(roundTripLearner, courseKey, unit);
        const window = await roundTripLearner.unitPage.ltiBlock(blockKey).launchInNewWindow();
        await window.close();
        const learnerLaunch = await launchOf(ltiTool, blockKey, staffLaunch);
        expect(nrpsEndpoint(learnerLaunch)?.context_memberships_url).toBeDefined();

        const memberships = await ltiTool.memberships(learnerLaunch);
        expect(memberships.status, JSON.stringify(memberships.body)).toBe(200);
        expect(memberships.body.context?.id).toBe(courseKey);
        const rolesOf = (sub: unknown) =>
          memberships.body.members?.find((m) => m.user_id === sub)?.roles ?? [];
        expect(rolesOf(learnerLaunch.claims.sub)).toContain(LTI_ROLE.learner);
        expect(rolesOf(staffLaunch.claims.sub)).toContain(LTI_ROLE.instructor);
      });
    },
  );

  // Not a sheet step: a block that does not offer NRPS refuses the call.
  test('a block without NRPS refuses the membership call', async ({
    page,
    config,
    contentCourse,
    studioAuthorSession,
    roundTripLearner,
    ltiTool,
  }, testInfo) => {
    void studioAuthorSession;
    const { courseKey } = contentCourse;
    const unit = await ltiUnit(page.request, config, courseKey, ltiLabel('no nrps', testInfo));
    const { blockKey } = await seedReadyLtiBlock(page.request, config, ltiTool, unit.usageKey, {
      nrps: false,
    });
    await openUnitAs(roundTripLearner, courseKey, unit);
    await roundTripLearner.unitPage.ltiBlock(blockKey).waitForInlineLaunch();
    const launch = await launchOf(ltiTool, blockKey);
    expect(nrpsEndpoint(launch)).toBeUndefined();

    // The block's memberships URL sits beside its AGS line-item container.
    const lineItems = agsEndpoint(launch)?.lineitems;
    expect(lineItems).toBeDefined();
    const membershipsUrl = lineItems!.replace(/\/lti-ags$/, '/memberships');
    const refused = await ltiTool.memberships(launch, membershipsUrl);
    expect(refused.status).toBe(403);
  });
});
