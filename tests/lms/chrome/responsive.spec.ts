import { checkA11y } from '../../../src/a11y';
import { A11Y_VIEWPORTS, RESPONSIVE_VIEWPORTS, viewportUse } from '../../../src/config';
import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { anonymousHeaderExpectation, horizontalOverflow } from '../../../src/steps';
import { SHELL_CHROME_A11Y_BASELINE } from './helpers';

/**
 * The public site at phone, tablet and desktop widths (TC-00061), from the one
 * viewport table (`src/config/viewports.ts`). "Responsive" is structure, never a
 * pixel baseline: nothing scrolls sideways, every primary link the
 * configuration promises is reachable (visible, or behind the menu toggle), so
 * are the sign-in and register buttons (the narrow legacy header keeps them in
 * its account menu), and the course cards fit the screen.
 */
for (const viewport of RESPONSIVE_VIEWPORTS) {
  test.describe(`Public site at ${viewport.name} width`, () => {
    test.use(viewportUse(viewport));

    test(
      'keeps the landing page usable',
      { tag: ['@regression', '@mfe-catalog'], annotation: testId('TC-00061') },
      async ({ page, siteHeader, catalogHomePage, publicChrome }) => {
        const expected = anonymousHeaderExpectation(publicChrome.chrome);

        expect(await horizontalOverflow(page)).toBe(0);
        await expect(siteHeader.logoLink).toBeVisible();
        await expect(catalogHomePage.courseCards.first()).toBeVisible();
        const card = await catalogHomePage.courseCards.first().boundingBox();
        expect(card!.x + card!.width).toBeLessThanOrEqual(viewport.viewport.width);

        expect(await siteHeader.reachableAnonymousLinks()).toHaveLength(expected.callsToAction);
        expect(await siteHeader.reachableMainLinks()).toHaveLength(expected.mainLinks);
      },
    );
  });
}

for (const viewport of A11Y_VIEWPORTS) {
  test.describe(`Public site accessibility at ${viewport.name} width`, () => {
    test.use(viewportUse(viewport));

    test(
      'the landing page meets WCAG 2.2 AA',
      { tag: ['@regression', '@mfe-catalog'] },
      async ({ page, publicChrome }) => {
        void publicChrome;
        await checkA11y(page, {
          label: `landing-${viewport.name}`,
          additionalBaseline: SHELL_CHROME_A11Y_BASELINE,
        });
      },
    );
  });
}
