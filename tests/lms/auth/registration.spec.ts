import { checkA11y } from '../../../src/a11y';
import { newLearnerIdentity, registerLearnerAccount } from '../../../src/api';
import { hasAuthenticatedSession } from '../../../src/auth';
import { registerLearner } from '../../../src/steps';
import { testId } from '../../../src/reporting';
import { expect, test } from '../../../src/fixtures';

/**
 * Account creation through the authn MFE `/register` route (BTR TC-00002). The
 * deprecated Django registration page is out of scope. Data is unique-per-run so
 * these run parallel-safe against a default install.
 */
test.describe('Registration (authn MFE)', () => {
  test(
    'creates a new account and signs the learner in',
    { tag: ['@regression', '@mfe-authn'], annotation: testId('TC-00002') },
    async ({ page, registrationPage, learnerIdentity }) => {
      await registerLearner(page, registrationPage, learnerIdentity);

      // The redirect left the authn MFE and the learner is authenticated.
      expect(new URL(page.url()).pathname).not.toContain('/authn/');
      const cookies = await page.context().cookies();
      expect(
        hasAuthenticatedSession(cookies),
        'the login JWT cookie should be set after registration auto-login',
      ).toBe(true);
    },
  );

  test(
    'the registration screen meets WCAG 2.2 AA',
    { tag: ['@regression', '@mfe-authn'] },
    async ({ page, registrationPage }) => {
      await registrationPage.goto();
      await checkA11y(page, { label: 'register' });
    },
  );

  test(
    'rejects a duplicate email',
    { tag: ['@regression', '@mfe-authn'], annotation: testId('TC-00002') },
    async ({ page, request, config, registrationPage, learnerIdentity }) => {
      // Seed the account first (portable API path), then try to reuse its email.
      await registerLearnerAccount(request, config, learnerIdentity);

      const duplicate = newLearnerIdentity({ email: learnerIdentity.email });
      await registrationPage.goto();
      await registrationPage.register(duplicate);

      await expect(registrationPage.errorAlert).toBeVisible();
      const cookies = await page.context().cookies();
      expect(hasAuthenticatedSession(cookies)).toBe(false);
    },
  );

  test(
    'rejects a weak password',
    { tag: ['@regression', '@mfe-authn'], annotation: testId('TC-00002') },
    async ({ page, registrationPage }) => {
      await registrationPage.goto();
      await registrationPage.register(newLearnerIdentity({ password: '123' }));

      await expect(registrationPage.errorAlert).toBeVisible();
      const cookies = await page.context().cookies();
      expect(hasAuthenticatedSession(cookies)).toBe(false);
    },
  );

  test(
    'rejects a missing required field',
    { tag: ['@regression', '@mfe-authn'], annotation: testId('TC-00002') },
    async ({ page, registrationPage, learnerIdentity }) => {
      await registrationPage.goto();
      await registrationPage.fillForm(learnerIdentity);
      await registrationPage.name.fill('');
      await registrationPage.submit();

      await expect(registrationPage.errorAlert).toBeVisible();
      const cookies = await page.context().cookies();
      expect(hasAuthenticatedSession(cookies)).toBe(false);
    },
  );
});
