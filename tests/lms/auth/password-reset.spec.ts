import { checkA11y } from '../../../src/a11y';
import { testId } from '../../../src/reporting';
import { expect, test } from '../../../src/fixtures';

/**
 * Forgot-password (password reset) through the authn MFE `/reset` route
 * (BTR TC-00004). We can only exercise the request side: completing a reset needs
 * the emailed token, and the suite's `@example.com` addresses have no readable
 * inbox. The endpoint is enumeration-safe (it confirms regardless of whether the
 * email maps to an account), so the confirmation can be asserted without a
 * mailbox or seeding an account.
 */
test.describe('Password reset (authn MFE)', () => {
  test(
    'requests a reset and shows the confirmation',
    { tag: ['@regression', '@mfe-authn'], annotation: testId('TC-00004') },
    async ({ forgotPasswordPage, learnerIdentity }) => {
      await forgotPasswordPage.goto();
      await forgotPasswordPage.requestReset(learnerIdentity.email);

      // The success-variant alert is the language-independent signal of acceptance.
      await expect(forgotPasswordPage.confirmation).toBeVisible();
    },
  );

  test(
    'rejects an invalid email address',
    { tag: ['@regression', '@mfe-authn'], annotation: testId('TC-00004') },
    async ({ forgotPasswordPage }) => {
      await forgotPasswordPage.goto();
      await forgotPasswordPage.requestReset('not-an-email');

      await expect(forgotPasswordPage.error).toBeVisible();
    },
  );

  test(
    'the reset screen meets WCAG 2.2 AA',
    { tag: ['@regression', '@mfe-authn'] },
    async ({ page, forgotPasswordPage }) => {
      await forgotPasswordPage.goto();
      await checkA11y(page, { label: 'reset' });
    },
  );
});
