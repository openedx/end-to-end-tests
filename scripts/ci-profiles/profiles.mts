/**
 * CI test profiles (`.ci/profiles.json`): each is a named Tutor configuration
 * plus a capability delta, run against one release and split into shards. The
 * `plan` job of `run_tests_tutor.yml` expands the selected profiles into its
 * job matrix; each matrix job resolves its Tutor plugins and capabilities from
 * here. Pure, so the rules are unit-tested without a workflow.
 */

/**
 * Mirrors `CAPABILITY_OPT_OUT_PREFIX` in `src/config/capabilities.ts`. Node's
 * type stripping cannot load that module from a script at run time, so the
 * capability vocabulary is passed in (`parseProfiles`' `isCapability`) by the
 * unit test, which can import it.
 */
const CAPABILITY_OPT_OUT_PREFIX = '-';

export interface CapabilityDelta {
  /** Appended to the release's list; `-x` opts out of a default-on capability. */
  readonly add: readonly string[];
  /** Dropped from the release's list, matched exactly (`x` or `-x`). */
  readonly remove: readonly string[];
}

/**
 * A published Tutor plugin a profile installs, where a release has one. It
 * brings its capability only on those releases, so a profile can use an
 * optional service that some Tutor lines lack (`tutor-contrib-codejail` stops
 * at the Verawood line).
 */
export interface TutorExtension {
  /** The pip package; installed with the release's Tutor constraint, e.g. `>=22.0.0,<23.0.0`. */
  readonly pip: string;
  /** The Tutor plugin name to enable. */
  readonly plugin: string;
  /** Whether it has a `tutor local do init --limit <plugin>` task to run after enabling. */
  readonly init: boolean;
  /** The capability it makes true on the target. */
  readonly capability: string;
  /** Releases (keys of `.ci/openedx-releases.json`) the package supports. */
  readonly releases: readonly string[];
}

/** Which tests a profile's jobs run. */
export type Selection =
  /** The whole suite (sharded); undeclared capabilities skip as usual. */
  | 'all'
  /**
   * Only tests tagged with a capability this profile declares and the
   * `default` profile does not: the cases the profile exists to un-skip. The
   * release merge reports them from here and everything else from `default`.
   */
  | 'delta';

export interface Profile {
  readonly name: string;
  readonly description: string;
  /** One lowercase letter; with the shard number it forms the run-id suffix. */
  readonly code: string;
  /** Tutor plugin files (repository paths), each enabled by its file name. */
  readonly tutorPlugins: readonly string[];
  readonly tutorExtensions: readonly TutorExtension[];
  /** Scripts run on the runner after the install is provisioned, to seed content. */
  readonly seedScripts: readonly string[];
  readonly capabilities: CapabilityDelta;
  readonly select: Selection;
  /** How many shards (matrix jobs, each with its own Tutor stack) run the profile. */
  readonly shards: number;
}

/** What `shardMatrix` needs of a release (an entry of `.ci/openedx-releases.json`). */
export interface ReleaseInfo {
  readonly name: string;
  /** Comma-separated capabilities (possibly a dispatch override of the release's list). */
  readonly capabilities: string;
  /** The Tutor version constraint, e.g. `>=22.0.0,<23.0.0`; empty for `main`. */
  readonly tutorConstraint: string;
}

export interface MatrixEntry {
  readonly profile: string;
  readonly shard: number;
  readonly shards: number;
  /** `RUN_ID_SUFFIX` for the job: profile code + shard number, e.g. `d2`. */
  readonly runIdSuffix: string;
  /** The release's capabilities with the profile's delta (and its extensions') applied. */
  readonly capabilities: string;
  readonly tutorPlugins: readonly string[];
  /** Pip requirements for the profile's extensions on this release, constraint applied. */
  readonly tutorPip: readonly string[];
  /** Extension plugins to enable, and those with an init task to run. */
  readonly tutorEnable: readonly string[];
  readonly tutorInit: readonly string[];
  readonly seedScripts: readonly string[];
  /** A `--grep` limiting the job to the profile's selection; empty for `select: all`. */
  readonly grep: string;
}

