import { hasAuthenticatedSession } from '../../../src/auth';
import { expect, test } from '../../../src/fixtures';

/**
 * Proves the auth contract's captured storage state is reusable: this spec runs
 * in the `lms-learner` project, which depends on the `setup` project and loads
 * `.auth/learner.json` via `use: { storageState }`. It never drives the login UI,
 * yet reaches an authenticated destination — demonstrating a single sign-in is
 * reused by a second spec (Epic 2 acceptance criterion).
 */
test.describe('Reused learner session', () => {
  test(
    'reaches the dashboard without signing in again',
    { tag: '@authenticated' },
    async ({ page, config }) => {
      await page.goto(`${config.baseUrls.lms}/dashboard`);

      // Still authenticated: we were not bounced to the authn MFE.
      expect(new URL(page.url()).pathname).not.toContain('/authn/');
      const cookies = await page.context().cookies();
      expect(hasAuthenticatedSession(cookies)).toBe(true);
    },
  );
});
