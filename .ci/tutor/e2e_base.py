"""
Tutor plugin for the suite's CI installation: the settings every profile in
`.ci/profiles.json` starts from. `run_tests_tutor.yml` copies each file a
profile lists into Tutor's plugin root and enables it by its file name.

Settings in the common patch:

- SKIP_EMAIL_VALIDATION: without it Playwright can't complete most auth tests
  because accounts can't be activated via email. Some activation tests
  therefore can't run here.
- ENABLE_COURSE_DISCOVERY: exposes the course discovery/search UI the catalog
  tests exercise.
- ENABLE_COURSEWARE_INDEX: courseware indexing is meant to be on by default,
  but on main the top-level setting reads False while only the dead FEATURES
  flag is True (the TUTOR-001 flattening); force it so the Studio Reindex
  button and catalog search see authored content.
- ENABLE_EDXNOTES: the notes plugin sets it only in FEATURES, so on main the
  Notes tool stays off (TUTOR-001 again); the notes specs need it.
- Rate limits: the platform defaults are per-day and CI retries and
  back-to-back runs exhaust them (HTTP 403 forbidden-request), so use short,
  self-resetting per-minute windows.
"""

from tutor import hooks

hooks.Filters.ENV_PATCHES.add_item(
    (
        "openedx-common-settings",
        """
REGISTRATION_RATELIMIT = "100/m"
PASSWORD_RESET_IP_RATE = "100/m"
PASSWORD_RESET_EMAIL_RATE = "100/m"

# Login limits. The per-email default (30/5m) trips first: a worker's
# author signs in repeatedly across its Studio run and hits "Too many
# failed login attempts"; the per-IP default (100/5m) is shared by all
# workers. Both use self-resetting per-minute windows here.
LOGISTRATION_PER_EMAIL_RATELIMIT_RATE = "100/m"
LOGISTRATION_RATELIMIT_RATE = "100/m"
LOGISTRATION_API_RATELIMIT = "100/m"

ENABLE_COURSE_DISCOVERY = True
ENABLE_COURSEWARE_INDEX = True
ENABLE_EDXNOTES = True
SKIP_EMAIL_VALIDATION = True

# AuthZ course-authoring migration (Epic 12, 587-614). Off on a stock
# install, which leaves a course whose flag is turned on with no authz
# roles at all -- its team is locked out of Studio, and the Course
# Authoring Migration Run admin (the sheet's oracle for enabling and
# rolling back) stays empty, because only this path writes to it. With
# it on, saving a course or org waffle override migrates that scope
# synchronously and reversibly. The suite probes which mode the target
# is in, so the cases for the other mode skip rather than fail.
ENABLE_AUTOMATIC_AUTHZ_COURSE_AUTHORING_MIGRATION = True

# Special exams (timed and proctored subsections, the instructor
# dashboard's Special Exams tab). Off on a stock install; the
# special-exams capability's coverage (TC-00541) needs it on.
ENABLE_SPECIAL_EXAMS = True

# Releases before main still read these from FEATURES; main has
# deprecated FEATURES in favour of top-level settings.
if "FEATURES" in globals():
    FEATURES["ENABLE_COURSE_DISCOVERY"] = True
    FEATURES["ENABLE_COURSEWARE_INDEX"] = True
    FEATURES["ENABLE_EDXNOTES"] = True
    FEATURES["SKIP_EMAIL_VALIDATION"] = True
    FEATURES["ENABLE_SPECIAL_EXAMS"] = True
"""
    )
)

# Upload-agreement gating (Epic 11, 501-507). Declared statically on the
# LMS so the authoring MFE reads it from /api/mfe_config/v1: three keys
# and a list cover every case's shape (files gated by `upload` and
# `upload.files`; a distinct videos type; a list). The suite seeds the
# matching agreement rows and accepts them per author; it never sets this
# config, so it can rely on the map being present.
hooks.Filters.ENV_PATCHES.add_item(
    (
        "openedx-lms-production-settings",
        """
MFE_CONFIG = globals().get("MFE_CONFIG", {})
MFE_CONFIG["AGREEMENT_GATING"] = {
    "upload": "e2e-upload",
    "upload.files": ["e2e-files", "e2e-files-second"],
    "upload.videos": "e2e-videos",
}
"""
    )
)

# Mailpit (Epic 13, the email-inbox capability): the platform's mail
# goes to a catcher on the runner instead of Tutor's exim relay, which
# delivers straight to recipients' MX on port 25 -- blocked outbound
# on GitHub-hosted runners. The suite reads it through
# plugins/mailpit.plugin.ts at http://localhost:8025. The same service
# and SMTP overrides as tutor-contrib-mailpit, whose own patch only
# targets `tutor dev`.
hooks.Filters.ENV_PATCHES.add_item(
    (
        "local-docker-compose-services",
        """
mailpit:
  image: docker.io/axllent/mailpit:v1.30.7
  restart: unless-stopped
  ports:
    - 8025:8025
    - 1025:1025
  environment:
    MP_MAX_MESSAGES: 5000
    MP_SMTP_AUTH_ACCEPT_ANY: 1
    MP_SMTP_AUTH_ALLOW_INSECURE: 1
"""
    )
)
hooks.Filters.CONFIG_OVERRIDES.add_items(
    [("RUN_SMTP", False), ("SMTP_HOST", "mailpit"), ("SMTP_PORT", 1025)]
)