export class ProfileError extends Error {}

const KNOWN_KEYS = new Set([
  'description',
  'code',
  'tutorPlugins',
  'tutorExtensions',
  'seedScripts',
  'capabilities',
  'select',
  'shards',
]);
const EXTENSION_KEYS = new Set(['pip', 'plugin', 'init', 'capability', 'releases']);
/** Two digits of shard number plus the code keep the suffix within its three characters. */
const MAX_SHARDS = 20;

function stringList(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) {
    throw new ProfileError(`${where} must be a list of strings.`);
  }
  return value;
}

function checkCapabilityNames(
  names: readonly string[],
  where: string,
  isCapability: (name: string) => boolean,
): void {
  for (const name of names) {
    const bare = name.startsWith(CAPABILITY_OPT_OUT_PREFIX) ? name.slice(1) : name;
    if (!isCapability(bare)) {
      throw new ProfileError(`${where} names an unknown capability "${name}".`);
    }
  }
}

/**
 * Parses and validates the profiles file. `fileExists` checks the Tutor plugin
 * paths and `isCapability` the capability names, so a typo fails the `checks`
 * job instead of a provisioning step. The CLI cannot load the capability list
 * and accepts any name; the unit test over the real file checks them.
 */
export function parseProfiles(
  json: unknown,
  fileExists: (path: string) => boolean,
  isCapability: (name: string) => boolean = () => true,
): readonly Profile[] {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new ProfileError('The profiles file must be an object keyed by profile name.');
  }
  const profiles: Profile[] = [];
  const codes = new Map<string, string>();
  for (const [name, raw] of Object.entries(json as Record<string, unknown>)) {
    const where = `Profile "${name}"`;
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      throw new ProfileError(`${where}: names are lowercase letters, digits and dashes.`);
    }
    if (typeof raw !== 'object' || raw === null) {
      throw new ProfileError(`${where} must be an object.`);
    }
    const entry = raw as Record<string, unknown>;
    const unknown = Object.keys(entry).filter((key) => !KNOWN_KEYS.has(key));
    if (unknown.length > 0) {
      throw new ProfileError(`${where} has unknown key(s): ${unknown.join(', ')}.`);
    }

    const { description, code, shards } = entry;
    if (typeof description !== 'string' || description === '') {
      throw new ProfileError(`${where} needs a description.`);
    }
    if (typeof code !== 'string' || !/^[a-z]$/.test(code)) {
      throw new ProfileError(`${where}: code must be one lowercase letter.`);
    }
    const clash = codes.get(code);
    if (clash) {
      throw new ProfileError(`${where} reuses code "${code}" of profile "${clash}".`);
    }
    codes.set(code, name);
    if (
      typeof shards !== 'number' ||
      !Number.isInteger(shards) ||
      shards < 1 ||
      shards > MAX_SHARDS
    ) {
      throw new ProfileError(`${where}: shards must be an integer from 1 to ${MAX_SHARDS}.`);
    }

    const tutorPlugins = stringList(entry.tutorPlugins, `${where}: tutorPlugins`);
    if (tutorPlugins.length === 0) {
      throw new ProfileError(`${where} must list at least one Tutor plugin.`);
    }
    const stems = new Set<string>();
    for (const plugin of tutorPlugins) {
      if (!/^[\w./-]+\/[a-z][a-z0-9_]*\.py$/.test(plugin)) {
        throw new ProfileError(
          `${where}: Tutor plugin "${plugin}" must be a .py path whose name is a Python module name.`,
        );
      }
      if (!fileExists(plugin)) {
        throw new ProfileError(`${where}: Tutor plugin "${plugin}" does not exist.`);
      }
      const stem = pluginName(plugin);
      if (stems.has(stem)) {
        throw new ProfileError(`${where} lists two Tutor plugins named "${stem}".`);
      }
      stems.add(stem);
    }

    if (typeof entry.capabilities !== 'object' || entry.capabilities === null) {
      throw new ProfileError(`${where} needs capabilities: { add: [], remove: [] }.`);
    }
    const delta = entry.capabilities as Record<string, unknown>;
    const add = stringList(delta.add ?? [], `${where}: capabilities.add`);
    const remove = stringList(delta.remove ?? [], `${where}: capabilities.remove`);
    checkCapabilityNames(add, `${where}: capabilities.add`, isCapability);
    checkCapabilityNames(remove, `${where}: capabilities.remove`, isCapability);

    const select = entry.select ?? 'all';
    if (select !== 'all' && select !== 'delta') {
      throw new ProfileError(`${where}: select must be "all" or "delta".`);
    }
    if (name === 'default' && select !== 'all') {
      throw new ProfileError(`${where}: the default profile runs the whole suite (select "all").`);
    }

    const seedScripts = stringList(entry.seedScripts ?? [], `${where}: seedScripts`);
    for (const script of seedScripts) {
      if (!fileExists(script)) {
        throw new ProfileError(`${where}: seed script "${script}" does not exist.`);
      }
    }

    const rawExtensions: unknown = entry.tutorExtensions ?? [];
    if (!Array.isArray(rawExtensions)) {
      throw new ProfileError(`${where}: tutorExtensions must be a list.`);
    }
    const tutorExtensions = rawExtensions.map((raw: unknown, i): TutorExtension => {
      const at = `${where}: tutorExtensions[${i}]`;
      if (typeof raw !== 'object' || raw === null)
        throw new ProfileError(`${at} must be an object.`);
      const ext = raw as Record<string, unknown>;
      const extra = Object.keys(ext).filter((key) => !EXTENSION_KEYS.has(key));
      if (extra.length > 0) {
        throw new ProfileError(`${at} has unknown key(s): ${extra.join(', ')}.`);
      }
      const { pip, plugin, init, capability } = ext;
      if (typeof pip !== 'string' || !/^[A-Za-z0-9][\w.-]*$/.test(pip)) {
        throw new ProfileError(`${at}: pip must be a package name (the constraint is added).`);
      }
      if (typeof plugin !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(plugin)) {
        throw new ProfileError(`${at}: plugin must be a Tutor plugin name.`);
      }
      if (typeof init !== 'boolean') throw new ProfileError(`${at}: init must be true or false.`);
      if (typeof capability !== 'string') throw new ProfileError(`${at} needs a capability.`);
      checkCapabilityNames([capability], at, isCapability);
      const releases = stringList(ext.releases, `${at}: releases`);
      if (releases.length === 0)
        throw new ProfileError(`${at} must list the releases it supports.`);
      return { pip, plugin, init, capability, releases };
    });

    profiles.push({
      name,
      description,
      code,
      tutorPlugins,
      tutorExtensions,
      seedScripts,
      capabilities: { add, remove },
      select,
      shards,
    });
  }
  if (!profiles.some((profile) => profile.name === 'default')) {
    throw new ProfileError('The profiles file must define a "default" profile.');
  }
  return profiles;
}

