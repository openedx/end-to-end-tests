#!/usr/bin/env bash
# Point Tutor at the images this repository prebuilds in its GitHub Container
# Registry namespace: the stock "main" images, or a CI profile's image variant.
#
# Tutor reads any config key from a TUTOR_<KEY> environment variable, so
# exporting these overrides every later `tutor` invocation without touching
# .ci/config.yml. When running under GitHub Actions the variables are appended
# to $GITHUB_ENV so they apply to every subsequent step of the job.
#
# Usage: .ci/tutor-main-images.sh ghcr.io/<owner>/<repo> [tag] [variant]
#
#   variant ""        (default) the stock images Tutor main needs, tag `main`;
#                     sets TUTOR_MAIN_IMAGES to their names.
#   variant "aspects" the images the `aspects` profile (.ci/profiles.json) builds
#                     with tutor-contrib-aspects enabled: Open edX (with
#                     platform-plugin-aspects), the MFEs (with the Aspects apps),
#                     and Aspects' own two. Tag `<release>-aspects`; sets
#                     TUTOR_VARIANT_IMAGES to their names and TUTOR_VARIANT_REFS
#                     to their full references. On main, run the stock call
#                     first: the variant only replaces the images it builds.
#
# Tutor resolves a plugin's image names only while the plugin is enabled, and a
# test job enables the profile's plugins after launch, so it pulls a variant by
# TUTOR_VARIANT_REFS with `docker pull`, not `tutor images pull`.
#
# Shared by build_tutor_main_images.yml (which builds and pushes these tags
# nightly) and run_tests_tutor.yml (which pulls them instead of building).
# Keep the two in sync by only ever editing the lists here.
set -euo pipefail

REGISTRY_PREFIX="${1:?usage: $0 ghcr.io/<owner>/<repo> [tag] [variant]}"
REGISTRY_PREFIX="${REGISTRY_PREFIX,,}"   # GHCR requires lowercase names
TAG="${2:-main}"
VARIANT="${3:-}"

# Tutor image name -> config key. Only images that `tutor images build/push`
# know about: the forum plugin has no image of its own on Tutor main (the
# forum runs inside the openedx image).
declare -A IMAGE_KEYS=(
  [openedx]=DOCKER_IMAGE_OPENEDX
  [permissions]=DOCKER_IMAGE_PERMISSIONS
  [mfe]=MFE_DOCKER_IMAGE
  [notes]=NOTES_DOCKER_IMAGE
  [aspects]=DOCKER_IMAGE_ASPECTS
  [aspects-superset]=DOCKER_IMAGE_SUPERSET
)

# Emit in a stable order so logs are easy to read.
case "$VARIANT" in
  "") IMAGES="openedx permissions mfe notes"; LIST_VAR=TUTOR_MAIN_IMAGES ;;
  aspects) IMAGES="openedx mfe aspects aspects-superset"; LIST_VAR=TUTOR_VARIANT_IMAGES ;;
  *) echo "Unknown image variant '${VARIANT}'" >&2; exit 1 ;;
esac

emit() {
  echo "$1"
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "$1" >> "$GITHUB_ENV"
  fi
}

# Mirror Tutor's own naming: overhangio/openedx, overhangio/openedx-permissions,
# overhangio/openedx-mfe, overhangio/openedx-notes (and openedx-aspects,
# openedx-aspects-superset for Aspects' images).
REFS=""
for image in $IMAGES; do
  name="openedx"
  [ "$image" != "openedx" ] && name="openedx-${image}"
  ref="${REGISTRY_PREFIX}/${name}:${TAG}"
  emit "TUTOR_${IMAGE_KEYS[$image]}=${ref}"
  REFS="${REFS:+${REFS} }${ref}"
done
# Space-separated list of the Tutor image names above, for
# `tutor images build|pull|push`.
emit "${LIST_VAR}=${IMAGES}"
if [ -n "$VARIANT" ]; then
  emit "TUTOR_VARIANT_REFS=${REFS}"
fi
