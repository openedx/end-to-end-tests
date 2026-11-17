import { checkA11y } from '../../../src/a11y';
import { buildSection, fetchLinkCheck } from '../../../src/api';
import { getRunId, TIMEOUTS } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';

/**
 * The Course Optimizer (authoring MFE): "Scan course" queues a link check of the
 * course's published content on the CMS worker, and the page lists what it found.
 *
 * The scan covers the whole course, so the case builds and publishes a section of
 * its own in the worker's content course, holding one text component with a link
 * that cannot resolve: a `/static/` path to a file the course does not have. The
 * worker turns a relative link into a Studio URL and requests it, and a Studio
 * link that answers 404, or does not answer at all, is filed as broken, so the
 * finding needs no outbound internet and does not depend on how the target
 * serves Studio to its own worker. The platform reports the link as it rewrote it
 * (the `/static/` path becomes the asset's URL), so the link is recognised by its
 * run-unique file name. The UI drives the scan; the platform's link check status
 * decides whether the scan found the link.
 */
test.describe(
  'Course Optimizer',
  { tag: ['@studio', '@author', '@mfe-authoring', '@course-optimizer'] },
  () => {
    test.describe.configure({ timeout: TIMEOUTS.contentTest });

    test(
      'a scan finds a broken link in a published section',
      { tag: '@regression' },
      async ({ page, config, contentCourse, optimizerPage, studioAuthorSession }) => {
        void studioAuthorSession;
        // Author Studio API off the browser's own session — see course-lifecycle.spec.ts / studio-browser-session-decays.
        const api = page.request;
        const { courseKey } = contentCourse;
        const tag = `${getRunId()}-${test.info().testId.slice(-6)}-r${test.info().retry}`;
        const missingFile = `e2e-missing-${tag}.pdf`;
        const brokenLink = `/static/${missingFile}`;
        const section = await buildSection(api, config, courseKey, `E2E optimizer ${tag}`, {
          subsections: [
            { units: [{ blocks: [{ html: `<p><a href="${brokenLink}">x</a></p>` }] }] },
          ],
          publish: true,
        });
        const [block] = section.blocks;

        // The check to beat: the scan this test starts must be a newer one.
        const before = (await fetchLinkCheck(api, config, courseKey)).createdAt;

        await optimizerPage.goto(courseKey);
        expect((await optimizerPage.scan(courseKey)).status()).toBeLessThan(300);

        await expect
          .poll(
            async () => {
              const latest = await fetchLinkCheck(api, config, courseKey);
              return { newer: latest.createdAt !== before, status: latest.status };
            },
            { timeout: TIMEOUTS.linkCheck },
          )
          .toEqual({ newer: true, status: 'Succeeded' });

        // The platform's own reading: the section's component is flagged for the link.
        const check = await fetchLinkCheck(api, config, courseKey);
        const found = check.sections
          .find((s) => s.id === section.usageKey)
          ?.blocks.find((b) => b.id === block?.usageKey);
        expect(found?.brokenLinks.filter((link) => link.includes(missingFile))).toHaveLength(1);

        // The page lists the section and, opened, the link itself.
        await expect(optimizerPage.resultSection(section.displayName)).toBeVisible({
          timeout: TIMEOUTS.navigation,
        });
        await optimizerPage.openResultSection(section.displayName);
        await expect(optimizerPage.flaggedLink(section.displayName, missingFile)).toBeVisible();

        await checkA11y(page, { label: 'studio-optimizer' });
      },
    );
  },
);
