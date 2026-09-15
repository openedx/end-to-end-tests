import { expect, test } from '@playwright/test';

import type { AppConfig } from '../../src/config';
import { instructorApiBase, resolveReportUrl } from '../../src/api';

const config = { baseUrls: { lms: 'http://lms.example.test' } } as unknown as AppConfig;

test.describe('instructor API client helpers', { tag: '@unit' }, () => {
  test('resolves a relative report URL against the LMS origin', () => {
    expect(resolveReportUrl(config, '/media/grades/abc/report.csv')).toBe(
      'http://lms.example.test/media/grades/abc/report.csv',
    );
  });

  test('leaves an absolute (object-storage) report URL alone', () => {
    const absolute = 'https://bucket.s3.amazonaws.com/grades/report.csv?sig=1';
    expect(resolveReportUrl(config, absolute)).toBe(absolute);
  });

  test('builds the v2 course base URL without encoding the course key', () => {
    expect(instructorApiBase(config, 'course-v1:Org+Num+Run')).toBe(
      'http://lms.example.test/api/instructor/v2/courses/course-v1:Org+Num+Run',
    );
  });
});
