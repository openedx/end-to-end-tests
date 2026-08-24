import { test, expect } from '@playwright/test';

import { TEST_ID_ANNOTATION_TYPE, testId, testIdsFromAnnotations } from '../../src/reporting';

test.describe('testId', { tag: '@unit' }, () => {
  test('builds a well-formed annotation', () => {
    expect(testId('TC-00003')).toEqual({
      type: TEST_ID_ANNOTATION_TYPE,
      description: 'TC-00003',
    });
  });

  test('rejects a malformed id', () => {
    expect(() => testId('TC-3')).toThrow(/Invalid BTR test_id/);
    expect(() => testId('00003')).toThrow(/Invalid BTR test_id/);
    expect(() => testId('tc-00003')).toThrow(/Invalid BTR test_id/);
  });
});

test.describe('testIdsFromAnnotations', { tag: '@unit' }, () => {
  test('extracts only test_id descriptions', () => {
    const ids = testIdsFromAnnotations([
      { type: 'test_id', description: 'TC-00002' },
      { type: 'issue', description: 'https://example.com/123' },
      { type: 'test_id', description: 'TC-00003' },
    ]);
    expect(ids).toEqual(['TC-00002', 'TC-00003']);
  });

  test('returns an empty list when there are no test_id annotations', () => {
    expect(testIdsFromAnnotations([{ type: 'tag', description: '@smoke' }])).toEqual([]);
  });

  test('ignores test_id annotations without a description', () => {
    expect(testIdsFromAnnotations([{ type: 'test_id' }])).toEqual([]);
  });
});
