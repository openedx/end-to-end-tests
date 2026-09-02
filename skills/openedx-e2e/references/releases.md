# Updating tests across named releases

The suite runs against **several Open edX versions at once**: every PR runs it
against `Tutor main` _and_ against the last named release, and
`run_tests_tutor.yml` can target any release listed in
`.ci/openedx-releases.json` (currently `main`, `verawood`, `ulmo`, `teak`,
`sumac`, `redwood`). A change that only works on `main` breaks those jobs.

There is **one test suite, not a branch per release.** Version differences are
expressed in configuration and in version-tolerant code, never by forking specs.

## `.ci/openedx-releases.json` is the source of truth per release

Each entry carries the Tutor version constraint and the default `CAPABILITIES` to
declare for that release. Adding or removing a supported release is an edit to
that file **plus** the matching `openedx_release` dropdown option in
`run_tests_tutor.yml` — `ci.yml` has a step that fails the build if the two drift
apart. `ci.yml`'s "last release" job also hardcodes the newest non-`main` release
and carries a comment saying to keep it in sync.

## How to absorb a platform change without breaking older releases

Pick the lowest-cost mechanism that fits:

1. **The markup moved but both forms are non-localized and stable.** Widen the
   anchor in `src/config/selectors/<surface>.ts` so it matches both, and say in
   the comment which release each form belongs to. A selector union is cheaper
   and more honest than a capability.
2. **A feature exists only from some release onward, or is optional per install.**
   Add a capability to `src/config/capabilities.ts`, tag the coverage with it,
   document it in `.env.example`, and declare it in `.ci/openedx-releases.json`
   only for the releases that have it. The `capabilityGate` fixture does the rest
   — the tag is the whole contract. A gated spec must assert the feature's
   surface really exists, so a release that declares it wrongly fails loudly.
3. **One surface, two implementations** (e.g. the courseware outline sidebar vs.
   the older in-course navigation, chosen by
   `courseware.enable_navigation_sidebar`). Give each a capability and add the
   pair to `MUTUALLY_EXCLUSIVE_CAPABILITIES`, so declaring both is a
   configuration error and enabling one skips the other's tests. Keep both sides'
   coverage.
4. **Two routes to the same place** (catalog search vs. paging). Put the choice in
   a step that takes whichever route the target offers
   (`locateCourseInCatalog`) and leave the journey specs **ungated**; gate only
   the specs that put the optional route itself under test.
5. **An API's response shape changed.** Narrow in the `src/api/` client: accept
   both shapes behind one typed result, and throw `ApiError` with an actionable
   message on anything else. Specs and page objects should not learn about the
   difference.

## What not to do

- Don't drop or weaken coverage that older releases still need in order to make
  `main` pass — keep both paths.
- Don't branch on a version number in a spec, and don't add
  `if (release === …)` anywhere. Capability declarations and version-tolerant
  selectors are the mechanism; a version switch reintroduces the
  installation-specific assumptions ADR-0002 rules out.
- Don't add a capability for something every supported release has — that is just
  a selector update.
- Don't let `.ci/openedx-releases.json`, the workflow dropdown, `.env.example`'s
  capability list, and `src/config/capabilities.ts` drift apart.

## Before you call it done

```sh
npm run check
npx playwright test --project=unit    # capability/config validation lives here
```

Then run the affected specs against the target you have, and say plainly which
releases you could and could not verify. When a change plausibly affects older
releases, dispatch `run_tests_tutor.yml` with `openedx_release` set to the oldest
release the change touches (and `test_ref` on your branch) rather than assuming.
