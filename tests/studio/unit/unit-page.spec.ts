import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import { buildSection, fetchXBlockOutline } from '../../../src/api';
import { testId } from '../../../src/reporting';
import { buildUnit } from '../components/component-helpers';

/**
 * The unit (container) page's own actions: View live (TC-00197), Preview
 * (TC-00198), add a unit (TC-00199), hide from learners (TC-00200), publish
 * (TC-00201), and previous/next navigation (TC-00202).
 *
 * The UI drives the action; the author-side outcome is `xblock/outline` and the
 * new-tab URLs, and the learner half (hide/publish) is the learner's Blocks API.
 * Structure is arranged through the browser session in a fresh, per-test course
 * so the unit's siblings are exactly what the test made.
 */
test.describe(
  'Studio unit page',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'View live opens the published unit in the LMS',
      { annotation: testId('TC-00197') },
      async ({ page, config, studioUnitPage, authoringCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const unitKey = await buildUnit(page.request, config, authoringCourse.courseKey, {
          label: 'unit',
          blocks: ['html'],
          publish: true,
        });

        await studioUnitPage.goto(unitKey);
        const tab = await studioUnitPage.viewLive();
        expect(new URL(tab.url()).pathname).toContain(`/course/${authoringCourse.courseKey}`);
        await tab.close();
      },
    );

    test(
      'Preview opens the unit in the learning MFE preview',
      { annotation: testId('TC-00198') },
      async ({ page, config, studioUnitPage, authoringCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const unitKey = await buildUnit(page.request, config, authoringCourse.courseKey, {
          label: 'unit',
          blocks: ['html'],
          publish: false,
        });

        await studioUnitPage.goto(unitKey);
        const tab = await studioUnitPage.preview();
        expect(new URL(tab.url()).pathname).toContain('/preview/course/');
        expect(new URL(tab.url()).pathname).toContain(authoringCourse.courseKey);
        await tab.close();
      },
    );

    test(
      'adds a new unit from the unit page',
      { annotation: testId('TC-00199') },
      async ({ page, config, studioUnitPage, authoringCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const unitKey = await buildUnit(page.request, config, authoringCourse.courseKey, {
          label: 'unit',
          blocks: ['html'],
          publish: false,
        });

        await studioUnitPage.goto(unitKey);
        const newUnitKey = await studioUnitPage.addUnit();
        expect(newUnitKey).not.toBe(unitKey);
        expect((await fetchXBlockOutline(page.request, config, newUnitKey)).category).toBe(
          'vertical',
        );
      },
    );

    test(
      'hides the unit from learners',
      { annotation: testId('TC-00200') },
      async ({
        page,
        config,
        studioUnitPage,
        authoringCourse,
        studioAuthorSession,
        authoringCourseLearner,
      }) => {
        void studioAuthorSession;
        const unitKey = await buildUnit(page.request, config, authoringCourse.courseKey, {
          label: 'unit',
          blocks: ['html'],
          publish: true,
        });
        await expect
          .poll(
            async () =>
              (await authoringCourseLearner.outline()).units.some((u) => u.id === unitKey),
            { timeout: TIMEOUTS.contentPublish },
          )
          .toBe(true);

        await studioUnitPage.goto(unitKey);
        await studioUnitPage.setStaffOnly(true);

        expect((await fetchXBlockOutline(page.request, config, unitKey)).visibility_state).toBe(
          'staff_only',
        );
        await expect
          .poll(
            async () =>
              (await authoringCourseLearner.outline()).units.some((u) => u.id === unitKey),
            { timeout: TIMEOUTS.contentPublish },
          )
          .toBe(false);
      },
    );

    test(
      'publishes the unit from the unit page',
      { annotation: testId('TC-00201') },
      async ({
        page,
        config,
        studioUnitPage,
        authoringCourse,
        studioAuthorSession,
        authoringCourseLearner,
      }) => {
        void studioAuthorSession;
        const unitKey = await buildUnit(page.request, config, authoringCourse.courseKey, {
          label: 'unit',
          blocks: ['html'],
          publish: false,
        });
        expect((await fetchXBlockOutline(page.request, config, unitKey)).published).toBe(false);

        await studioUnitPage.goto(unitKey);
        await studioUnitPage.publish();

        expect((await fetchXBlockOutline(page.request, config, unitKey)).published).toBe(true);
        await expect
          .poll(
            async () =>
              (await authoringCourseLearner.outline()).units.some((u) => u.id === unitKey),
            { timeout: TIMEOUTS.contentPublish },
          )
          .toBe(true);
      },
    );

    test(
      'navigates to the next and previous unit',
      { annotation: testId('TC-00202') },
      async ({ page, config, studioUnitPage, authoringCourse, studioAuthorSession }) => {
        void studioAuthorSession;
        const section = await buildSection(
          page.request,
          config,
          authoringCourse.courseKey,
          `E2E unit-nav ${test.info().testId.slice(-6)}`,
          { subsections: [{ units: [{ blocks: ['html'] }, { blocks: ['html'] }] }] },
        );
        const [firstKey, secondKey] = section.units.map((u) => u.usageKey);

        await studioUnitPage.goto(firstKey as string);
        expect(await studioUnitPage.next()).toBe(secondKey);
        expect(await studioUnitPage.previous()).toBe(firstKey);
      },
    );
  },
);
