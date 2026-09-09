#!/usr/bin/env bash
# Point Tutor at the prebuilt "main" images in this repository's GitHub
# Container Registry namespace.
#
# Tutor reads any config key from a TUTOR_<KEY> environment variable, so
# exporting these overrides every later `tutor` invocation without touching
# .ci/config.yml. When running under GitHub Actions the variables are appended
# to $GITHUB_ENV so they apply to every subsequent step of the job.
#
# Usage: .ci/tutor-main-images.sh ghcr.io/<owner>/<repo>
#
# Shared by build_tutor_main_images.yml (which builds and pushes these tags
# nightly) and run_tests_tutor.yml (which pulls them instead of building).
# Keep the two in sync by only ever editing the list here.
set -euo pipefail

REGISTRY_PREFIX="${1:?usage: $0 ghcr.io/<owner>/<repo>}"
REGISTRY_PREFIX="${REGISTRY_PREFIX,,}"   # GHCR requires lowercase names
TAG="${2:-main}"

# Tutor image name -> config key. Only images that `tutor images build/push`
# know about on Tutor main: the forum plugin has no image of its own there
# (the forum runs inside the openedx image).
declare -A IMAGE_KEYS=(
  [openedx]=DOCKER_IMAGE_OPENEDX
  [permissions]=DOCKER_IMAGE_PERMISSIONS
  [mfe]=MFE_DOCKER_IMAGE
  [notes]=NOTES_DOCKER_IMAGE
)

# Emit in a stable order so logs are easy to read.
TUTOR_MAIN_IMAGES="openedx permissions mfe notes"

emit() {
  echo "$1"
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "$1" >> "$GITHUB_ENV"
  fi
}

# Mirror Tutor's own naming: overhangio/openedx, overhangio/openedx-permissions,
# overhangio/openedx-mfe, overhangio/openedx-notes.
for image in $TUTOR_MAIN_IMAGES; do
  name="openedx"
  [ "$image" != "openedx" ] && name="openedx-${image}"
  emit "TUTOR_${IMAGE_KEYS[$image]}=${REGISTRY_PREFIX}/${name}:${TAG}"
done
# Space-separated list of the Tutor image names above, for
# `tutor images build|pull|push $TUTOR_MAIN_IMAGES`.
emit "TUTOR_MAIN_IMAGES=${TUTOR_MAIN_IMAGES}"
