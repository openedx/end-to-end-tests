import { existsSync, readFileSync } from 'node:fs';

import { test, expect } from '@playwright/test';

import {
  ProfileError,
  parseProfiles,
  pluginName,
  resolveCapabilities,
  shardMatrix,
} from '../../scripts/ci-profiles/profiles.mts';
import { CAPABILITY_OPT_OUT_PREFIX, isCapability } from '../../src/config';

/**
 * The CI profile rules (`.ci/profiles.json`, read by `scripts/ci-profiles.mts`
 * for `run_tests_tutor.yml`), and the real file checked against the capability
 * vocabulary the script itself cannot load.
 */

const PLUGIN = '.ci/tutor/e2e_base.py';
const always = () => true;

function profile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    description: 'test profile',
    code: 'd',
    tutorPlugins: [PLUGIN],
    capabilities: { add: [], remove: [] },
    shards: 1,
    ...overrides,
  };
}

test.describe('parseProfiles', { tag: '@unit' }, () => {
  test('accepts the repository file, with only known capabilities', () => {
    const json: unknown = JSON.parse(readFileSync('.ci/profiles.json', 'utf8'));
    const profiles = parseProfiles(json, existsSync, isCapability);
    expect(profiles.map((p) => p.name)).toContain('default');
  });

  test('requires a default profile', () => {
    expect(() => parseProfiles({ extended: profile() }, always)).toThrow(/"default" profile/);
  });

  test('rejects unknown keys, so a misspelt setting is not silently ignored', () => {
    expect(() => parseProfiles({ default: profile({ shard: 2 }) }, always)).toThrow(
      /unknown key\(s\): shard/,
    );
  });

  test('rejects a shared profile code, which would repeat run-id suffixes', () => {
    expect(() =>
      parseProfiles({ default: profile(), extended: profile({ code: 'd' }) }, always),
    ).toThrow(/reuses code "d"/);
  });

  test('rejects a shard count outside 1–20', () => {
    for (const shards of [0, 21, 1.5]) {
      expect(() => parseProfiles({ default: profile({ shards }) }, always)).toThrow(ProfileError);
    }
  });

  test('rejects a missing Tutor plugin file', () => {
    expect(() => parseProfiles({ default: profile() }, () => false)).toThrow(/does not exist/);
  });

  test('rejects a plugin file Tutor could not enable by name', () => {
    expect(() =>
      parseProfiles({ default: profile({ tutorPlugins: ['.ci/tutor/e2e-base.py'] }) }, always),
    ).toThrow(/Python module name/);
  });

  test('rejects an unknown capability, with or without the opt-out prefix', () => {
    for (const name of ['no-such-thing', `${CAPABILITY_OPT_OUT_PREFIX}no-such-thing`]) {
      expect(() =>
        parseProfiles(
          { default: profile({ capabilities: { add: [name], remove: [] } }) },
          always,
          isCapability,
        ),
      ).toThrow(/unknown capability/);
    }
  });
});

test.describe('pluginName', { tag: '@unit' }, () => {
  test('is the file name without .py', () => {
    expect(pluginName('.ci/tutor/e2e_base.py')).toBe('e2e_base');
  });
});

test.describe('shardMatrix', { tag: '@unit' }, () => {
  const profiles = parseProfiles(
    { default: profile({ shards: 2 }), extended: profile({ code: 'x' }) },
    always,
  );

  test('expands each selected profile into its shards, with run-id suffixes', () => {
    const shared = { capabilities: 'notes', tutorPlugins: [PLUGIN] };
    expect(shardMatrix(profiles, ['default', 'extended'], 'notes')).toEqual([
      { profile: 'default', shard: 1, shards: 2, runIdSuffix: 'd1', ...shared },
      { profile: 'default', shard: 2, shards: 2, runIdSuffix: 'd2', ...shared },
      { profile: 'extended', shard: 1, shards: 1, runIdSuffix: 'x1', ...shared },
    ]);
  });

  test("applies each profile's capability delta to the release's list", () => {
    const withDelta = parseProfiles(
      { default: profile({ capabilities: { add: ['teams'], remove: ['notes'] } }) },
      always,
    );
    expect(shardMatrix(withDelta, ['default'], 'notes,wiki')[0]?.capabilities).toBe('wiki,teams');
  });

  test('ignores blanks and repeats in the selection', () => {
    expect(shardMatrix(profiles, ['', 'extended', ' extended '], '')).toHaveLength(1);
  });

  test('rejects an empty selection or an unknown profile', () => {
    expect(() => shardMatrix(profiles, [''], '')).toThrow(/at least one/);
    expect(() => shardMatrix(profiles, ['aspects'], '')).toThrow(/Unknown profile "aspects"/);
  });
});

test.describe('resolveCapabilities', { tag: '@unit' }, () => {
  test('leaves the release list alone for an empty delta', () => {
    expect(resolveCapabilities('-frontend-base,notes', { add: [], remove: [] })).toBe(
      '-frontend-base,notes',
    );
  });

  test('removes exact entries and appends additions once', () => {
    expect(resolveCapabilities('notes, wiki', { add: ['wiki', 'teams'], remove: ['notes'] })).toBe(
      'wiki,teams',
    );
  });

  test('adding a capability lifts its opt-out, and adding an opt-out drops it', () => {
    expect(
      resolveCapabilities('-frontend-base,notes', { add: ['frontend-base'], remove: [] }),
    ).toBe('notes,frontend-base');
    expect(resolveCapabilities('notes,wiki', { add: ['-notes'], remove: [] })).toBe('wiki,-notes');
  });
});
