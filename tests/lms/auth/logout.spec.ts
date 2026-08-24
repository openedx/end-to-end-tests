import { provisionLearnerAccount } from '../../../src/accounts';
import { hasAuthenticatedSession } from '../../../src/auth';
import { signIn, signOut } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { expect, test } from '../../../src/fixtures';

/**
 * Sign-out clears the session. The BTR sheet has no dedicated logout case, so
 * this is folded under TC-00003 pending confirmation with the BTR Working Group.
 * Because auth cookies are scoped to the shared parent domain, clearing them
 * signs the learner out of every declared origin at once.
 */
test.describe('Logout (authn MFE)', () => {
  test(
    'signing out clears the session across declared origins',
    { tag: ['@regression', '@mfe-authn'], annotation: testId('TC-00003') },
    async ({ page, request, config, loginPage, accountMenu }) => {
      const identity = await provisionLearnerAccount(request, config);
      await signIn(page, loginPage, {
        emailOrUsername: identity.email,
        password: identity.password,
      });

      await signOut(page, accountMenu, identity.username);

      // The login JWT cookie is cleared across the shared parent domain...
      const cookies = await page.context().cookies();
      expect(hasAuthenticatedSession(cookies)).toBe(false);

      // ...and an authenticated destination now bounces back to sign-in.
      await page.goto(`${config.baseUrls.lms}/dashboard`);
      await expect(page).toHaveURL(/\/(authn|login)\b/);
    },
  );
});