/** The name Tutor enables a plugin file by: its file name without `.py`. */
export function pluginName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, -'.py'.length);
}

export function findProfile(profiles: readonly Profile[], name: string): Profile {
  const profile = profiles.find((p) => p.name === name);
  if (!profile) {
    throw new ProfileError(
      `Unknown profile "${name}"; .ci/profiles.json defines: ${profiles.map((p) => p.name).join(', ')}.`,
    );
  }
  return profile;
}

/** A profile's capabilities on a release: its delta, plus its extensions for that release. */
export function profileCapabilities(profile: Profile, release: ReleaseInfo): string {
  const extensions = profile.tutorExtensions
    .filter((ext) => ext.releases.includes(release.name))
    .map((ext) => ext.capability);
  return resolveCapabilities(release.capabilities, {
    add: [...profile.capabilities.add, ...extensions],
    remove: profile.capabilities.remove,
  });
}

/**
 * The `--grep` for a `select: delta` profile: its tests are those tagged with a
 * capability it declares and `default` does not, on the same release. The tag
 * must end there (`(?![\w-])`), so `@rbac` does not select `@rbac-global`.
 *
 * It works from the declared lists, since this script cannot load the
 * default-on capabilities (`src/config/capabilities.ts`). So it can also name
 * a capability that default has on by default without declaring it (the stock
 * `authz-manual-migration` on a release that does not declare
 * `authz-auto-migration`). That only re-runs tests the release merge counts
 * once; `tests/config/ci-profiles.spec.ts` checks that it is never a gap.
 *
 * @throws {ProfileError} when the profile declares nothing `default` lacks.
 */
