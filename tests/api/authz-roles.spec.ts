import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { listRoles } from '../../src/api';
import { loadConfig } from '../../src/config';

/**
 * Pure unit tests for the role-catalog request `listRoles` makes. No browser or
 * target. openedx-authz 1.x reads `scope=<key>` and 2.x (openedx-authz#510) only
 * `scope_types=<lib|course-v1>`, answering 400 without it, so the request has to
 * carry both for one client to serve every release.
 */
const config = loadConfig({
  LMS_BASE_URL: 'http://local.openedx.io',
  APPS_BASE_URL: 'http://apps.local.openedx.io',
});

/** A request context whose every `GET` answers `body` with `status`, recording the URLs. */
function stubContext(status: number, body: unknown) {
  const urls: string[] = [];
  const request = {
    get: (url: string) => {
      urls.push(url);
      return Promise.resolve({
        ok: () => status >= 200 && status < 300,
        status: () => status,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
    },
  } as unknown as APIRequestContext;
  return { request, urls };
}

const page = (results: unknown[]) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});

test.describe('listRoles', { tag: '@unit' }, () => {
  test('names the scope type for 2.x and the scope for 1.x', async () => {
    const { request, urls } = stubContext(200, page([]));

    await listRoles(request, config, 'lib:OpenedX:LIB1');
    await listRoles(request, config, 'course-v1:OpenedX+E2E+run');

    const queries = urls.map((url) => new URL(url).searchParams);
    expect(queries.map((query) => query.get('scope_types'))).toEqual(['lib', 'course-v1']);
    // The course key's `+` survives the query string rather than decoding to a space.
    expect(queries.map((query) => query.get('scope'))).toEqual([
      'lib:OpenedX:LIB1',
      'course-v1:OpenedX+E2E+run',
    ]);
    expect(urls[0]).toMatch(/^http:\/\/local\.openedx\.io\/api\/authz\/v1\/roles\/\?/);
  });

  test('reads the roles out of a 2.x catalog envelope', async () => {
    const { request } = stubContext(200, {
      ...page([
        {
          role: 'library_admin',
          display_name: 'Library Admin',
          description: '',
          icon: null,
          definition_kind: 'static',
          permissions: ['content_libraries.manage_library_team', 'content_libraries.view_library'],
          scope_types: ['lib'],
        },
      ]),
      scope_types: ['lib'],
      categories: [],
      permissions: [],
    });

    expect(await listRoles(request, config, 'lib:OpenedX:LIB1')).toEqual([
      {
        role: 'library_admin',
        permissions: ['content_libraries.manage_library_team', 'content_libraries.view_library'],
      },
    ]);
  });

  test('reads the roles out of a 1.x page', async () => {
    const { request } = stubContext(
      200,
      page([
        { role: 'library_user', permissions: ['content_libraries.view_library'], user_count: 2 },
      ]),
    );

    expect(await listRoles(request, config, 'lib:OpenedX:LIB1')).toEqual([
      { role: 'library_user', permissions: ['content_libraries.view_library'] },
    ]);
  });

  test('reports a refusal with its status', async () => {
    const { request } = stubContext(403, { detail: 'denied' });

    await expect(listRoles(request, config, 'lib:OpenedX:LIB1')).rejects.toMatchObject({
      status: 403,
    });
  });
});
