import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import {
  ApiError,
  COURSE_NUMBER_PREFIX,
  courseKeyFor,
  ensureCourse,
  newCourseIdentity,
} from '../../src/api';
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

/**
 * `ensureCourse` retries a *transient* creation failure. Under heavy concurrent
 * creation the CMS answers `POST /course/` with a 2xx whose body is not JSON (an
 * error/HTML page), which is retryable — the same call succeeds a moment later.
 * A stub request context replays a scripted sequence of responses so no browser
 * or target is needed.
 */
type StubResponse = {
  ok: () => boolean;
  status: () => number;
  url: () => string;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

const json = (status: number, value: unknown): StubResponse => ({
  ok: () => status >= 200 && status < 300,
  status: () => status,
  url: () => 'stub',
  text: () => Promise.resolve(JSON.stringify(value)),
  json: () => Promise.resolve(value),
});

const nonJson = (status: number, body: string): StubResponse => ({
  ok: () => status >= 200 && status < 300,
  status: () => status,
  url: () => 'stub',
  text: () => Promise.resolve(body),
  json: () => Promise.reject(new Error('not json')),
});

/**
 * A request context whose `POST /course/` returns each queued response in turn.
 * `GET` answers the two reads `ensureCourse` makes: a 404 for the course-exists
 * probe (so it proceeds to create) and a CSRF token for the write headers.
 */
function stubContext(coursePosts: StubResponse[]) {
  const posts = [...coursePosts];
  const calls = { post: 0 };
  const request = {
    get: (url: string) => {
      if (url.includes('/csrf/')) return Promise.resolve(json(200, { csrfToken: 'token' }));
      return Promise.resolve(nonJson(404, 'not found')); // course-exists probe
    },
    post: () => {
      calls.post += 1;
      return Promise.resolve(posts.shift() ?? json(500, {}));
    },
  } as unknown as APIRequestContext;
  return { request, calls };
}

test.describe('ensureCourse — transient-failure retry', { tag: '@unit' }, () => {
  const config = loadConfig({ ...baseEnv, CMS_BASE_URL: 'http://studio.local.openedx.io' });
  const identity = newCourseIdentity(loadConfig(baseEnv), 'run1', 'W0');

  test('retries a 2xx non-JSON creation response, then succeeds', async () => {
    const { request, calls } = stubContext([
      nonJson(200, '<html>Server error</html>'),
      json(200, { course_key: identity.courseKey }),
    ]);

    const key = await ensureCourse(request, config, identity);

    expect(key).toBe(identity.courseKey);
    expect(calls.post).toBe(2);
  });

  test('does not retry a 4xx rejection', async () => {
    const { request, calls } = stubContext([json(400, { error: 'bad request' })]);

    await expect(ensureCourse(request, config, identity)).rejects.toBeInstanceOf(ApiError);
    expect(calls.post).toBe(1);
  });
});
