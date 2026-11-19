"""
Tutor plugin for the `lti` CI profile (`.ci/profiles.json`), enabled after
`e2e_base.py`. It installs LTI Store and wires it into the LTI consumer, which
the reusable-configuration case (`lti-store`, TC-00661) needs:

- openedx-ltistore in the Open edX image: an LMS and CMS Django app (its entry
  points register it) holding the reusable LTI configurations, kept in Django
  admin. It changes what the image installs, so the image variant `lti` is built
  with this plugin enabled (`build_tutor_main_images.yml`). Its tables are
  created by `.ci/seed/lti.sh`, because a test job enables this plugin after
  the database is restored.
- OPEN_EDX_FILTERS_CONFIG: xblock-lti-consumer asks the
  `org.openedx.xblock.lti_consumer.configuration.listed.v1` filter for
  configurations by id; LTI Store's pipeline step answers it. Added to whatever
  the platform and its plugins already configure, in the LMS and the CMS.

Each course that uses a stored configuration also needs the
`lti_consumer.enable_external_config_filter` course flag; the suite sets it.
"""

from tutor import hooks

LTI_STORE_VERSION = "1.1.4"

hooks.Filters.ENV_PATCHES.add_items(
    [
        (
            "openedx-dockerfile-post-python-requirements",
            f"RUN pip install openedx-ltistore=={LTI_STORE_VERSION}",
        ),
        (
            "openedx-common-settings",
            """
OPEN_EDX_FILTERS_CONFIG = {
    **globals().get("OPEN_EDX_FILTERS_CONFIG", {}),
    "org.openedx.xblock.lti_consumer.configuration.listed.v1": {
        "fail_silently": False,
        "pipeline": ["lti_store.pipelines.GetLtiConfigurations"],
    },
}
""",
        ),
    ]
)
