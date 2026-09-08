import { test, expect } from '@playwright/test';

import { COURSE_NUMBER_PREFIX, courseKeyFor, newCourseIdentity } from '../../src/api';
import { loadConfig, type Env } from '../../src/config';

/**
 * Pure unit tests for the Studio course factory's naming. No browser or target.
 * The rules under test come from Studio's own uniqueness check (org + number)
 * and from the course-key alphabet.
 */
const baseEnv: Env = {
  LMS_BASE_URL: 'http://local.openedx.io',
  APPS_BASE_URL: 'http://apps.local.openedx.io',
};

test.describe('newCourseIdentity', { tag: '@unit' }, () => {
  test('puts the run id and slot in the course number, since org+number is the unique key', () => {
    const config = loadConfig(baseEnv);
    const a = newCourseIdentity(config, 'abc123', 'W0');
    const b = newCourseIdentity(config, 'abc123', 'W1');
    const c = newCourseIdentity(config, 'abc124', 'W0');

    expect(a.number).toBe(`${COURSE_NUMBER_PREFIX}ABC123W0`);
    expect(new Set([a.number, b.number, c.number]).size).toBe(3);
    expect(a.courseKey).toBe(courseKeyFor(a.org, a.number, a.run));
  });

  test('uses the configured ORG, or a suite default', () => {
    expect(newCourseIdentity(loadConfig(baseEnv), 'r', 0).org).toBe('E2E');
    expect(newCourseIdentity(loadConfig({ ...baseEnv, ORG: 'OpenedX' }), 'r', 0).org).toBe(
      'OpenedX',
    );
  });

  test('keeps the key to the course-key alphabet whatever the slot', () => {
    const identity = newCourseIdentity(loadConfig(baseEnv), 'r1', 'team member!', 'Course Team');
    expect(identity.courseKey).toMatch(/^course-v1:[\w.-]+\+[\w.-]+\+[\w.-]+$/);
  });

  test('carries the run id in the display name so list searches match suite data', () => {
    const identity = newCourseIdentity(loadConfig(baseEnv), 'run42', 'W3', 'lifecycle');
    expect(identity.displayName).toContain('run42');
    expect(identity.displayName).toContain('lifecycle');
  });
});
