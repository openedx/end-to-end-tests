import { test, expect } from '@playwright/test';

import { loadConfig } from '../../src/config';
import { chromeConfigSourceFor } from '../../src/steps';

/**
 * Which MFE a legacy page's chrome reads its configuration for, derived from the
 * page URL. Pure: no browser, no network.
 */

const stock = loadConfig({
  LMS_BASE_URL: 'http://local.openedx.io',
  APPS_BASE_URL: 'http://apps.local.openedx.io',
});

const learningAtRoot = loadConfig({
  LMS_BASE_URL: 'http://local.openedx.io',
  APPS_BASE_URL: 'http://apps.local.openedx.io',
  LEARNING_MFE_URL: 'http://learning.local.openedx.io/',
});

const learningOnLms = loadConfig({
  LMS_BASE_URL: 'http://local.openedx.io',
  APPS_BASE_URL: 'http://local.openedx.io',
  LEARNING_MFE_URL: 'http://local.openedx.io/learn',
});

test.describe('chromeConfigSourceFor', { tag: '@unit' }, () => {
  test('names a stock MFE by its first path segment on the apps origin', () => {
    expect(
      chromeConfigSourceFor('legacy', 'http://apps.local.openedx.io/learning/course/x/home', stock),
    ).toEqual({ kind: 'legacy', mfe: 'learning' });
    expect(
      chromeConfigSourceFor('legacy', 'http://apps.local.openedx.io/profile/u/someone', stock),
    ).toEqual({ kind: 'legacy', mfe: 'profile' });
  });

  test('names the learning MFE "learning" wherever LEARNING_MFE_URL mounts it', () => {
    expect(
      chromeConfigSourceFor('legacy', 'http://local.openedx.io/learn/course/x/home', learningOnLms),
    ).toEqual({ kind: 'legacy', mfe: 'learning' });
  });

  test('does not mistake a path that only starts with the mount for it', () => {
    expect(
      chromeConfigSourceFor('legacy', 'http://local.openedx.io/learner/x', learningOnLms),
    ).toEqual({ kind: 'legacy', mfe: 'learner' });
  });

  test('names the learning MFE "learning" when it is served from an origin root', () => {
    expect(
      chromeConfigSourceFor(
        'legacy',
        'http://learning.local.openedx.io/course/x/home',
        learningAtRoot,
      ),
    ).toEqual({ kind: 'legacy', mfe: 'learning' });
  });
});
