"""
Tutor plugin for the images `build_tutor_main_images.yml` builds: record which
upstream commit each MFE was built from, inside the MFE image.

The openedx image keeps edx-platform's `.git` (Tutor adds it with
`--keep-git-dir`), so its commit can be read from the image directly. The MFE
image cannot: it is a Caddy image holding only each MFE's built `dist/`, and
the sources, `.git` included, stay behind in the build stages. These patches
write `<name> <commit> <remote url>` lines while the sources are still there
and copy them into the final image under /openedx/e2e-revisions/, where
`.ci/provenance.sh` reads them. Nothing is written under /openedx/dist, so
Caddy never serves them.

The build stages have no `git`, so HEAD is resolved by reading `.git` by hand
(detached HEAD, a loose ref or a packed ref). A source without `.git` (a
local `file://` site) is skipped; the reader reports what is missing as
unknown.

Not a CI profile plugin: no test job enables it, and it changes no setting.
"""

from tutor import hooks

# Print "<name> <commit> <url>" for the checkout in $d, named $n.
_REVISION = r'''h=$(cat "$d/.git/HEAD" 2>/dev/null); \
case "$h" in "ref: "*) r="${h#ref: }"; \
  h=$(cat "$d/.git/$r" 2>/dev/null || grep " $r\$" "$d/.git/packed-refs" 2>/dev/null | cut -d' ' -f1);; esac; \
u=$(sed -n 's/^[[:space:]]*url = //p' "$d/.git/config" 2>/dev/null | head -n 1); \
echo "$n ${h:-unknown} $u"'''

hooks.Filters.ENV_PATCHES.add_items(
    [
        # Each legacy MFE's production stage; APP_ID is its name.
        (
            "mfe-dockerfile-post-npm-build",
            f"""RUN d=/openedx/app; n="$APP_ID"; {_REVISION} > /openedx/app/e2e-revision""",
        ),
        # The frontend-base site and the app packages it was built with.
        (
            "mfe-dockerfile-post-npm-build-site",
            f"""RUN for d in /openedx/site /openedx/site/packages/*; do \\
      [ -d "$d/.git" ] || continue; \\
      n=$(basename "$d"); [ "$d" = /openedx/site ] && n=site; \\
      {_REVISION}; \\
    done > /openedx/site/e2e-revisions""",
        ),
        (
            "mfe-dockerfile-production-final",
            """{%- for app_name, app in iter_mfes() %}
COPY --from={{ app_name }}-prod /openedx/app/e2e-revision /openedx/e2e-revisions/{{ app_name }}
{%- endfor %}
{%- if get_frontend_apps is defined and get_frontend_apps() %}
COPY --from=site-prod /openedx/site/e2e-revisions /openedx/e2e-revisions/site
{%- endif %}""",
        ),
    ]
)
