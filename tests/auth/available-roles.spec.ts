import { test, expect } from '@playwright/test';

import { ApiAuthProvider } from '../../src/auth';
import { loadConfig, type Env } from '../../src/config';

/**
 * Pure unit tests for which roles the default provider offers the setup project.
 * No browser or target.
 */
const baseEnv: Env = {
  LMS_BASE_URL: 'http://local.openedx.io',
  APPS_BASE_URL: 'http://apps.local.openedx.io',
};

test.describe('ApiAuthProvider.availableRoles @unit', () => {
  test('offers only the learner role when no admin account is configured', () => {
    const config = loadConfig(baseEnv);
    expect(new ApiAuthProvider().availableRoles(config)).toEqual(['learner']);
  });

  test('adds the staff role when an admin account is configured', () => {
    const config = loadConfig({ ...baseEnv, ADMIN_USERNAME: 'edx', ADMIN_PASSWORD: 'secret' });
    expect(new ApiAuthProvider().availableRoles(config)).toEqual(['learner', 'staff']);
  });

  test('never offers the instructor role by default', () => {
    const config = loadConfig({ ...baseEnv, ADMIN_USERNAME: 'edx', ADMIN_PASSWORD: 'secret' });
    expect(new ApiAuthProvider().availableRoles(config)).not.toContain('instructor');
  });
});
