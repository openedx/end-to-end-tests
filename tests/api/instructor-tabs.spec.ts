import { expect, test } from '@playwright/test';

import { expectedInstructorTabs, type InstructorTabConditions } from '../../src/steps';

const none: InstructorTabConditions = {
  dataResearcher: false,
  hasOra: false,
  emailEnabled: false,
  specialExams: false,
  aspects: false,
};

// The per-viewer sets measured on local `main` (2026-09-24).
test.describe('expected instructor dashboard tabs', { tag: '@unit' }, () => {
  test('an instructor sees the course tools, tolerating Certificates', () => {
    const tabs = expectedInstructorTabs('instructor', { ...none, hasOra: true });
    expect(tabs.required).toEqual([
      'course_info',
      'enrollments',
      'course_team',
      'grading',
      'date_extensions',
      'open_responses',
      'cohorts',
    ]);
    expect(Object.keys(tabs.tolerated)).toEqual(['certificates']);
  });

  test('staff and limited staff see neither Course Team nor Date Extensions', () => {
    for (const viewer of ['staff', 'limitedStaff'] as const) {
      const tabs = expectedInstructorTabs(viewer, { ...none, hasOra: true, emailEnabled: true });
      expect(tabs.required).toEqual([
        'course_info',
        'enrollments',
        'grading',
        'open_responses',
        'cohorts',
        'bulk_email',
      ]);
      expect(tabs.tolerated).toEqual({});
    }
  });

  test('a staff Discussion Admin also sees Course Team', () => {
    expect(expectedInstructorTabs('staffDiscussionAdmin', none).required).toContain('course_team');
  });

  test('deployment options add their tabs', () => {
    const tabs = expectedInstructorTabs('instructor', {
      ...none,
      dataResearcher: true,
      specialExams: true,
      aspects: true,
    });
    expect(tabs.required).toEqual(
      expect.arrayContaining(['data_downloads', 'special_exams', 'aspects']),
    );
  });
});
