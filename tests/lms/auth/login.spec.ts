import { checkA11y } from '../../../src/a11y';
import { provisionLearnerAccount } from '../../../src/accounts';
import { hasAuthenticatedSession } from '../../../src/auth';
import { signIn } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { expect, test } from '../../../src/fixtures';

/**
 * Sign-in through the authn MFE `/login` route (BTR TC-00003). The critical
 * valid-credentials path is `@smoke`. Each test seeds its own unique account via
 * the portable registration API, then drives the UI — the thing under test.
 */
test.describe('Login (authn MFE)', () => {
  test(
    'signs in with valid credentials',
    { tag: ['@smoke', '@mfe-authn'], annotation: testId('TC-00003') },
    async ({ page, request, config, loginPage }) => {
      // Provision an account that can actually sign in (activates it when the
      // target enforces email validation), via the configured account backend.
      const identity = await provisionLearnerAccount(request, config);

      await signIn(page, loginPage, {
        emailOrUsername: identity.email,
        password: identity.password,
      });

      expect(new URL(page.url()).pathname).not.toContain('/authn/');
      const cookies = await page.context().cookies();
      expect(
        hasAuthenticatedSession(cookies),
        'the login JWT cookie should be set after a successful sign-in',
      ).toBe(true);
    },
  );

  test(
    'rejects invalid credentials',
    { tag: ['@regression', '@mfe-authn'], annotation: testId('TC-00003') },
    async ({ page, loginPage, learnerIdentity }) => {
      await loginPage.goto();
      await loginPage.signIn(learnerIdentity.email, 'wrong-password');

      await expect(loginPage.errorAlert).toBeVisible();
      expect(new URL(page.url()).pathname).toContain('/authn/');
      const cookies = await page.context().cookies();
      expect(hasAuthenticatedSession(cookies)).toBe(false);
    },
  );

  test(
    'the login screen meets WCAG 2.2 AA',
    { tag: ['@regression', '@mfe-authn'] },
    async ({ page, loginPage }) => {
      await loginPage.goto();
      await checkA11y(page, { label: 'login' });
    },
  );
});
