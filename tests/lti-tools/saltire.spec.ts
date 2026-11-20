import { test, expect } from '@playwright/test';

import { loadLtiToolProviderPlugin } from '../../src/lti-tools';
import {
  contentItemFromResponseBody,
  idTokenFromRawParameters,
  jwtPayload,
  saltireBaseUrlFromEnv,
} from '../../plugins/saltire.plugin';

/**
 * The saLTIre provider's pure parts: its settings, and reading what saLTIre's
 * pages and deep-linking answers carry. No browser, no network.
 */

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (payload: unknown) => `${b64({ alg: 'RS256' })}.${b64(payload)}.c2ln`;

test.describe('saLTIre provider', { tag: '@unit' }, () => {
  test('defaults to the public saLTIre and accepts only https', () => {
    expect(saltireBaseUrlFromEnv({})).toBe('https://saltire.lti.app');
    expect(saltireBaseUrlFromEnv({ SALTIRE_BASE_URL: 'https://tool.example.com/x' })).toBe(
      'https://tool.example.com',
    );
    expect(() => saltireBaseUrlFromEnv({ SALTIRE_BASE_URL: 'http://tool.example.com' })).toThrow(
      /must be https/,
    );
    expect(() => saltireBaseUrlFromEnv({ SALTIRE_BASE_URL: 'not a url' })).toThrow(/absolute URL/);
  });

  test('reads the id_token from the launch page, and its claims', () => {
    const token = jwt({ iss: 'https://lms.test', sub: 'u1' });
    const raw = `id_token=${token}\nstate=abc`;
    expect(idTokenFromRawParameters(raw)).toBe(token);
    expect(jwtPayload(token)).toEqual({ iss: 'https://lms.test', sub: 'u1' });
    expect(idTokenFromRawParameters('state=abc')).toBeUndefined();
  });

  test('reads the resource a deep-linking answer returned', () => {
    const answer = jwt({
      'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [
        { type: 'ltiResourceLink', url: 'https://saltire.lti.app/tool', custom: { page: '103' } },
      ],
    });
    expect(contentItemFromResponseBody(new URLSearchParams({ JWT: answer }).toString())).toEqual({
      url: 'https://saltire.lti.app/tool',
      custom: { page: '103' },
    });
    expect(contentItemFromResponseBody('nothing=here')).toBeUndefined();
  });

  test('loads as a plugin with every feature', async () => {
    const provider = await loadLtiToolProviderPlugin('./plugins/saltire.plugin.ts');
    expect(provider.name).toBe('saltire');
    expect([...provider.features].sort()).toEqual(['claims', 'deep-linking', 'inline', 'services']);
  });
});
