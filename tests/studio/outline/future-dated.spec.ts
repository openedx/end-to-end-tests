import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../../../src/fixtures';
import { TIMEOUTS } from '../../../src/config';
import {
  buildSection,
  fetchCourseMetadata,
  fetchXBlockOutline,
  type AuthoredSection,
} from '../../../src/api';
import { testId } from '../../../src/reporting';

/**
 * Publishing content in a **future-dated course** (its start is years away) and
 * confirming a learner cannot reach it until the course starts — for a unit
 * (TC-00150), a subsection (TC-00151) and a section (TC-00152).
 *
 * The author publishes through the outline and `xblock/outline` confirms
 * `published: true`; the learner side is read from `course_metadata`
 * (`course_not_started`), not the Blocks API, which 500s on a not-yet-started
 * course (`PLAT-007`). Structure is arranged through the browser session; only
 * the publish is driven in the UI, since publishing is the case's subject.
 */
test.describe(
  'Future-dated course publishing',
  { tag: ['@regression', '@studio', '@author', '@mfe-authoring', '@mfe-learning'] },
  () => {
    // Round trips poll the learner under TIMEOUTS.contentPublish (longer than the
    // default per-test budget), so the block-structure task's delay under load
    // does not trip the test timeout.
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'a learner cannot reach a published unit before the course starts',
      { annotation: testId('TC-00150') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        futureCourse,
        studioAuthorSession,
        futureCourseLearner,
      }) => {
        void studioAuthorSession;
        const section = await draft(
          page.request,
          config,
          futureCourse.courseKey,
          test.info(),
          'unit',
        );
        const unitKey = only(section.units);

        await studioCourseOutlinePage.goto(futureCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.publish(studioCourseOutlinePage.unit(unitKey), 'unit');

        expect((await fetchXBlockOutline(page.request, config, unitKey)).published).toBe(true);
        await expectCourseNotStarted(futureCourseLearner, config);
      },
    );

    test(
      'a learner cannot reach a published subsection before the course starts',
      { annotation: testId('TC-00151') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        futureCourse,
        studioAuthorSession,
        futureCourseLearner,
      }) => {
        void studioAuthorSession;
        const section = await draft(
          page.request,
          config,
          futureCourse.courseKey,
          test.info(),
          'sub',
        );
        const unitKey = only(section.units);

        await studioCourseOutlinePage.goto(futureCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.publish(
          studioCourseOutlinePage.subsection(unitKey),
          'subsection',
        );

        expect((await fetchXBlockOutline(page.request, config, unitKey)).published).toBe(true);
        await expectCourseNotStarted(futureCourseLearner, config);
      },
    );

    test(
      'a learner cannot reach a published section before the course starts',
      { annotation: testId('TC-00152') },
      async ({
        page,
        config,
        studioCourseOutlinePage,
        futureCourse,
        studioAuthorSession,
        futureCourseLearner,
      }) => {
        void studioAuthorSession;
        const section = await draft(
          page.request,
          config,
          futureCourse.courseKey,
          test.info(),
          'sec',
        );
        const unitKey = only(section.units);

        await studioCourseOutlinePage.goto(futureCourse.courseKey);
        await studioCourseOutlinePage.setAllExpanded(true);
        await studioCourseOutlinePage.publish(studioCourseOutlinePage.section(unitKey), 'section');

        expect((await fetchXBlockOutline(page.request, config, unitKey)).published).toBe(true);
        await expectCourseNotStarted(futureCourseLearner, config);
      },
    );

    // The positive half — the same content IS reachable once the course has
    // started — is covered by the content course's own round trips (structure /
    // publish specs); here the future course's start is never moved.
  },
);

async function expectCourseNotStarted(
  learner: { request: APIRequestContext; courseKey: string; navigation: () => Promise<unknown> },
  config: Parameters<typeof fetchCourseMetadata>[1],
): Promise<void> {
  // Read repeatedly: the block-structure task runs on publish, but the course's
  // not-started gate is what the learner hits regardless.
  await expect
    .poll(
      async () =>
        (await fetchCourseMetadata(learner.request, config, learner.courseKey)).course_access
          .error_code,
      { timeout: TIMEOUTS.contentPublish },
    )
    .toBe('course_not_started');
  expect(await learner.navigation()).toBeUndefined();
}

function draft(
  request: Parameters<typeof buildSection>[0],
  config: Parameters<typeof buildSection>[1],
  courseKey: string,
  info: { testId: string },
  tag: string,
) {
  return buildSection(request, config, courseKey, `E2E fut-${tag} ${info.testId.slice(-6)}`, {
    subsections: [{ units: [{ blocks: ['html'] }] }],
  });
}

function only(items: AuthoredSection['units']): string {
  const [first] = items;
  if (first === undefined) throw new Error('The section is missing a unit.');
  return first.usageKey;
}
