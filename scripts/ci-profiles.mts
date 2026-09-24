#!/usr/bin/env node
/**
 * Reads `.ci/profiles.json` for `run_tests_tutor.yml`. Runs natively on Node 24
 * (type stripping); no build step.
 *
 *   node scripts/ci-profiles.mts check
 *       Validate the file (the `checks` job in ci.yml).
 *   node scripts/ci-profiles.mts matrix --profiles "default extended" --release-capabilities="<list>"
 *       Print the job matrix: a JSON list of { profile, shard, shards, runIdSuffix,
 *       capabilities, tutorPlugins }, with each profile's capability delta applied
 *       to the release's list. Use the `=` form: a list may start with an opt-out
 *       (`-frontend-base,…`), which would otherwise read as an option.
 *
 * Errors are printed as `::error::` annotations and exit 1.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { ProfileError, parseProfiles, shardMatrix } from './ci-profiles/profiles.mts';

const PROFILES_FILE = '.ci/profiles.json';

function main(): void {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      profiles: { type: 'string' },
      'release-capabilities': { type: 'string' },
    },
  });
  const profiles = parseProfiles(JSON.parse(readFileSync(PROFILES_FILE, 'utf8')), existsSync);

  switch (positionals[0]) {
    case 'check':
      console.log(`OK: ${PROFILES_FILE} defines ${profiles.map((p) => p.name).join(', ')}`);
      return;
    case 'matrix':
      console.log(
        JSON.stringify(
          shardMatrix(
            profiles,
            (values.profiles ?? '').split(/[\s,]+/),
            values['release-capabilities'] ?? '',
          ),
        ),
      );
      return;
    default:
      throw new ProfileError('Usage: ci-profiles.mts check | matrix (see the header).');
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::${message}`);
  process.exit(1);
}
