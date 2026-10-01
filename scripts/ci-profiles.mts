#!/usr/bin/env node
/**
 * Reads `.ci/profiles.json` for `run_tests_tutor.yml`. Runs natively on Node 24
 * (type stripping); no build step.
 *
 *   node scripts/ci-profiles.mts matrix --profiles "default extended" --release main \
 *       [--release-capabilities="<list>"]
 *       Print the job matrix: a JSON list of `MatrixEntry` (`ci-profiles/profiles.mts`)
 *       for that release of `.ci/openedx-releases.json`: each profile's capabilities,
 *       Tutor plugins and extensions, seed scripts and test selection. The release's
 *       capabilities come from the file unless `--release-capabilities` overrides them
 *       (a dispatch input). Use the `=` form: a list may start with an opt-out
 *       (`-frontend-base,…`), which would otherwise read as an option.
 *
 * Errors are printed as `::error::` annotations and exit 1.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { ProfileError, parseProfiles, shardMatrix } from './ci-profiles/profiles.mts';

const PROFILES_FILE = '.ci/profiles.json';
const RELEASES_FILE = '.ci/openedx-releases.json';

function main(): void {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      profiles: { type: 'string' },
      release: { type: 'string' },
      'release-capabilities': { type: 'string' },
    },
  });
  const profiles = parseProfiles(JSON.parse(readFileSync(PROFILES_FILE, 'utf8')), existsSync);

  switch (positionals[0]) {
    case 'matrix': {
      const name = values.release ?? '';
      const releases = JSON.parse(readFileSync(RELEASES_FILE, 'utf8')) as Record<
        string,
        { tutorConstraint: string; capabilities: string } | undefined
      >;
      const release = releases[name];
      if (release === undefined) {
        throw new ProfileError(`Unknown release "${name}"; add it to ${RELEASES_FILE}.`);
      }
      console.log(
        JSON.stringify(
          shardMatrix(profiles, (values.profiles ?? '').split(/[\s,]+/), {
            name,
            capabilities: values['release-capabilities'] || release.capabilities,
            tutorConstraint: release.tutorConstraint,
          }),
        ),
      );
      return;
    }
    default:
      throw new ProfileError('Usage: ci-profiles.mts matrix (see the header).');
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::${message}`);
  process.exit(1);
}
