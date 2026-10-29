import { test, expect } from '@playwright/test';

import { isInfrastructureProject } from '../../src/reporting/project';

test.describe('isInfrastructureProject', { tag: '@unit' }, () => {
  const excluded = new Set(['setup', 'unit']);

  test('excludes the built-in setup and unit projects', () => {
    expect(isInfrastructureProject('setup', excluded)).toBe(true);
    expect(isInfrastructureProject('unit', excluded)).toBe(true);
  });

  test('excludes mirrored external unit projects (CUSTOM_TEST_DIRS)', () => {
    expect(isInfrastructureProject('unit/examples', excluded)).toBe(true);
    expect(isInfrastructureProject('unit/provider-a-tests', excluded)).toBe(true);
  });

  test('keeps browser tiers, built-in and mirrored, as scenarios', () => {
    for (const name of [
      'smoke',
      'regression',
      'lms-learner',
      'studio-author',
      'smoke/examples',
      'studio-author/provider-b-tests',
    ]) {
      expect(isInfrastructureProject(name, excluded)).toBe(false);
    }
  });

  test('treats an unknown project as a scenario', () => {
    expect(isInfrastructureProject(undefined, excluded)).toBe(false);
  });
});
