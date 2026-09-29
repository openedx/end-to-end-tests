"""
Tutor plugin for the `aspects` CI profile (`.ci/profiles.json`), enabled after
`e2e_base.py` with `tutor-contrib-aspects`. It configures Aspects the way the
analytics cases need it, and makes it reachable on the runner:

- ASPECTS_ENABLE_PII: the Reports tab offers the Individual Learner dashboard
  (`analytics-pii`, TC-00544).
- ASPECTS_ENABLE_STUDIO_IN_CONTEXT_METRICS: the authoring MFE gains the
  Analytics sidebar and card buttons (`analytics-in-context`, TC-00312–00316).
  It changes what the MFE image installs, so the image variant is built with
  this plugin enabled too (`build_tutor_main_images.yml`).
- SUPERSET_CONFIG["internal_service_url"]: the LMS asks Superset for guest
  tokens at the address it would give a browser, `superset.local.openedx.io`,
  which inside the LMS container resolves to the container itself. Point it at
  the Superset service instead. Rendered at low priority so it comes after
  tutor-contrib-aspects' own `SUPERSET_CONFIG`.
- OAUTHLIB_INSECURE_TRANSPORT: Superset signs users in through the LMS's OAuth
  provider, which refuses plain HTTP without it, and the CI install serves
  HTTP.
"""

from tutor import hooks

hooks.Filters.CONFIG_OVERRIDES.add_items(
    [
        ("ASPECTS_ENABLE_PII", True),
        ("ASPECTS_ENABLE_STUDIO_IN_CONTEXT_METRICS", True),
    ]
)

hooks.Filters.ENV_PATCHES.add_item(
    (
        "openedx-common-settings",
        """
import os
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
SUPERSET_CONFIG["internal_service_url"] = "http://superset:{{ SUPERSET_PORT }}"
""",
    ),
    priority=hooks.priorities.LOW,
)