export function deltaGrep(profile: Profile, defaults: Profile, release: ReleaseInfo): string {
  const declared = (list: string) =>
    list.split(',').filter((c) => c !== '' && !c.startsWith(CAPABILITY_OPT_OUT_PREFIX));
  const base = new Set(declared(profileCapabilities(defaults, release)));
  const extra = declared(profileCapabilities(profile, release)).filter((c) => !base.has(c));
  if (extra.length === 0) {
    throw new ProfileError(
      `Profile "${profile.name}" declares no capability the default profile lacks on ` +
        `${release.name}, so it would select no tests.`,
    );
  }
  return `@(?:${extra.join('|')})(?![\\w-])`;
}

/**
 * One matrix entry per shard of each selected profile, in the order given,
 * each carrying what its job provisions and runs on this release.
 */
export function shardMatrix(
  profiles: readonly Profile[],
  selected: readonly string[],
  release: ReleaseInfo,
): MatrixEntry[] {
  const names = [...new Set(selected.map((s) => s.trim()).filter(Boolean))];
  if (names.length === 0) {
    throw new ProfileError('Select at least one profile.');
  }
  const defaults = findProfile(profiles, 'default');
  return names.flatMap((name) => {
    const profile = findProfile(profiles, name);
    const extensions = profile.tutorExtensions.filter((ext) => ext.releases.includes(release.name));
    const shared = {
      shards: profile.shards,
      capabilities: profileCapabilities(profile, release),
      tutorPlugins: profile.tutorPlugins,
      tutorPip: extensions.map((ext) => `${ext.pip}${release.tutorConstraint}`),
      tutorEnable: extensions.map((ext) => ext.plugin),
      tutorInit: extensions.filter((ext) => ext.init).map((ext) => ext.plugin),
      seedScripts: profile.seedScripts,
      grep: profile.select === 'delta' ? deltaGrep(profile, defaults, release) : '',
    };
    return Array.from({ length: profile.shards }, (_, i) => ({
      profile: profile.name,
      shard: i + 1,
      runIdSuffix: `${profile.code}${i + 1}`,
      ...shared,
    }));
  });
}

/**
 * Applies a profile's capability delta to a release's comma-separated list.
 * Adding `x` also drops a `-x` opt-out (and adding `-x` drops `x`), so a
 * profile can turn a capability either way whatever the release declares.
 */
export function resolveCapabilities(releaseCapabilities: string, delta: CapabilityDelta): string {
  const opposite = (name: string) =>
    name.startsWith(CAPABILITY_OPT_OUT_PREFIX)
      ? name.slice(1)
      : `${CAPABILITY_OPT_OUT_PREFIX}${name}`;
  let list = releaseCapabilities
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c) => !delta.remove.includes(c));
  for (const name of delta.add) {
    list = list.filter((c) => c !== name && c !== opposite(name));
    list.push(name);
  }
  return list.join(',');
}
