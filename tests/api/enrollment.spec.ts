import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { ApiError, enrollInCourseViaApi, forceEnrollUserViaApi } from '../../src/api';
import { loadConfig } from '../../src/config';

/**
 * What the two enrollment writes send: a learner enrolling themselves, and global
 * staff enrolling another user on an install where learners cannot. The forced
 * enrollment also bypasses a closed enrollment window, so it must stay out of the
 * self-enrollment request. No browser or target.
 */

const config = loadConfig({
  LMS_BASE_URL: 'https://lms.example.com',
  APPS_BASE_URL: 'https://apps.example.com',
});
const ENROLLMENT_URL = 'https://lms.example.com/api/enrollment/v1/enrollment';
const COURSE = 'course-v1:Org+Course+Run';

interface Post {
  readonly url: string;
  readonly data: unknown;
}

/** A request context that hands out a CSRF token and answers every POST with `status`. */
const recording = (posts: Post[], status = 200): APIRequestContext =>
  ({
    get: () =>
      Promise.resolve({
        ok: () => true,
        status: () => 200,
        url: () => 'https://lms.example.com/csrf/api/v1/token',
        json: () => Promise.resolve({ csrfToken: 'token' }),
        text: () => Promise.resolve(''),
      }),
    post: (url: string, options: { data?: unknown }) => {
      posts.push({ url, data: options.data });
      return Promise.resolve({
        ok: () => status >= 200 && status < 300,
        status: () => status,
        text: () => Promise.resolve('{"message":"An error occurred"}'),
      });
    },
  }) as unknown as APIRequestContext;

test.describe('enrollInCourseViaApi', { tag: '@unit' }, () => {
  test('asks for the caller’s own enrollment, never a forced one', async () => {
    const posts: Post[] = [];

    await enrollInCourseViaApi(recording(posts), config, COURSE, { mode: 'honor' });

    expect(posts).toEqual([
      { url: ENROLLMENT_URL, data: { course_details: { course_id: COURSE }, mode: 'honor' } },
    ]);
  });

  test('names the self-enrollment opt-out when the platform refuses with a 400', async () => {
    const refused = enrollInCourseViaApi(recording([], 400), config, COURSE);

    await expect(refused).rejects.toThrow(ApiError);
    await expect(refused).rejects.toThrow('"-self-enrollment"');
  });

  test('adds no opt-out hint to a refusal that is not a 400', async () => {
    const refused = enrollInCourseViaApi(recording([], 403), config, COURSE);

    await expect(refused).rejects.toThrow(`Could not enroll in "${COURSE}" (HTTP 403).`);
    await expect(refused).rejects.not.toThrow('self-enrollment');
  });
});

test.describe('forceEnrollUserViaApi', { tag: '@unit' }, () => {
  test('enrolls the named user with force_enrollment', async () => {
    const posts: Post[] = [];

    await forceEnrollUserViaApi(recording(posts), config, COURSE, 'learner-1');

    expect(posts).toEqual([
      {
        url: ENROLLMENT_URL,
        data: { user: 'learner-1', course_details: { course_id: COURSE }, force_enrollment: true },
      },
    ]);
  });

  test('passes the requested track on', async () => {
    const posts: Post[] = [];

    await forceEnrollUserViaApi(recording(posts), config, COURSE, 'learner-1', {
      mode: 'verified',
    });

    expect(posts[0]?.data).toMatchObject({ mode: 'verified', force_enrollment: true });
  });

  test('reports a refusal with the user and the course', async () => {
    await expect(
      forceEnrollUserViaApi(recording([], 403), config, COURSE, 'learner-1'),
    ).rejects.toThrow(`Could not enroll "learner-1" in "${COURSE}" as staff (HTTP 403).`);
  });
});
