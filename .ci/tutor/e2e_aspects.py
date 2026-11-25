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
- ASPECTS_COURSE_STRUCTURE_REFRESH(_RANDOMIZE),
  ASPECTS_VIDEO_WATCH_INTERVALS_REFRESH(_RANDOMIZE): aspects-dbt 8.1 rebuilds
  the course structure and video watch tables on a timer (every 5 minutes plus
  up to 1 minute by default), so a publish or a watch reaches the charts only
  on the next refresh. Refresh every 30 seconds so that fits the analytics
  budgets. Older Aspects releases ignore these settings.
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
        ("ASPECTS_COURSE_STRUCTURE_REFRESH", "EVERY 30 SECOND"),
        ("ASPECTS_COURSE_STRUCTURE_REFRESH_RANDOMIZE", "1 SECOND"),
        ("ASPECTS_VIDEO_WATCH_INTERVALS_REFRESH", "EVERY 30 SECOND"),
        ("ASPECTS_VIDEO_WATCH_INTERVALS_REFRESH_RANDOMIZE", "1 SECOND"),
        # TEMPORARY smoke test of openedx/tutor-contrib-aspects#1398 (never merge).
        ("DOCKER_IMAGE_CLICKHOUSE", "clickhouse/clickhouse-server:26.8"),
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
