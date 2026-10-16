#!/usr/bin/env bash
# Write a JSON record of exactly what a CI job ran: this repo's commit, the
# Tutor packages (with the commit pip resolved for a git install), every
# Docker image (id, registry digest), edx-platform's commit read from the
# openedx image, and each MFE's commit read from the MFE image.
#
# Usage: .ci/provenance.sh <output.json>
#
# run_tests_tutor.yml writes it into each shard's tutor-logs artifact, and
# build_tutor_main_images.yml into its job summary. Comparing the files of a
# green and a red run (`ci_artifacts.py provenance --baseline`) tells upstream
# changes from changes to the suite.
#
# MFE commits exist only in images built with .ci/tutor/e2e_provenance.py
# enabled (build_tutor_main_images.yml does); for any other image, and for any
# value that cannot be read, the field is null. Best effort throughout: this
# never fails the job.
set -uo pipefail

OUT="${1:?usage: $0 <output.json>}"
mkdir -p "$(dirname "$OUT")"

config() { tutor config printvalue "$1" 2>/dev/null || true; }

# Tutor and its plugins. A git install records the commit pip resolved; the
# editable clone install-tutor-main makes does not, so ask its checkout.
PACKAGES=$(python -m pip inspect 2>/dev/null | jq '[.installed[]
  | select(.metadata.name | test("^tutor"; "i"))
  | {
      name: .metadata.name,
      version: .metadata.version,
      url: (.direct_url.url // null),
      commit: (.direct_url.vcs_info.commit_id // null)
    }]' 2>/dev/null) || PACKAGES='[]'
while read -r name path; do
  [ -n "$name" ] || continue
  commit=$(git -C "$path" rev-parse HEAD 2>/dev/null) || continue
  remote=$(git -C "$path" remote get-url origin 2>/dev/null || true)
  PACKAGES=$(jq --arg n "$name" --arg c "$commit" --arg u "$remote" \
    'map(if .name == $n then .commit = $c | .url = (if $u == "" then .url else $u end) else . end)' <<< "$PACKAGES")
done < <(jq -r '.[] | select(.commit == null and ((.url // "") | startswith("file://")))
  | "\(.name) \(.url | ltrimstr("file://"))"' <<< "$PACKAGES")

OPENEDX_IMAGE=$(config DOCKER_IMAGE_OPENEDX)
MFE_IMAGE=$(config MFE_DOCKER_IMAGE)

# Every image a container ran from, plus the two above (a build job has no
# containers).
IMAGES='[]'
while read -r ref; do
  [ -n "$ref" ] || continue
  info=$(docker image inspect "$ref" 2>/dev/null | jq --arg ref "$ref" '.[0] | {
    ref: $ref,
    id: .Id,
    digests: (.RepoDigests // []),
    created: .Created
  }' 2>/dev/null) || continue
  IMAGES=$(jq --argjson i "$info" '. + [$i]' <<< "$IMAGES")
done < <({ docker ps -a --format '{{.Image}}' 2>/dev/null; echo "$OPENEDX_IMAGE"; echo "$MFE_IMAGE"; } | sort -u)

# edx-platform: the openedx image keeps the checkout's .git.
PLATFORM_COMMIT=""
if [ -n "$OPENEDX_IMAGE" ]; then
  PLATFORM_COMMIT=$(docker run --rm --entrypoint git "$OPENEDX_IMAGE" \
    -c safe.directory='*' -C /openedx/edx-platform rev-parse HEAD 2>/dev/null || true)
fi

# MFEs: "<name> <commit> <url>" lines written by e2e_provenance.py.
MFES='[]'
if [ -n "$MFE_IMAGE" ]; then
  MFES=$(docker run --rm --entrypoint sh "$MFE_IMAGE" \
    -c 'cat /openedx/e2e-revisions/* 2>/dev/null' 2>/dev/null \
    | jq -R -s '[split("\n")[] | select(length > 0) | split(" ") | {
        name: .[0],
        commit: (if (.[1] // "unknown") == "unknown" then null else .[1] end),
        repository: (if (.[2] // "") == "" then null else .[2] end)
      }]' 2>/dev/null) || MFES='[]'
fi

jq -n \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg release "${OPENEDX_RELEASE:-}" \
  --arg profile "${PROVENANCE_PROFILE:-}" \
  --arg shard "${PROVENANCE_SHARD:-}" \
  --arg repo "${GITHUB_REPOSITORY:-}" \
  --arg sha "$(git rev-parse HEAD 2>/dev/null || echo "${GITHUB_SHA:-}")" \
  --arg platform_repo "$(config EDX_PLATFORM_REPOSITORY)" \
  --arg platform_version "$(config EDX_PLATFORM_VERSION)" \
  --arg platform_commit "$PLATFORM_COMMIT" \
  --arg openedx_image "$OPENEDX_IMAGE" \
  --arg mfe_image "$MFE_IMAGE" \
  --argjson packages "$PACKAGES" \
  --argjson images "$IMAGES" \
  --argjson mfes "$MFES" \
  'def nul: if . == "" then null else . end;
  {
    schema: 1,
    generated_at: $generated_at,
    release: ($release | nul),
    profile: ($profile | nul),
    shard: ($shard | nul),
    suite: { repository: ($repo | nul), commit: ($sha | nul) },
    edx_platform: {
      repository: ($platform_repo | nul),
      version: ($platform_version | nul),
      commit: ($platform_commit | nul),
      image: ($openedx_image | nul)
    },
    mfe_image: ($mfe_image | nul),
    mfes: $mfes,
    tutor_packages: $packages,
    images: $images
  }' > "$OUT" || {
  echo "::warning::Could not write provenance to ${OUT}."
  exit 0
}
echo "Wrote ${OUT}: edx-platform ${PLATFORM_COMMIT:-unknown}, $(jq length <<< "$MFES") MFE commit(s), $(jq length <<< "$IMAGES") image(s)."
