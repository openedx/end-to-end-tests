import { existsSync, readFileSync } from 'node:fs';

import { test, expect } from '@playwright/test';

import {
  ProfileError,
  deltaGrep,
  findProfile,
  parseProfiles,
  pluginName,
  resolveCapabilities,
  shardMatrix,
  type ReleaseInfo,
} from '../../scripts/ci-profiles/profiles.mts';
import {
  CAPABILITY_OPT_OUT_PREFIX,
  isCapability,
  parseCapabilities,
  type Capability,
} from '../../src/config';

/**
 * The CI profile rules (`.ci/profiles.json`, read by `scripts/ci-profiles.mts`
 * for `run_tests_tutor.yml`), and the real file checked against the capability
 * vocabulary the script itself cannot load.
 */

const PLUGIN = '.ci/tutor/e2e_base.py';
const always = () => true;

function release(capabilities: string, name = 'verawood'): ReleaseInfo {
  return { name, capabilities, tutorConstraint: '>=22.0.0,<23.0.0' };
}

const CODEJAIL = {
  pip: 'tutor-contrib-codejail',
  plugin: 'codejail',
  init: true,
  capability: 'codejail',
  releases: ['verawood'],
};

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

  test('every profile selects tests on every release of the repository', () => {
    // A delta profile that un-skips nothing on some release would fail its plan job.
    const profiles = parseProfiles(
      JSON.parse(readFileSync('.ci/profiles.json', 'utf8')),
      existsSync,
      isCapability,
    );
    const releases = JSON.parse(readFileSync('.ci/openedx-releases.json', 'utf8')) as Record<
      string,
      { tutorConstraint: string; capabilities: string }
    >;
    for (const [name, entry] of Object.entries(releases)) {
      const matrix = shardMatrix(
        profiles,
        profiles.map((p) => p.name),
        { name, ...entry },
      );
      expect(matrix.length, name).toBeGreaterThan(0);
    }
  });

  test('every job declares a valid capability list, and a delta profile selects all it gains', () => {
    const profiles = parseProfiles(
      JSON.parse(readFileSync('.ci/profiles.json', 'utf8')),
      existsSync,
      isCapability,
    );
    const releases = JSON.parse(readFileSync('.ci/openedx-releases.json', 'utf8')) as Record<
      string,
      { tutorConstraint: string; capabilities: string }
    >;
    const enabled = (list: string, where: string) => {
      const issues: string[] = [];
      const set = parseCapabilities(list, issues);
      expect(issues, where).toEqual([]);
      return set;
    };
    for (const [name, entry] of Object.entries(releases)) {
      const matrix = shardMatrix(
        profiles,
        profiles.map((p) => p.name),
        { name, ...entry },
      );
      const defaults = enabled(matrix.find((m) => m.profile === 'default')!.capabilities, name);
      for (const job of matrix.filter((m) => m.grep !== '')) {
        const gained = [...enabled(job.capabilities, `${name} ${job.profile}`)].filter(
          (c) => !defaults.has(c),
        );
        const named = (/^@\(\?:(.*)\)\(/.exec(job.grep)?.[1] ?? '').split('|');
        // Every capability the profile gains is selected. The grep works from
        // declarations, so it may also name one default already has on by default,
        // which only re-runs tests the merge then counts once.
        expect(named, `${name} ${job.profile}`).toEqual(expect.arrayContaining(gained));
        for (const extra of named.filter((c) => !(gained as string[]).includes(c))) {
          expect(defaults.has(extra as Capability), `${name} ${job.profile}: ${extra}`).toBe(true);
        }
      }
    }
  });

  test('rejects a delta default profile, a bad selection and a missing seed script', () => {
    expect(() => parseProfiles({ default: profile({ select: 'delta' }) }, always)).toThrow(
      /whole suite/,
    );
    expect(() => parseProfiles({ default: profile({ select: 'some' }) }, always)).toThrow(
      /"all" or "delta"/,
    );
    expect(() =>
      parseProfiles(
        { default: profile({ seedScripts: ['.ci/seed/none.sh'] }) },
        (path) => path === PLUGIN,
      ),
    ).toThrow(/seed script ".ci\/seed\/none.sh" does not exist/);
  });

  test('rejects a Tutor extension without its releases or with an unknown key', () => {
    expect(() =>
      parseProfiles(
        { default: profile({ tutorExtensions: [{ ...CODEJAIL, releases: [] }] }) },
        always,
      ),
    ).toThrow(/releases it supports/);
    expect(() =>
      parseProfiles(
        { default: profile({ tutorExtensions: [{ ...CODEJAIL, version: '22' }] }) },
        always,
      ),
    ).toThrow(/unknown key\(s\): version/);
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
    const shared = {
      capabilities: 'notes',
      tutorPlugins: [PLUGIN],
      tutorPip: [],
      tutorEnable: [],
      tutorInit: [],
      seedScripts: [],
      grep: '',
    };
    expect(shardMatrix(profiles, ['default', 'extended'], release('notes'))).toEqual([
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
    expect(shardMatrix(withDelta, ['default'], release('notes,wiki'))[0]?.capabilities).toBe(
      'wiki,teams',
    );
  });

  test('installs an extension, and declares its capability, only where the release has it', () => {
    const withCodejail = parseProfiles(
      {
        default: profile(),
        extended: profile({ code: 'x', tutorExtensions: [CODEJAIL], select: 'delta' }),
      },
      always,
    );
    const [verawood] = shardMatrix(withCodejail, ['extended'], release('notes'));
    expect(verawood).toMatchObject({
      capabilities: 'notes,codejail',
      tutorPip: ['tutor-contrib-codejail>=22.0.0,<23.0.0'],
      tutorEnable: ['codejail'],
      tutorInit: ['codejail'],
      grep: '@(?:codejail)(?![\\w-])',
    });
    // On main the extension is left out, so the profile un-skips nothing there.
    expect(() => shardMatrix(withCodejail, ['extended'], release('notes', 'main'))).toThrow(
      /declares no capability the default profile lacks on main/,
    );
  });

  test('ignores blanks and repeats in the selection', () => {
    expect(shardMatrix(profiles, ['', 'extended', ' extended '], release(''))).toHaveLength(1);
  });

  test('rejects an empty selection or an unknown profile', () => {
    expect(() => shardMatrix(profiles, [''], release(''))).toThrow(/at least one/);
    expect(() => shardMatrix(profiles, ['aspects'], release(''))).toThrow(
      /Unknown profile "aspects"/,
    );
  });
});

test.describe('deltaGrep', { tag: '@unit' }, () => {
  const profiles = parseProfiles(
    {
      default: profile(),
      extended: profile({
        code: 'x',
        select: 'delta',
        capabilities: { add: ['rbac-global', 'support-url'], remove: ['no-support-url'] },
      }),
    },
    always,
  );
  const grep = new RegExp(
    deltaGrep(
      findProfile(profiles, 'extended'),
      findProfile(profiles, 'default'),
      release('rbac,no-support-url'),
    ),
  );

  test('selects tests tagged with a capability only the profile declares', () => {
    expect(grep.test('console link @regression @rbac-global')).toBe(true);
    expect(grep.test('points at SUPPORT_URL @support-url @mfe-learning')).toBe(true);
  });

  test('does not select what default already runs, or a longer tag with the same start', () => {
    expect(grep.test('roles @rbac')).toBe(false);
    expect(grep.test('absent @no-support-url')).toBe(false);
    expect(grep.test('other @support-url-extra')).toBe(false);
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
