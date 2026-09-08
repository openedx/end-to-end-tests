import { checkA11y } from '../../../src/a11y';
import { provisionLearnerAccount } from '../../../src/accounts';
import { hasAuthenticatedSession } from '../../../src/auth';
import { signIn } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { expect, test } from '../../../src/fixtures';

/**
 * Sign-in through the UI (BTR TC-00003). The critical valid-credentials path is
 * `@smoke`. Each test seeds its own unique account via the portable registration
 * API, then drives the UI — the thing under test.
 *
 * The valid-credentials case goes through the configured account backend's
 * sign-in flow, so it exercises whatever screens the install actually has and is
 * not gated on `mfe-authn`. The other two assert on the authn MFE's own form
 * (its error alert, its a11y), so they carry the tag and skip where that MFE
 * does not own sign-in.
 */
test.describe('Login (authn MFE)', () => {
  test(
    'signs in with valid credentials',
    { tag: '@smoke', annotation: testId('TC-00003') },
    async ({ page, request, config }) => {
      // Provision an account that can actually sign in (activates it when the
      // target enforces email validation), via the configured account backend.
      const identity = await provisionLearnerAccount(request, config);

      await signIn(page, config, {
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
