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

export interface Profile {
  readonly name: string;
  readonly description: string;
  /** One lowercase letter; with the shard number it forms the run-id suffix. */
  readonly code: string;
  /** Tutor plugin files (repository paths), each enabled by its file name. */
  readonly tutorPlugins: readonly string[];
  readonly capabilities: CapabilityDelta;
  /** How many shards (matrix jobs, each with its own Tutor stack) run the profile. */
  readonly shards: number;
}

export interface MatrixEntry {
  readonly profile: string;
  readonly shard: number;
  readonly shards: number;
  /** `RUN_ID_SUFFIX` for the job: profile code + shard number, e.g. `d2`. */
  readonly runIdSuffix: string;
  /** The release's capabilities with the profile's delta applied. */
  readonly capabilities: string;
  readonly tutorPlugins: readonly string[];
}

export class ProfileError extends Error {}

const KNOWN_KEYS = new Set(['description', 'code', 'tutorPlugins', 'capabilities', 'shards']);
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

    profiles.push({
      name,
      description,
      code,
      tutorPlugins,
      capabilities: { add, remove },
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

/**
 * One matrix entry per shard of each selected profile, in the order given,
 * each carrying the capabilities and Tutor plugins its job provisions.
 */
export function shardMatrix(
  profiles: readonly Profile[],
  selected: readonly string[],
  releaseCapabilities: string,
): MatrixEntry[] {
  const names = [...new Set(selected.map((s) => s.trim()).filter(Boolean))];
  if (names.length === 0) {
    throw new ProfileError('Select at least one profile.');
  }
  return names.flatMap((name) => {
    const profile = findProfile(profiles, name);
    const capabilities = resolveCapabilities(releaseCapabilities, profile.capabilities);
    return Array.from({ length: profile.shards }, (_, i) => ({
      profile: profile.name,
      shard: i + 1,
      shards: profile.shards,
      runIdSuffix: `${profile.code}${i + 1}`,
      capabilities,
      tutorPlugins: profile.tutorPlugins,
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
