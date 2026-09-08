import { test, expect } from '@playwright/test';

import { CAPABILITIES, DEFAULT_ON_CAPABILITIES, missingCapabilities } from '../../src/config';
import type { Capability } from '../../src/config';

/**
 * The capability gate's decision function. `src/fixtures/` applies it to every
 * spec's tags, so keeping it pure keeps the rule testable without a browser or a
 * target.
 */

const enabled = (...capabilities: Capability[]) => new Set<Capability>(capabilities);

test.describe('missingCapabilities', { tag: '@unit' }, () => {
  test('ignores tags that are not capabilities', () => {
    expect(missingCapabilities(['@smoke', '@authenticated', '@mfe-account'], enabled())).toEqual(
      [],
    );
  });

  test('reports a capability tag the installation has not enabled', () => {
    expect(missingCapabilities(['@regression', '@discussions'], enabled())).toEqual([
      'discussions',
    ]);
  });

  test('passes a capability tag the installation has enabled', () => {
    expect(missingCapabilities(['@discussions'], enabled('discussions'))).toEqual([]);
  });

  test('reports every missing capability, once each', () => {
    const missing = missingCapabilities(
      ['@discussions', '@teams', '@discussions'],
      enabled('teams'),
    );

    expect(missing).toEqual(['discussions']);
  });

  test('accepts bare names as well as @-prefixed tags', () => {
    expect(missingCapabilities(['discussions'], enabled())).toEqual(['discussions']);
  });

  test('every default-on capability is a known capability', () => {
    for (const capability of DEFAULT_ON_CAPABILITIES) {
      expect(CAPABILITIES).toContain(capability);
    }
  });
});
