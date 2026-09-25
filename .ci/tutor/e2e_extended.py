"""
Tutor plugin for the `extended` CI profile (`.ci/profiles.json`), enabled after
`e2e_base.py`. It configures the installation the other way round from the
default profile, for the cases the default one has to skip:

- AuthZ migration stays with an operator (the stock default): saving a waffle
  override migrates nothing (`authz-manual-migration`, TC-00613/00614).
- The MFE config sets `SUPPORT_URL`, so the headers offer a Help link
  (`support-url`, TC-00020/00021/00023).

Content the profile needs is seeded by `.ci/seed/extended.sh`, and the codejail
service comes from `tutor-contrib-codejail` where the release has it
(`tutorExtensions`).
"""

from tutor import hooks

hooks.Filters.CONFIG_OVERRIDES.add_items(
    [
        ("E2E_AUTHZ_AUTOMATIC_MIGRATION", False),
    ]
)

hooks.Filters.ENV_PATCHES.add_item(
    (
        "openedx-lms-production-settings",
        """
MFE_CONFIG = globals().get("MFE_CONFIG", {})
MFE_CONFIG["SUPPORT_URL"] = "https://support.e2e.example.org/"
""",
    )
)
