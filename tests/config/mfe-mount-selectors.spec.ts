import { test, expect } from '@playwright/test';

import {
  STUDIO_PAGES_RESOURCES_SELECTORS,
  instructorTabLink,
  instructorTabPath,
} from '../../src/config';

/**
 * Selectors and paths built from where an MFE is mounted (`mfeUrls`). Pure: no
 * browser, no network.
 */

const courseKey = 'course-v1:OpenedX+E2E+2026';

test.describe('instructorTabPath', { tag: '@unit' }, () => {
  test('is under the stock mount by default', () => {
    expect(instructorTabPath(courseKey, 'grading')).toBe(
      `/instructor-dashboard/${courseKey}/grading`,
    );
  });

  test('is under the mount it is given, renamed or at an origin root', () => {
    expect(instructorTabPath(courseKey, 'grading', '/instructor')).toBe(
      `/instructor/${courseKey}/grading`,
    );
    expect(instructorTabPath(courseKey, undefined, '')).toBe(`/${courseKey}`);
  });
});

test.describe('instructorTabLink', { tag: '@unit' }, () => {
  test('matches the tab under the mount it is given, with or without a trailing slash', () => {
    expect(instructorTabLink(courseKey, 'aspects', '/instructor')).toBe(
      `#instructor-nav a.nav-link[href$="/instructor/${courseKey}/aspects"], ` +
        `#instructor-nav a.nav-link[href$="/instructor/${courseKey}/aspects/"]`,
    );
  });
});

test.describe('Pages & Resources "View live" link', { tag: '@unit' }, () => {
  test('starts with the learning MFE URL, so a root mount matches no authoring link', () => {
    expect(STUDIO_PAGES_RESOURCES_SELECTORS.viewLiveLink('http://learning.local.openedx.io')).toBe(
      'a[href^="http://learning.local.openedx.io/course/"]',
    );
  });
});
