import { provisionLearnerAccount } from '../../../src/accounts';
import { hasAuthenticatedSession } from '../../../src/auth';
import { signIn, signOut } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { expect, test } from '../../../src/fixtures';

/**
 * Sign-out clears the session. Sign-in and sign-out both go through the
 * configured account backend's UI flows, so this is not gated on `mfe-authn` —
 * it exercises whatever screens the install has.
 *
 * The BTR sheet has no dedicated logout case, so
 * this is folded under TC-00003 pending confirmation with the BTR Working Group.
 * Because auth cookies are scoped to the shared parent domain, clearing them
 * signs the learner out of every declared origin at once.
 */
test.describe('Logout', () => {
  test(
    'signing out clears the session across declared origins',
    { tag: '@regression', annotation: testId('TC-00003') },
    async ({ page, request, config }) => {
      const identity = await provisionLearnerAccount(request, config);
      await signIn(page, config, {
        emailOrUsername: identity.email,
        password: identity.password,
      });

      await signOut(page, config, identity.username);

      // The login JWT cookie is cleared across the shared parent domain...
      const cookies = await page.context().cookies();
      expect(hasAuthenticatedSession(cookies)).toBe(false);

      // ...and an authenticated destination no longer serves the learner: it
      // redirects somewhere else. Where is the install's business — the authn
      // MFE, an external IdP, a marketing page — so assert only that we did not
      // stay on the dashboard, not which screen replaced it.
      const dashboard = new URL('/dashboard', config.baseUrls.lms);
      await page.goto(dashboard.href);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .not.toMatch(new RegExp(`^${dashboard.pathname}/?$`));
    },
  );
});
