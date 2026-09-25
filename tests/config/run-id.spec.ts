import { test, expect } from '@playwright/test';

import { ciResultLabels, parseRunIdSuffix } from '../../src/config';

/** The run-id suffix CI sets per shard (`RUN_ID_SUFFIX`). */
test.describe('parseRunIdSuffix', { tag: '@unit' }, () => {
  test('treats an unset or empty suffix as none', () => {
    expect(parseRunIdSuffix(undefined)).toBe('');
    expect(parseRunIdSuffix('')).toBe('');
  });

  test('accepts up to three lowercase letters or digits', () => {
    expect(parseRunIdSuffix('d1')).toBe('d1');
    expect(parseRunIdSuffix('x12')).toBe('x12');
  });

  test('rejects characters a course number or org name cannot carry', () => {
    expect(() => parseRunIdSuffix('d-1')).toThrow(/RUN_ID_SUFFIX/);
    expect(() => parseRunIdSuffix('D1')).toThrow(/RUN_ID_SUFFIX/);
  });

  test('rejects a suffix longer than three characters', () => {
    expect(() => parseRunIdSuffix('d100')).toThrow(/RUN_ID_SUFFIX/);
  });
});

/** The labels every result carries into a merged report (`CI_PROFILE`, `RUN_ID_SUFFIX`). */
test.describe('ciResultLabels', { tag: '@unit' }, () => {
  test('is empty outside CI', () => {
    expect(ciResultLabels({})).toEqual({ shard: '', profile: '' });
  });

  test('reads the shard and the profile', () => {
    expect(ciResultLabels({ RUN_ID_SUFFIX: 'x1', CI_PROFILE: 'extended' })).toEqual({
      shard: 'x1',
      profile: 'extended',
    });
  });

  test('rejects a profile that is not a profile name', () => {
    expect(() => ciResultLabels({ CI_PROFILE: 'Extended profile' })).toThrow(/CI_PROFILE/);
  });
});
