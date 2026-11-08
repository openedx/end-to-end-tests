import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { ApiError, StudioSessionExpiredError, studioWriteHeaders } from '../../src/api';
import { loadConfig } from '../../src/config';

/**
 * What a Studio write's header fetch makes of Studio's CSRF endpoint turning the
 * request away. On an install that sends anonymous visitors to sign in, a gone
 * Studio session gets the same answer there as from the write itself, so it must
 * raise the same typed error for the session heals to run. No browser or target.
 */

const config = loadConfig({
  LMS_BASE_URL: 'https://lms.example.com',
  APPS_BASE_URL: 'https://apps.example.com',
  CMS_BASE_URL: 'https://studio.example.com',
});

/** A request context whose every `GET` answers `status` with an empty body. */
const answering = (status: number): APIRequestContext =>
  ({
    get: () =>
      Promise.resolve({
        ok: () => status >= 200 && status < 300,
        status: () => status,
        text: () => Promise.resolve(''),
      }),
  }) as unknown as APIRequestContext;

test.describe('studioWriteHeaders', { tag: '@unit' }, () => {
  for (const status of [302, 401]) {
    test(`reads a ${status} from Studio's CSRF endpoint as a gone Studio session`, async () => {
      await expect(studioWriteHeaders(answering(status), config)).rejects.toBeInstanceOf(
        StudioSessionExpiredError,
      );
    });
  }

  test('leaves any other failure a plain ApiError', async () => {
    const error: unknown = await studioWriteHeaders(answering(503), config).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(StudioSessionExpiredError);
  });
});
