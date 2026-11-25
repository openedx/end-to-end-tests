#!/usr/bin/env bash
# Prepares the `lti` CI profile's install (`.ci/profiles.json`): creates LTI
# Store's tables, which the restored database predates (the profile's Tutor
# plugin, `.ci/tutor/e2e_lti.py`, is enabled after the restore). Run from the
# repo root on a provisioned Tutor "local" install. Idempotent: `migrate` applies
# only what is missing.
#
# This provisions CI's own install; it is not test data. A provider whose target
# has LTI Store declares the `lti-store` capability instead (`.env.example`).
set -euo pipefail

echo "Migrating LTI Store's tables..."
tutor local exec lms ./manage.py lms migrate lti_store --noinput
