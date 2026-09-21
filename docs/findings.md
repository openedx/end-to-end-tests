# Findings log

Defects and content problems this suite has surfaced in the Open edX platform,
its MFEs and the demo course, recorded as they were measured so they can be filed
upstream and tracked afterwards. It covers every epic the suite has run so far.

Each finding carries an ID that is quoted in `test.fixme()` reasons and in code
comments, so a skipped test or a workaround can be traced back to its cause. IDs
are stable — never renumber one, even after the finding is fixed.

A finding is recorded here whether or not it has an issue yet. The table below is
the index: it names the repo the defect belongs to and the current status,
including the issue number once one exists. Entries are added as the work that
found them opens a pull request, so a reviewer can see what the branch worked
around and why.

Nothing here is filed automatically. Findings are written up as they are
measured, and issues are opened by hand from them.

| ID          | Repo / target                                            | Status                                                                         |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `DEMO-001`  | `openedx/openedx-demo-course`                            | open, `fixme` in `discovery.spec.ts`                                           |
| `LEARN-001` | `openedx/frontend-app-learning`                          | open, `fixme` in `outline.spec.ts`                                             |
| `PLAT-001`  | `openedx/edx-platform` (completion-on-view)              | **filed**  - [#459](https://github.com/openedx/completion/issues/459), blocks the 100%-completion crawl                                         |
| `PLAT-002`  | `openedx/edx-platform` (video handlers)                  | open, two 500s on a default install                                            |
| `PLAT-003`  | `openedx/edx-platform` / `frontend-app-learning` (video) | **superseded** — HTML5 videos are drivable (issue #41); `fixme` lifted, only YouTube-only videos remain out of reach |
| `DEMO-002`  | `openedx/openedx-demo-course`                            | open, blocks any passing-grade coverage (corrected)                            |
| `CAT-160`   | `openedx/frontend-app-catalog`                           | **filed** — [#160](https://github.com/openedx/frontend-app-catalog/issues/160) |
| `CAT-161`   | `openedx/frontend-app-catalog`                           | **filed** — [#161](https://github.com/openedx/frontend-app-catalog/issues/161) |
| `BASE-001`  | `openedx/frontend-base` (shell header/footer)            | open, `test.fail` in `discovery.spec.ts`, gated `@frontend-base`               |
| `RBAC-001`  | `openedx/frontend-app-admin-console`                     | open, shapes every anchor in `selectors/admin-console.ts`                      |
| `RBAC-002`  | `openedx/openedx-authz`                                  | open, `fixme` in `team-members.spec.ts` (TC-00568)                             |
| `RBAC-003`  | `openedx/frontend-app-admin-console`                     | open, asserted as an empty Role cell (the sheet's own note on TC-00619)        |
| `RBAC-004`  | `openedx/frontend-app-admin-console`                     | open, TC-00440/00441/00443 asserted against what it does render                |
| `RBAC-005`  | `openedx/frontend-app-admin-console`                     | open, pager located by position instead                                        |
| `RBAC-006`  | `openedx/frontend-app-admin-console`                     | open, three axe rules baselined for console scans                              |
| `RBAC-007`  | `openedx/openedx-authz` + console                        | open, `knownGap` on TC-00567                                                   |
| `RBAC-008`  | `openedx/frontend-app-admin-console`                     | open, `test.fail` on TC-00442                                                  |
| `RBAC-009`  | `openedx/frontend-app-admin-console`                     | open, `fixme` sibling on TC-00569                                              |
| `RBAC-010`  | `openedx/edx-platform` (content libraries)               | open, `fixme` sibling on TC-00573                                              |
| `RBAC-011`  | `openedx/frontend-app-authoring`                         | open, asserted as a 403 on the offered action (TC-00572)                       |
| `RBAC-012`  | sheet vs platform (`openedx-authz` roles)                | open, platform's model asserted on TC-00571                                    |
| `RBAC-013`  | `openedx/frontend-app-authoring`                         | open, `fixme` sibling on TC-00575                                              |
| `BASE-002`  | `openedx/frontend-base` (shell header)                   | open, no `fixme` — worked around by selector                                   |
| `PLAT-004`  | `openedx/edx-platform` (`login_session`)                 | open, no `fixme` — the suite no longer makes the call                          |
| `TUTOR-001` | `overhangio/tutor` (+ any plugin setting the old key)    | open, no `fixme` — handled by the `catalog-search` capability                  |
| `STUDIO-001` | `openedx/edx-platform` (`create_new_course`)            | **filed** - [#569](https://github.com/openedx/edx-organizations/issues/569), `fixme` in `tests/studio/bootstrap.spec.ts` — worked around in `ensureCourse` |
| `PLAT-005`  | `openedx/edx-platform` (`delete_course` → search index)  | open, no `fixme` — operator-side command, not reachable by the suite           |
| `STUDIO-002` | `openedx/edx-platform` (`create_new_course` org enforcement) | **filed** - [#39084](https://github.com/openedx/openedx-platform/issues/39084), `fixme` in `tests/studio/home/create-course.spec.ts`                     |
| `STUDIO-003` | `openedx/frontend-app-course-authoring` (course outline a11y) | open, per-screen a11y tolerance in `tests/studio/home/create-course.spec.ts`  |
| `STUDIO-004` | `openedx/frontend-app-course-authoring` (grading page a11y) | open, per-screen a11y tolerance in `tests/studio/settings/grading.spec.ts`  |
| `PLAT-006`  | `openedx/edx-platform` (`course_details` PUT, `self_paced`)  | **filed** - [#39094](https://github.com/openedx/openedx-platform/issues/39094), no `fixme` — worked around in `updateCourseDetails`                      |
| `STUDIO-005` | `openedx/edx-platform` (`/api/enrollment/v1/course` read staleness) | open, no `fixme` — suite reads Studio `course_details` instead; TC-00298/TC-00299 pass |
| `STUDIO-006` | `openedx/frontend-app-course-authoring` (certificates page empty without a cert-bearing mode) | worked around — suite adds an `honor` mode with the staff session; TC-00275/276/279 pass |
| `STUDIO-007` | `openedx/frontend-app-course-authoring` (Import dropzone's file input has no label) | open, no `fixme` — a11y `label` baselined on the `studio-import` scan only; TC-00309 passes |
| `STUDIO-008` | `openedx/frontend-app-course-authoring` (Custom Pages draggable list is a `<ul>` of `<div>`s) | open, no `fixme` — a11y `list` baselined on the `studio-custom-pages` scan only; TC-00237 passes |
| `PLAT-007`  | `openedx/edx-platform` (Blocks API on a not-yet-started course) | **filed** - [#39115](https://github.com/openedx/openedx-platform/issues/39115), `fixme` planned in Epic 8 `future-dated.spec.ts` — learner readings use `course_metadata` instead |
| `PLAT-008`  | `openedx/edx-platform` (subsection gating by completion) | **filed** - [#39114](https://github.com/openedx/openedx-platform/issues/39114), `fixme` in `tests/studio/outline/gating.spec.ts` (TC-00160)              |
| `LIB-001`   | `openedx/edx-platform` (`delete_library`, content libraries v2) | **filed** - [#39117](https://github.com/openedx/openedx-platform/issues/39117), found in the Epic 10 probe — the per-test seeded libraries cannot be torn down; teardown is best effort |
| `LIB-002`   | `openedx/frontend-app-course-authoring` (course "Review Content Updates" tab) | open, no `fixme` — review tab lags downstream sync under load; TC-00348 uses a fresh course + reload-poll, TC-00346 uses the unlagged unit-page path |
| `LIB-003`   | `openedx/frontend-app-authoring` (library components page, `target-size` after publish) | open, no `fixme` — baselined on the `library-components` scan only; CI `main` only; TC-00321 passes |
| `LIB-005`   | `openedx/frontend-app-authoring` (library MFE ships almost no test ids) | open, no `fixme` — anchors are Paragon event keys, `name`/`id` attributes and positions; every positional action waits for the request it must cause |
| `LIB-004`   | `openedx/frontend-app-authoring` (library MFE: five serious axe rules) | open, no `fixme` — baselined as `LIBRARY_A11Y_BASELINE` on the library scans only |
| `STUDIO-009` | `openedx/edx-platform` (Studio settings save endpoints renamed on `main`) | open, no `fixme` — the API client picks the route per release
| `PLAT-009`  | `openedx/edx-platform` (course-home navigation view after a publish) | **filed** - [#39116](https://github.com/openedx/openedx-platform/issues/39116), `fixme` in `tests/studio/outline/sidebar.spec.ts` — 500 until the CMS worker outline task lands
| `INSTR-001` | `openedx/frontend-app-instructor` (no test ids of its own)    | open, no `fixme` — selectors anchor on roles and structure
| `INSTR-002` | `openedx/edx-platform` (report generation returns no task id) | open, no `fixme` — the suite polls the report list instead
| `INSTR-003` | `openedx/edx-platform` (`grading-config` is an HTML dump)     | open, no `fixme` — the suite reads the grading policy API instead
| `INSTR-004` | `openedx/edx-platform` (course-home dates API omits a graded subsection) | open, no `fixme` — date extensions are asserted through `progress`
| `INSTR-005` | `openedx/frontend-app-instructor` (prohibited ARIA attribute) | open, no `fixme` — baselined on the instructor scans only
| `INSTR-006` | `openedx/frontend-app-instructor` (filter selects unnamed)    | open, no `fixme` — baselined on the instructor scans only
| `INSTR-007` | `openedx/edx-platform` (problem-responses report fails silently) | **filed** - [#39119](https://github.com/openedx/openedx-platform/issues/39119), no `fixme` — the spec waits for the Blocks API before generating
| `INSTR-008` | `openedx/edx-platform` (TC-00522, wg-build-test-release#608)  | **not reproduced** — case committed green on both targets
| `LIB-006`   | `openedx/frontend-app-authoring` (TC-00422, wg-build-test-release#604) | **not reproduced** — case committed green on both targets
| `AUTH-001`  | `openedx/frontend-app-authoring` (Verawood sidebar a11y)      | open, no `fixme` — baselined as `SIDEBAR_A11Y_BASELINE` on the sidebar scans only
| `AUTH-002`  | `openedx/frontend-app-authoring` (unit card not selectable from the outline) | open, `fixme` in `tests/studio/sidebar/outline-info.spec.ts` (TC-00489)
| `AUTH-003`  | `openedx/frontend-app-authoring` (TC-00491/00496, wg-build-test-release#587/#578) | **not reproduced** — all three cases committed green on both targets
| `TAG-001`   | `openedx/edx-platform` (author tagging its own course)        | **resolved** — no defect; the earlier 403 was a pre-migration course
| `TAG-002`   | `openedx/frontend-app-authoring` (outline tag counts, wg-build-test-release#592) | open, no `fixme` — the drawer cases assert the API, never the badge
| `FILES-001` | `openedx/frontend-app-authoring` (TC-00137, frontend-app-authoring#3096) | **not reproduced** — case committed green on both targets
| `FILES-002` | browser policy, not a product defect                          | open, no `fixme` — clipboard unreadable on `http`; copy asserted by URL resolution
| `FILES-003` | `openedx/frontend-app-authoring` (Files table ARIA)           | open, no `fixme` — `aria-allowed-attr` baselined on the `studio-files` scan only |
| `TAG-003`   | `openedx/frontend-app-authoring` (tag drawer a11y)           | open, no `fixme` — three rules baselined on the `studio-tag-drawer` scan only |
| `STUDIO-010` | `openedx/frontend-app-authoring` (Textbooks list markup, unnamed card actions on verawood) | open, no `fixme` — `list` and `button-name` baselined on the `studio-textbooks` scan only |
| `PLAT-010`  | `openedx/edx-platform` (`content_staging` clipboard save)     | **filed** - [#39118](https://github.com/openedx/openedx-platform/issues/39118), no `fixme` — surfaces as a retried flake in `clipboard.spec.ts`

---

## Content findings (demo course)

Not product bugs: these live in the demo course's authored content, so they are
fixed in the course package rather than in a platform repo. Tests that fail only
because of authored content are marked `test.fixme()` referencing the ID.

### `DEMO-001` — About-page overview links are distinguished by colour alone

**Where:** the course `overview` field (served by
`GET /api/courses/v1/courses/{course_key}`, rendered on the About page inside
`div.xblock-student_view-about` → `div.course-about-overview`). Measured on
`course-v1:OpenedX+DemoX+DemoCourse`, a default Tutor install with the "My Open
edX" theme.

**Finding:** axe `link-in-text-block` (**serious**, WCAG 2.1 A, SC 1.4.1 Use of
Color) fails on one node:

```html
<a href="https://openedx.org/faq/" target="_blank">Open edX® FAQ page</a>
```

inside `section.faq > section.responses`. Both of the rule's conditions fail:

- contrast against surrounding text is **1.72:1** (minimum 3:1) — link `#006daa`
  on body text `#454545`;
- `text-decoration-line: none`, so nothing but colour distinguishes it.

**Suggested fix:** in the demo course's overview HTML, style in-text links so they
are distinguishable without colour (an underline is the conventional fix).
Every other `<a>` added to authored content will trip the same rule, so a
course-wide pass is worth doing rather than a one-line fix.

**Wider contributor (not a demo-course problem):** the default theme's link colour
has no 3:1 contrast against body text and does not underline in-text links, so
_any_ authored content with a plain `<a>` fails this rule on any Open edX screen.
That is the same class of theming debt the global a11y baseline already tolerates
`color-contrast` for. Worth raising separately if a theme fix is on the table;
fixing the course content does not fix it for other courses.

**Repro:**

```bash
npx playwright test tests/lms/catalog/discovery.spec.ts \
  --grep "course content distinguishes links"   # drop the fixme to see it fail
```

**Coverage impact:** the TC-00018 About-page test tolerates the rule for that one
screen via `additionalBaseline` so it can still gate the rest of the page, and a
dedicated `fixme` test asserts the untolerated behaviour. Drop that `fixme` and
the `additionalBaseline` entry together once the content is fixed.

### `DEMO-002` — answers are discoverable for only one graded subsection, so a passing grade is out of reach

**Where:** `course-v1:OpenedX+DemoX+DemoCourse`, problem `showanswer` settings.

**Corrected from an earlier reading.** An initial probe looked for
`button.show-answer` and found none, and concluded no problem offered Show Answer.
That selector is wrong — the control is `button.show` (label in `.show-label`) —
and the setting is genuinely present on some problems. The modulestore is the
authority; read from the published branch:

| `showanswer` | Problems | Effect                                                                                                         |
| ------------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| `always`     | 3        | Show Answer renders immediately                                                                                |
| `never`      | 4        | never renders                                                                                                  |
| unset        | 22       | inherits the course default (`finished`), and with `max_attempts` unset (unlimited) it never becomes reachable |

So **3 of 29 problems** will reveal a correct answer. Verified in the browser on
`3b8100660f...` ("Simple Numerical Input Problem"): `button.show` is present, and
the revealed answer is written into `p.answer`.

**The passing-grade conclusion still holds, for a different reason.** All three
`always` problems sit in the **same** graded subsection:

| Subsection                    | Assignment type | Weight | Points | Answers discoverable?             |
| ----------------------------- | --------------- | ------ | ------ | --------------------------------- |
| Basic Assessment Tools        | Basic           | 0.30   | 20     | **yes** — all 3 `always` problems |
| Intermediate Assessment Tools | Intermediate    | 0.35   | 15     | no (unset → `finished`)           |
| Advanced Assessment Tools     | Advanced        | 0.35   | 14     | no (ORA / LTI / custom-JS)        |

The pass mark is 0.5. Scoring **100% of Basic still yields only 0.30 weighted**, so
no honest strategy reaches a pass; the two subsections that would close the gap
have no discoverable answers at all.

**Suggested fix:** set `showanswer` to a learner-visible value (`always`, or
`attempted` if the answer should follow an attempt) on the Intermediate problems as
well — enough to make a pass reachable. That is also better demo-course behaviour
in its own right: the course exists to demonstrate the platform's problem types,
and a learner exploring it cannot currently see a worked answer for most of them.

**Coverage impact:** TC-00031's passing-grade half is a `test.fixme` in
`progress.spec.ts`, and the epic's "`is_passing == true`" criterion cannot be met
on this course. The `revealAnswer()` path now exists on `ProblemBlock` and works,
so the fixme lifts as soon as the content allows a pass.

**Also recorded:** 2 of the 29 problems offer demand hints (`button.hint-button`,
panel `.problem-hint .notification-hint`, `.is-hidden` toggled). Those anchors are
confirmed and live in `src/config/selectors/capa.ts`.

---

## Product findings

### `PLAT-001` — a content block taller than the viewport can never be completed

**Where:** completion-on-view for HTML blocks
(`data-mark-completed-on-view-after-delay`, 5000ms on a default install), as
rendered in the learning MFE's unit iframe.

**Finding:** the platform marks a block viewed only while it is **entirely**
within the viewport, so a block taller than the window never completes — no
amount of scrolling or waiting helps. Because a unit completes only when all of
its children do, and a course completes only when all units do, a single
over-tall block makes 100% completion unreachable for that learner.

**Measured**, same block (933px tall) and same course, varying only the window:

| Viewport height | Block completes                        |
| --------------- | -------------------------------------- |
| 720px           | **no** (never, at any scroll position) |
| 1400px          | yes, after the 5s dwell                |

Every other block in the unit (254–707px) completed at 720px, so height is the
only variable. In the demo course this is not an edge case: of 10 problem-bearing
units checked, **7 contain a block too tall for a 720px viewport** (problem
blocks of 832px, 957px, 975px, 2169px, …).

**Learner impact:** a learner on a laptop or phone cannot complete a long
question or a long text page by reading it. On a 2169px block, no consumer
display can.

**Suggested fix:** count a block as viewed when it is sufficiently intersecting
the viewport (a partial-visibility threshold), or when the viewport has been
scrolled past its end — not only on full containment.

**Coverage impact:** `UnitPage.showBlock()` grows the browser viewport to fit a
tall block (up to 6000px) so completion coverage can run at all, and reports
`too-tall` for anything beyond that instead of waiting out a completion that
cannot arrive. Remove that workaround once the visibility rule is fixed.

### `LEARN-001` — course-home section headers nest focusable content in a `role="button"`

**Where:** course home outline (`${APPS}/learning/course/{course_key}/home`), the
six collapsible section headers.

**Finding:** axe `nested-interactive` (**serious**, WCAG 2.2 AA) fails on all six:

```
target: li:nth-child(1) > .pgn_collapsible > .collapsible-trigger[role="button"]
html:   <div class="collapsible-trigger" role="button" tabindex="0" aria-expanded="false">
why:    Element has focusable descendants
```

A `role="button"` element is announced as a single control, so a screen-reader or
keyboard user is told "button" and then meets focusable content inside it that the
role does not account for — the inner controls are not reliably reachable, and the
outer control's purpose is ambiguous.

**Suggested fix:** make the header's clickable area a real `<button>` containing
only its label, with the section's links and controls as siblings rather than
descendants — the pattern Paragon's own disclosure components use.

**Coverage impact:** TC-00025 tolerates the rule for this screen via
`additionalBaseline` so the rest of the page still gates, and a dedicated
`test.fixme` asserts the untolerated state. Drop both together when it is fixed.

### `PLAT-002` — two video handlers return 500 on a default install

Observed on every video unit of the demo course, on a stock Tutor install:

```
500 GET /courses/yt_video_metadata?id=lVPPPpyUOR4
500 GET /courses/{course_key}/xblock/{video_block}/handler/transcript/translation/en?videoId=...
```

The first is the YouTube metadata proxy, which has no API key configured — a
missing key is an expected state and should not be a server error. The second
asks for an English transcript the demo course does not ship. Both surface in the
browser console as "Unable to get youtube video metadata" and "ERROR while
fetching captions"; playback still works, so this is error-handling, not a
regression. A 4xx or an empty payload would be the right answer to both.

### `PLAT-003` — video completion cannot be driven by a test

**Note:** This finding is not quite correct, updated context is at:
https://github.com/openedx/end-to-end-tests/issues/41

**Resolution (2026-09-14):** the demo course's Jellyfish video is an HTML5 source
(S3-hosted mp4), and the platform's player is plain JS around a `<video>` element,
so a test can seek past `completionPercentage` and play; the block's own
`publish_completion` follows. `VideoBlock.watchToEnd` does this, `completeUnit`
drives HTML5 videos, and `unit-completion.spec.ts` asserts the block's completion
through the Blocks API. The source bytes are served from a bundled WebM via
`page.route`, so the S3 dependency is gone. The other ten demo videos are
YouTube-only and remain not drivable; the 100%-completion `fixme` stays for ORA,
LTI and custom-JS problems.

**Finding:** there is no way for a test to complete a video block without
watching it in real time.

- The demo course's videos are **YouTube-hosted**, so the player lives in a
  cross-origin iframe that a test cannot script — and any coverage built on it
  depends on youtube.com, which an air-gapped installation will not have.
- The page exposes no handle to the player: `window.VideoState[blockId]` exists
  but is an empty object on this version, and the jQuery data on `.video` carries
  metadata only, so there is nothing to call `seekTo` on.

**Suggested fixes**, either of which unblocks it:

1. ship a short **self-hosted HTML5 video** in the demo course, so a test can
   drive a real `<video>` element and no third party is involved;
2. expose the player state (or a completion-relevant hook) on the block element,
   the way other blocks expose `data-` attributes.

**Coverage impact:** TC-00022's third mechanism ("a unit with a video completes on
watching") is a `test.fixme` in `unit-completion.spec.ts`.

### `CAT-160` — clear-search button needs two clicks (filed as catalog#160)

Search field wrapper paints above the reset button; `elementFromPoint` at the
button's centre returns `div.pgn__searchfield`, so a pointer click moves focus
first and only a second click activates. `CatalogPage.clearSearch()` uses keyboard
activation and passes; `clearSearchByClick()` exists for the `fixme` test that
covers the pointer path.

### `CAT-161` — empty search dead-ends with the wrong error (filed as catalog#161)

Two observable halves, both `fixme` tests in `discovery.spec.ts`:

1. an in-page search matching nothing leaves the previous result cards rendered,
   so the page shows courses and "no results" at once;
2. the empty state drops the search and filter UI entirely and renders "There are
   currently no courses available in the catalog", which is both wrong (the
   catalog is not empty) and a dead end.

### `BASE-001` — the shell's header and footer brand links have no accessible name

**Where:** the page chrome every `frontend-base`-shelled MFE is served in,
observed on the catalog MFE's screens (`/catalog/courses` and
`/catalog/courses/{course_key}/about`) on a default Tutor `main` install with the
"My Open edX" theme.

**Finding:** the brand link — rendered once in the header and once in the footer —
wraps a logo image with no `alt` attribute and no other content:

```html
<a class="pgn__hyperlink default-link standalone-link p-0" href="/learner-dashboard">
  <img src="http://local.openedx.io/theming/asset/images/logo.png" style="max-height: 2rem;" />
</a>
```

so each of the two links fails two axe rules:

- `image-alt` (**critical**, WCAG 1.1.1) — 2 nodes, the header and footer logos;
- `link-name` (**serious**, WCAG 2.4.4/4.1.2) — 2 nodes, the links wrapping them.

A screen reader announces the link as its URL, and it is the first interactive
element on every page of the MFE.

**Suggested fix:** give the logo an `alt` in the shell's header and footer brand
components (the site name is already available to them), or label the link
itself. `alt=""` alone is not enough — the link would still have no name.

**Not caught until now** because the catalog specs failed earlier, on the missing
search field (`TUTOR-001`), before reaching their accessibility gate.

### `TUTOR-001` — every `FEATURES[...]` toggle Tutor sets is silently ignored

**Status:** fix open upstream as
[tutor#1477](https://github.com/overhangio/tutor/pull/1477), *"fix: set Open edX
feature toggles as flat Django settings"*. Nothing to file; kept here because it
explains two separate symptoms this suite hit.

**Where:** `overhangio/tutor` on `main` (observed with
`overhangio/openedx:22.0.2-main`), and any plugin patching the `FEATURES:` block
of `lms.env.yml` (Tutor's `common-env-features` patch point).

**Root cause:** edx-platform flattened the `FEATURES` dict into the Django
settings namespace
([openedx/edx-platform#37067](https://github.com/openedx/edx-platform/pull/37067)),
so entries like `ENABLE_COURSE_DISCOVERY` are now plain settings. As tutor#1477
puts it, assigning to `FEATURES[...]` from a downstream settings module "no longer
has any effect, and the value silently stays at its default." Tutor still writes
the old location, so its toggles — and any plugin's — are dropped without a
warning.

Measured in the running LMS:

```
FEATURES['ENABLE_COURSE_DISCOVERY'] = True     # Tutor/plugin sets this; nothing reads it
settings.ENABLE_COURSE_DISCOVERY    = False    # authoritative; served to the MFEs
FEATURES['SKIP_EMAIL_VALIDATION']   = True     # same story
```

**The two symptoms it produced here:**

1. **No catalog search.** `GET /api/mfe_config/v1` reports
   `ENABLE_COURSE_DISCOVERY: false` (the API reads the flat setting), and
   `frontend-app-catalog` renders its search field and filters only when that is
   `true`. So the catalog silently degrades to a plain paginated course list on an
   install that believes course discovery is enabled.
2. **`SKIP_EMAIL_VALIDATION` not applied**, so registered accounts stayed
   inactive — which sent us looking for an account-provisioning bug that was not
   there.

The pattern to watch for: a toggle that reads as enabled in
`env/apps/openedx/config/lms.env.yml` but `False` in the running settings. Check
the flat setting, not the `FEATURES` entry.

**Status in this suite:** not a `fixme`, and no workaround in code. `catalog-search`
is a declared capability, declared for **every** release in
`.ci/openedx-releases.json` — search is meant to be on, so an install missing it
should fail that coverage loudly rather than skip it. The specs that put search
under test are tagged `@catalog-search` and assert the field is really present;
every other catalog spec reaches its course through `locateCourseInCatalog`, which
pages the list where there is no search field. Until tutor#1477 lands, a run
against a stock install will fail the search-field test — which is the intended
signal, not a suite bug.



**Second instance (2026-09-10, Epic 8 probe):** `ENABLE_COURSEWARE_INDEX`. The
CMS reads the top-level `settings.ENABLE_COURSEWARE_INDEX` (False on Tutor
`main`) while Tutor sets only `FEATURES["ENABLE_COURSEWARE_INDEX"]` (True), so
the outline's Reindex button and `course_index.reindex_link` disappear even for
global staff and the catalog search index never sees new courses. Indexing is
meant to be on by default; the suite's CI Tutor patch forces the top-level
setting (and the guarded `FEATURES` key) alongside `ENABLE_COURSE_DISCOVERY`
and `SKIP_EMAIL_VALIDATION`.
---

# Epic 7 — findings log

## Product findings (Studio)

### `STUDIO-001` — concurrent course creation under a new organization returns 500

**Where:** `POST /course/` (`cms/djangoapps/contentstore/views/course.py`,
`create_new_course` → `organizations.data.create_organization`). Measured on
Tutor `main` (`overhangio/openedx:22.0.2-main`), 2026-09-04.

**Finding:** two requests creating courses under an organization short name that
does not exist yet, sent at the same moment (two Playwright workers), race the
org's get-or-create: one wins, the other gets

```
MySQLdb.IntegrityError: (1062, "Duplicate entry 'E2E' for key
'organizations_organization.organizations_organization_short_name_ef338963_uniq'")
```

and the client receives an HTTP 500 with no body. No course is written for the
failed request (the modulestore is untouched), so a retry succeeds once the org
exists.

**Suggested fix:** `create_organization` should use `get_or_create` inside a
transaction with `IntegrityError` handling (re-`get` on conflict), or
`create_new_course` should ensure the organization before entering the
course-creation path.

**Coverage impact:** `ensureCourse` (`src/api/course-factory.ts`) re-checks and
retries on a 5xx from creation, bounded. A `test.fixme` in
`tests/studio/bootstrap.spec.ts` names the intended behaviour. CI is unaffected
in practice because the Tutor job passes an existing `ORG`; the race bites only
when the first two courses of a brand-new org are created in parallel.

**Repro:** with a fresh org short name, fire two `POST /course/` bodies
`{org, number: <distinct>, run, display_name}` concurrently as a course creator.

### `STUDIO-002` — new-organization enforcement is UI-only in course creation

**Where:** `POST /course/` (`cms/djangoapps/contentstore/views/course.py`,
`create_new_course`). Measured on Tutor `main` and `redwood`, 2026-09-08.

**Finding:** a course creator whose Studio Home reports
`allow_to_create_new_org: false` is shown, in the authoring MFE, an organization
**dropdown** restricted to their allowed orgs — no free-text field — so the UI
prevents creating a course under a brand-new organization. The server does not
enforce the same rule: a direct `POST /course/` from that session with an
organization short name that does not exist yet is accepted (HTTP 200) and both
the organization and the course are created. The flag gates the UI only.

**Suggested fix:** enforce `allow_to_create_new_org` server-side in
`create_new_course` (reject an unknown organization with 403 when the creator may
not create organizations), matching what the MFE already does.

**Coverage impact:** TC-00248 (create under a new organization) is driven through
the UI, which only offers the free-text organization field to a session with
`allow_to_create_new_org: true` (a superuser) — so the suite runs that case as the
admin, via the `newOrgCreator` fixture. A `test.fixme` in
`tests/studio/home/create-course.spec.ts` names the intended server-side refusal.

**Repro:** as a course creator with `allow_to_create_new_org: false`, `POST
/course/` `{org: <new short name>, number, run, display_name}`; the course is
created despite the flag.

### `STUDIO-003` — authoring MFE course outline ships critical a11y violations

**Where:** `frontend-app-course-authoring`, the course outline
(`${APPS}/course-authoring/course/<key>`). Measured on Tutor `main`, 2026-09-08,
on a freshly created (empty) course.

**Finding:** axe reports two critical WCAG 2.2 AA violations in the page's own
chrome, independent of authored content:

- `aria-allowed-attr` (4 nodes): the right-hand sidebar's icon buttons ("Info",
  "Add", "Align", "Help") carry `aria-selected`, which is not a supported ARIA
  attribute on a `button`.
- `button-name` (1 node): the card action toggle
  (`.pgn__dropdown-toggle-iconbutton`) has no accessible name (no text,
  `aria-label`, or `aria-labelledby`).

A `color-contrast` (serious) violation on the empty-outline placeholder text is
the same theming debt already baselined suite-wide.

**Suggested fix:** drop `aria-selected` from the sidebar icon buttons (or make
them real tabs/toggles with the right role), and give the card action toggle an
`aria-label`.

**Coverage impact:** tolerated on this screen only via `additionalBaseline` in the
`checkA11y` call in `tests/studio/home/create-course.spec.ts`, so the same rules
still fail on any other screen. Attached to the report for triage. Remove the
tolerance when this lands.

### `STUDIO-004` — the Grading page's grade-range editor is unlabelled

**Where:** `frontend-app-course-authoring`, Settings → Grading
(`${APPS}/<mount>/course/<key>/settings/grading`). Measured on Tutor `main`,
2026-09-08, on a fresh course (default Pass/Fail range).

**Finding:** axe reports two critical WCAG 2.2 AA violations in the editor's own
controls, independent of authored content:

- `button-name` (1 node per draggable boundary): the range handles
  (`button.grading-scale-segment-btn-resize[role="slider"]`) carry
  `aria-valuemin/max/now` but no accessible name, so a screen reader announces
  "slider, 50" with no indication of which grade boundary it moves.
- `label` (3 nodes on the default range, one per segment): the segment name
  fields (`input[data-testid="grading-scale-segment-input"]`) have no label,
  placeholder, or `aria-label`; the failing bucket's disabled field included.

**Suggested fix:** give each handle an `aria-label` naming the boundary it moves
(e.g. "Boundary between A and B"), and each segment field an `aria-label`
("Grade name") — the range text beside it is not associated with the input.

**Coverage impact:** tolerated on this screen only via `additionalBaseline` in
the `checkA11y` call in `tests/studio/settings/grading.spec.ts`, so the same
rules still fail on any other screen. Remove the tolerance when this lands.

### `STUDIO-005` — the LMS enrollment-details read endpoint is stale after a window change

**Corrected from an earlier reading.** This finding first claimed the authoring
MFE's enrollment date field would not persist a *changed* value and that its time
field ignored UTC, and both TC-00298 and TC-00299 were `test.fixme`. Both of those
were **test-side**, not platform bugs, and are fixed:

- The "changed value does not persist" symptom was a race in the page object: the
  save was clicked before `react-datepicker` committed the just-typed date, so the
  form serialized the previous value. It reproduced only under load. `commitDate`
  now waits for the calendar to close (the commit's own DOM signal) before
  returning, so a following save reads the settled value. Verified stable across
  parallel runs.
- The "time field is not UTC" symptom was the runner's local zone leaking in;
  pinning the browser to UTC (`timezoneId: 'UTC'` in `playwright.config.ts`) makes
  a time entered to the minute round-trip exactly.

Both TC-00298 and TC-00299 now drive the enrollment window entirely through the
MFE and pass.

**What is real, and stays here:** the LMS enrollment-details read endpoint
`GET /api/enrollment/v1/course/<key>` is **intermittently stale** for several
seconds after an enrollment-window change. Measured on Tutor `main`, 2026-09-08:
after a `PUT course_details` moved the window from a future to a past window,
Studio's own `course_details` and the actual enrollment enforcement (a learner's
`POST /api/enrollment/v1/enrollment`) both reflected the new window at once, but
this read endpoint kept returning the previous window past a 5-second wait on some
runs (and was fresh on others). It appears to be a cached/eventually-consistent
read, not the authoritative source.

**Suggested fix:** invalidate or shorten the cache on this endpoint when a course's
enrollment dates change, so a read reflects a write promptly.

**Coverage impact:** none, and no `fixme`. The Schedule & Details specs confirm a
saved window on Studio's `course_details` (its prompt source of truth) and assert
enforcement through a real enroll attempt, rather than polling this endpoint. The
platform's refusal to move the enrollment start **forward** once a learner is
enrolled is correct behavior (an enrolled learner cannot be stranded outside the
window); TC-00298/TC-00299 order their one enrollment last so no window change
follows it.

### `PLAT-006` — `PUT course_details` ignores `self_paced` unless `start_date` is in the body

**Where:** `PUT /api/contentstore/v1/course_details/<key>`
(`cms/djangoapps/contentstore/rest_api/v1/views/course_details.py` →
`openedx.core.djangoapps.models.course_details.CourseDetails.update_from_json`).
Measured on Tutor `main` (`overhangio/openedx:22.0.2-main`), 2026-09-08.

**Finding:** the view documents partial bodies ("multiple details can be updated
in a single request"), and every other field measured honours one. `self_paced`
does not: `{"self_paced": true}` (or `"true"`, the string the MFE sends) answers
HTTP 200 with the *unchanged* pacing echoed back, and a subsequent GET agrees.
Adding the course's own current `start_date` to the same body —
`{"self_paced": true, "start_date": "2040-01-01T00:00:00Z"}` — makes the same
request take effect. The course start was far in the future throughout, so
`can_toggle_course_pacing` held; the pacing branch evidently sees a course
start only when the request carries one. Side effect: with the pacing change
dropped, the accompanying `certificates_display_behavior` reset to
`EARLY_NO_INFO` still happens, leaving an instructor-paced course with the
self-paced display behaviour.

**Suggested fix:** toggle pacing from the stored start when the body has none, or
reject the partial body with 400 rather than answering 200 without applying it.

**Coverage impact:** none in the specs (the MFE sends the full object).
`updateCourseDetails` in `src/api/course-settings.ts` adds the current
`start_date` when a caller changes `self_paced` alone, so the suite's own
preconditions behave. Remove that once fixed.

**Note (2026-09-15, Epic 9):** a body that carries `self_paced: true` *together
with* a `start_date` in the **past** (the certificate course seed's
`2000-01-01`) also leaves pacing unchanged, with HTTP 200. That is the
platform's `can_toggle_course_pacing` rule — pacing may only change before the
course starts — not this defect; the seed therefore leaves pacing alone and
relies on `certificates_display_behavior: early_no_info` for certificate
visibility. Set pacing *before* moving a course's start into the past.

### `STUDIO-006` — the certificates page is empty until the course has a certificate-bearing mode

**Where:** `frontend-app-course-authoring`, Settings → Certificates
(`${APPS}/<mount>/course/<key>/certificates`). Measured on Tutor `main`,
2026-09-09, on a freshly created course.

**Finding:** a fresh course has only the `audit` mode, which bears no certificate,
so the certificate API reports `course_modes: []` / `has_certificate_modes: false`
and the authoring MFE renders the certificates page **with no create control at
all** — no "Add certificate", no form, no message. The certificate REST API still
accepts writes; only the MFE is blank.

**Worked around in the suite (resolved for coverage).** The `certificateCourseMode`
fixture gives the worker course an `honor` mode before the certificate specs run,
using the `staff` (superuser) session: `POST /api/course_modes/v1/courses/<key>/`
`{course_id, mode_slug: "honor", mode_display_name, currency, min_price}` → `201`.
That is a staff-only endpoint (`JWT_RESTRICTED_APPLICATION_OR_USER_ACCESS`); the
`author` role is refused with `403`, which is why the fixture uses the captured
`staff` state (`src/api/course-modes.ts`, `ensureCertificateBearingMode`). With a
mode present the MFE shows the authoring form, and TC-00275 (three signatories),
TC-00276 (preview) and TC-00279 (activate) drive it and pass. Where no admin
account is configured the fixture skips those cases.

**Still worth filing (product side):** on a course with no certificate-bearing
mode the MFE should not render a blank page — a disabled preview, or a clear
"add a certificate-bearing mode first" call to action, would tell an author what
to do. Nothing here is a suite `fixme` any more; this is the upstream UX gap.

**Remaining `fixme`s (unrelated to the mode):** TC-00277 (enable automatic
certificate generation) toggles the `certificates.auto_certificate_generation`
waffle switch in Django admin, which the MFE does not expose; TC-00278 (complete
the course and receive the certificate) needs gradable content — Epic 8.

### `STUDIO-007` — the Import page's file input has no accessible label

**Where:** `frontend-app-course-authoring`, Tools → Import
(`${APPS}/<mount>/course/<key>/import`). Measured on Tutor `main`, 2026-09-09.

**Finding:** the Import dropzone (`[data-testid="dropzone"]`) renders a hidden
`<input type="file">` with no associated label, a **critical** axe `label`
violation ("Form elements must have labels") in the MFE's own chrome. The
dropzone works; only the accessibility annotation is missing.

**Tolerated in the suite (not softened elsewhere):** TC-00309 drives the real
upload and asserts success against the import-status API; the a11y scan on that
screen baselines `label` for that scan only (`additionalBaseline: ['label']` in
`tests/studio/tools/import.spec.ts`), the same pattern as `STUDIO-004`. Remove the
tolerance when the label lands upstream.

### `STUDIO-008` — the Custom Pages draggable list nests `<div>`s directly in a `<ul>`

**Where:** `frontend-app-course-authoring`, Content → Pages → Custom Pages
(`${APPS}/<mount>/course/<key>/custom-pages`). Measured on Tutor `main`, 2026-09-09.

**Finding:** the dnd-kit sortable list renders each page as a `<div>` (the sortable
wrapper) directly inside the list's `<ul>`, so the list's direct children are not
`<li>`/`<script>`/`<template>` — a **serious** axe `list` violation ("`<ul>` and
`<ol>` must only directly contain …") in the MFE's own chrome. Reordering works;
only the list markup is wrong.

**Tolerated in the suite (not softened elsewhere):** TC-00237 drives the real
keyboard drag-reorder and asserts the new order against both Studio's tabs API and
the LMS course-home tabs; the a11y scan on that screen baselines `list` for that
scan only (`additionalBaseline: ['list']` in
`tests/studio/custom-pages/custom-pages.spec.ts`). Remove the tolerance when the
list markup is fixed upstream.

### `STUDIO-009` — the Settings save endpoints were renamed and re-versioned on `main`

**Where:** `frontend-app-course-authoring`, the Schedule & Details and Grading
settings pages. Measured from CI artifacts against `overhangio/openedx:*-main`,
2026-09-13 (the newest `main` image; a slightly older local Tutor `main` still
used the old endpoints).

**Finding:** the "Save changes" bar's write moved to new Contentstore endpoints:

| Save | Newest `main` | Older releases (incl. verawood) |
| --- | --- | --- |
| Grading | `PATCH /api/contentstore/v3/authoring_grading/<key>/` | `POST /api/contentstore/v1/course_grading/<key>` |
| Schedule & Details | `PUT /api/contentstore/v3/course_details/<key>/` | `PUT /api/contentstore/v1/course_details/<key>` |

The save itself works on `main` (the new endpoint returns 200 and persists). This
is a suite-compatibility issue, not a platform defect: nothing to file. The tell
in CI was every `grading.spec.ts` and `schedule-details.spec.ts` test timing out
on `page.waitForResponse` while the CMS log showed the save succeeding — the old
`method`+`urlIncludes` match never fired.

**Handled in the suite:** the two page objects match the save by its resource
family with any write method (`isSettingsWrite` in
`src/pages/studio/wait-for-write.ts`), so the same spec passes on both the old and
new endpoints. If `main`'s endpoints settle differently again, widen those two
predicates rather than pinning a single version.

### `PLAT-007` — the Blocks API returns 500 to a learner enrolled in a course that has not started

**Where:** `GET /api/courses/v1/blocks/?course_id=<key>&username=<learner>&depth=all`
(`openedx/core/djangoapps/content/block_structure/block_structure.py` →
`__getattr__`, raised from the course-blocks transformers). Measured on Tutor
`main` (`overhangio/openedx:22.0.2-main`), 2026-09-10, on a freshly created
course left at its default start date (`2040-01-01`), with a learner enrolled
through the public enrollment API.

**Finding:** the request answers HTTP 500 with the LMS error page. The log shows
`KeyError: 'self_paced'` → `AttributeError: Field self_paced does not exist`
while the transformers read the course block's fields. Every neighbouring
learner endpoint handles the same state cleanly: `course_home/course_metadata`
returns `course_access: {has_access: false, error_code: "course_not_started"}`,
`course_home/v1/outline` and `/navigation` answer `403 {"detail": "Course has not
started"}`, `courseware/sequence/<id>` answers 404, and the same Blocks API call
as global staff answers 200. Once the course start date is moved into the past
the learner's call answers 200 as well.

**Suggested fix:** the Blocks API should answer the not-started case the way the
course-home APIs do (403 with the access error) rather than reaching the
transformers with a course whose fields were never collected.

**Coverage impact:** the future-dated publish cases (BTR TC-00150/151/152) read
the learner's access from `course_metadata` and the 403 on the outline API, not
from the Blocks API. A `fixme` test asserting the Blocks API answers a non-5xx
status on a not-started course records the intended behaviour.

---

### `PLAT-008` — completion-only subsection prerequisite gating is configured by Studio but not enforced by the LMS

**Where:** subsection prerequisite gating (`cms` outline Configure dialog →
`xblock_handler` `prereqMinScore`/`prereqMinCompletion`; enforced in the LMS by
`milestones` / `gating`). Measured on Tutor `main` (`overhangio/openedx:22.0.2-main`),
2026-09-11.

**Finding:** with `enable_subsection_gating` on, a subsection required as a
prerequisite at **minimum score 0, minimum completion 100** is shown as `gated`
by Studio (`xblock/outline` `visibility_state: "gated"`, `prereq_min_completion:
100`), but the LMS does **not** gate it: a fresh enrolled learner's
`GET /api/courseware/sequence/<gated>` returns `gated_content.gated: false`
immediately. Raising the minimum score to `1` (leaving completion at `100`) makes
the LMS enforce the gate (`gated: true`), as does a score-only gate
(`min_score: 50, min_completion: 0`). So the subsection-gating milestone is only
created when `min_score >= 1`; a completion-only requirement (`min_score: 0`)
produces no gate, and the author's completion threshold is silently ignored.

| min_score | min_completion | Studio `visibility_state` | LMS `gated` |
| --------- | -------------- | ------------------------- | ----------- |
| 0         | 100            | gated                     | **false**   |
| 1         | 100            | gated                     | true        |
| 50        | 0              | gated                     | true        |

**Suggested fix:** create the gating milestone whenever a completion requirement
is set, not only when a score requirement is; or have Studio refuse / warn on a
completion-only prerequisite it cannot enforce.

**Coverage impact:** TC-00159 (gating by minimum score) passes and is the working
cross-service gating round trip. TC-00160 (gating by minimum completion) is a
`test.fixme` written against the intended behaviour (`min_score: 0,
min_completion: 100` should gate until the prerequisite is completed), so no
assertion is softened to match the bug.

### `PLAT-009` — the course-home navigation API returns 500 between a publish and the outline task landing

**Where:** `GET /api/course_home/v1/navigation/<course key>`
(`lms/djangoapps/course_home_api/outline/views.py` → `filter_inaccessible_blocks`
→ `learning_sequences.api.get_user_course_outline`). Measured on Tutor `main`,
2026-09-11, on a course whose first section had just been created and published
through the Studio xblock API, with `ENABLE_COURSEWARE_INDEX = True` and the
Studio content search (Meilisearch) on.

**Finding:** the request answers HTTP 500 with the LMS error page and the log
shows `LearningContext.DoesNotExist` → `CourseOutlineData.DoesNotExist: No
CourseOutlineData for <course key>`. The `learning_sequences` outline that the
view depends on is written by the CMS worker (`Replacing CourseOutline for …`)
on the publish signal; on this run that task landed 33 s after the publish
because the same queue was carrying thousands of per-block
`content.search.tasks.upsert_xblock_index_doc` tasks (a burst of them taking
~21 s each). Until it lands, the learner's course home cannot be built at all,
while the neighbouring `course_home/v1/outline` view for the same state and the
Blocks API both answer 200.

**Suggested fix:** the navigation view should treat a missing `CourseOutlineData`
the way the outline view does (fall back to the unfiltered blocks, or answer an
empty model / 404) rather than a 500. Separately, the per-block search-index
fan-out on every publish is what starves the outline task; batching it per
course would shrink the window.

**Coverage impact:** `fetchCourseNavigation` reports a 500 as "no navigation
yet" so polls under `TIMEOUTS.contentPublish` ride out the window. A `fixme`
test in `tests/studio/outline/sidebar.spec.ts` records the intended non-5xx
answer immediately after a publish.

---

### `PLAT-005` — `delete_course` logs a Meilisearch `invalid_search_filter` error

**Where:** `./manage.py cms delete_course <key>` → `course_deleted` signal →
`listen_for_course_delete` (search indexing). Tutor `main`, Meilisearch 1.36.

**Finding:** the delete succeeds, but the course-info index removal fails with
`Index tutor_course_info: Attribute course is not filterable` (available:
`catalog_visibility, enrollment_end, language, modes, org`), so a deleted course
may linger in the catalog search index until the next full reindex.

**Coverage impact:** none for the suite (it cannot delete courses); relevant to
operators following the README's clean-up recipe — after purging `E2E*`
courses, run `./manage.py cms reindex_course --all --setup` if they still show
in catalog search. Worth an upstream check of the index's filterable attributes.

## Account menu trigger is matched by username, but `main` renders the full name

`src/pages/lms/auth/account-menu.page.ts:32` opens the header account menu with
`getByRole('button', { name: /<username>/i })`, documented as relying on the
accessible name "Account menu for {username}". On a current `main` Tutor install
the trigger's accessible name is the **profile name** ("E2E Test 1e7709ed93fb"),
not the username (`e2e_1e7709ed93fb`), so the click times out after 15s.

Effect: `tests/lms/auth/logout.spec.ts` fails on `main` before it reaches any
assertion (verified identical at `6707515` and with local changes, so it is not
caused by the capability/backend work). Sign-in itself succeeds — the screenshot
shows the learner on the dashboard.

Options: match the profile name (`identity.name`) instead of the username; match
either; or target the trigger structurally and drop the name entirely. Note the
suite's own `AccountMenu.signOutDirect()` already exists as the resilient path.

## Studio authentication on external-identity installs (post PR #16 rebase) — addressed

**Resolved on epic_7 (2026-09-08):** `AccountBackend.signInStudio` added, with the
`cms-sso` handshake as `defaultSignInStudio`; `provisionAuthorSession`, the
`staff` role and the `studioNewcomer` fixture all go through `accountSignInStudio`.
`defaultGrantCourseCreator` left as-is (documented that an external-identity
install needs the override). Unit coverage: `tests/auth/author-capture.spec.ts`
against `tests/accounts/fixtures/external-identity-backend.plugin.ts`, plus
dispatch/fallback cases in `tests/accounts/auth-flows.spec.ts`. Still to do:
verify against a real external-IdP target. Original notes follow.

PR #16 (main) made the learner auth contract backend-aware for installs whose
accounts originate outside the LMS: sign in only when registration leaves the jar
anonymous, through the backend's `signIn` override. The epic_7 rebase inherited
that for the `learner` half of `provisionAuthorSession`, but the Studio half is
still stock-only:

- `src/api/studio-session.ts` `establishStudioSession` hard-codes the `cms-sso`
  OAuth handshake (`GET <studio>/login/` → LMS `/oauth2/authorize` → back). It
  should work wherever the LMS session is valid regardless of how it was
  obtained, but an install that fronts Studio with its own IdP has no backend
  hook to replace it. Candidate: an optional `AccountBackend.establishStudioSession`
  (or `signInStudio`) with the OAuth handshake as `default-flows.ts` default,
  mirroring `signIn`.
- `defaultGrantCourseCreator` uses Studio's Django admin as `ADMIN_*`; already
  overridable via `grantCourseCreator`, so no change needed, but document that an
  external-identity install almost certainly needs the override.
- `staff` on a `studio` install also calls `establishStudioSession` directly in
  `src/auth/api-provider.ts`; route it through the same seam.
- No unit coverage yet for the author path against a `register`-overriding
  backend (cf. `tests/auth/learner-capture.spec.ts` on main). Add a stub-request
  spec once the seam exists.

Not blocking the rebase; verify against a real external-IdP target before
designing the hook.

---

## Epic 9 — Instructor dashboard findings (2026-09-15)

Measured on Tutor `main` (`overhangio/openedx:22.0.2-main`, edx-platform
`b94dca4e`; `frontend-app-instructor-dashboard` `v2.0.0-alpha` build in
`overhangio/openedx-mfe:22.0.0-main`).

### `INSTR-001` — the instructor dashboard MFE ships no test ids of its own

**Where:** `frontend-app-instructor-dashboard`, every tab.

**Finding:** the rendered dashboard carries only Paragon's own `data-testid`s
(`data-table-container`, `dropdown`, …). Tabs, action buttons, modal fields and
table controls have neither test ids nor stable `name`/`id` attributes in most
places (the Grading tab's problem-location input has no `name` at all), and
every label is localized. The `specify-learner-field` / `specify-problem-field`
ids that appear in the MFE's source exist only in its unit tests.

**Suggested fix:** `data-testid`s on the tab links, the per-tab primary
actions, modal form controls and table row actions, as the authoring MFE has.

**Coverage impact:** `src/config/selectors/instructor.ts` anchors on tab ids in
URLs, the few `id`/`name` attributes that exist, Paragon structural classes and
**button position**, and every page-object action waits for the exact
instructor-API request it must fire so a mis-located control fails loudly. The
order-based anchors are the suite's most brittle and are documented per MFE
version.

### `INSTR-002` — report generation returns no task id, and only in-flight tasks are listed

**Where:** `POST /api/instructor/v2/courses/<key>/reports/<type>/generate`
(`GenerateReportView`), `GET …/instructor_tasks` (`InstructorTaskListView`).

**Finding:** `generate` answers `200 {status: "<localized sentence>"}` with no
`task_id`, while `regenerate` (certificates) and the grading writes do return
one; `instructor_tasks` lists only tasks still running, so a finished task and
one that never ran (or failed, see `INSTR-007`) both leave it empty. A client
cannot correlate a report to its task or read a failure reason;
`GET …/tasks/<id>` exists but nothing hands the id out.

**Suggested fix:** return `{task_id, status_url}` from `generate` as the other
task-queuing views do.

**Coverage impact:** completion is observed as the conjunction "no task of that
type is listed **and** a download of that type that was not in the listing taken
before the request appears" (`waitForReport`), with both last readings in the
failure message.

### `INSTR-003` — `grading-config` is a preformatted HTML dump

**Where:** `GET /api/instructor/v2/courses/<key>/grading-config`.

**Finding:** the endpoint answers `text/html` (a `<pre>` of the grader class
names and assignment types) rather than JSON, which the MFE shows verbatim in
the "View Grading Configuration" modal.

**Coverage impact:** the suite asserts the modal opens and reads the policy from
Studio's grading API instead; nothing is asserted on the dump.

### `INSTR-004` — the course-home dates API lists no assignment for a graded subsection with a due date

**Where:** `GET /api/course_home/v1/dates/<key>` as an enrolled learner, on an
instructor-paced course whose graded subsection received a `due` date through
the Studio xblock API and then a per-learner extension (`change_due_date`).

**Finding:** in 240 s of polling the response listed only the course-start
block; the subsection never appeared, before or after the extension. The
learner's `progress` API (`section_scores[].subsections[].due`) showed the
original and then the extended date within a second, and `graded_subsections`
on the instructor API listed the subsection at once.

**Suggested fix:** to be confirmed upstream — whether `get_course_assignments`
expects a self-paced course, a different publish path, or is simply lagging
behind the collected block structure by more than the publish delay.

**Coverage impact:** the extension spec's learner oracle is `progress`, not the
dates API.

### `INSTR-005` — the "Problem location" info icon uses a prohibited ARIA attribute

**Where:** Grading and Data Downloads tabs, the tooltip trigger beside "Problem
location": `<span class="pgn__icon pgn__icon__sm" aria-label="Example format for
problem location">`.

**Finding:** axe `aria-prohibited-attr` (serious): `aria-label` is not permitted
on a `span` without a role.

**Suggested fix:** render the icon with `role="img"` or move the label to the
button/tooltip that owns it.

**Coverage impact:** baselined for the instructor specs
(`INSTRUCTOR_A11Y_BASELINE`), reported on every run.

### `INSTR-006` — the table filter selects have no accessible name

**Where:** Enrollments tab (`select[name=isBetaTester]`) and Date Extensions tab
(`select[name=blockId]`), the `DataTable` filter controls.

**Finding:** axe `select-name` (critical): the selects have no associated label
or `aria-label`.

**Suggested fix:** a visually-hidden label or `aria-label` on each filter.

**Coverage impact:** baselined for the instructor specs, reported on every run.

### `INSTR-007` — a problem-responses report queued before the block structure is collected fails silently

**Where:** `POST …/reports/problem_responses/generate` →
`instructor_task.tasks.calculate_problem_responses_csv`.

**Finding:** for a problem whose section was published within the last
publish-task delay (~30 s on Tutor), the view answers `200` and the task then
raises `UsageKeyNotInBlockStructure` (the report reads the *collected* block
structure, which the delayed publish task rebuilds). With `INSTR-002` there is
no task id to read the failure from, and `instructor_tasks` is simply empty: to
the instructor the report just never appears.

**Suggested fix:** validate the location against the collected structure in
the view (400 with a clear message), or have the task fall back to the
modulestore; and return a task id (`INSTR-002`).

**Coverage impact:** the spec waits for the learner's Blocks API — built from
the same structure — to serve the unit before generating.


### `INSTR-008` — single-learner grade adjustments: not reproduced on this target

**Where:** the instructor dashboard's single-learner grading actions
(`tests/lms/instructor/grading-single-learner.spec.ts`), `main` and `verawood`.

**What happens:** the BTR sheet marks TC-00522 (Course Grading — Single Learner
Adjustments) **Failed**, pointing at wg-build-test-release#608. On both CI
targets the case passes: the rescore, the attempt reset and the score override
each complete and the learner's `progress` reflects the new score.

**Coverage impact:** open only upstream. TC-00522 is committed green, not
`fixme`d. Revisit if a PR target regresses; the sheet's reading may be tied to
a release or a configuration this suite does not reproduce.


## Epic 10 — Content libraries findings (2026-09-15 planning probe; `PLAT-010` from the CI runs of 2026-09-16/17)

### `LIB-001` — deleting a v2 library that ever held a container returns 500

**Where:** `DELETE /api/libraries/v2/<lib>/` (`content_libraries/rest_api/libraries.py`
`delete` → `api/libraries.py` `delete_library`) on the local Tutor `main` stack
(22.0.2-main, edx-platform master `e2e8edf73f`).

**What happens:** a library that only ever held components deletes cleanly
(`200 {}`, then `404`). A library that has had a unit/subsection/section, or a
publish with side effects, answers `500 {"error": "The Studio servers encountered
an error"}`; the CMS log shows `django.db.models.deletion.RestrictedError:
Cannot delete some instances of model 'LearningPackage' because they are
referenced through restricted foreign keys: 'EntityListRow.entity',
'DraftSideEffect.cause', 'DraftSideEffect.effect', 'PublishSideEffect.cause',
'PublishSideEffect.effect'`. Reproduced twice: the seeded probe library
(`lib:E2E:probe509391`) and a fresh library with one unit + one component
(`lib:E2E:blk509932`); both remain on the local stack. The legacy library
`library-v1:E2E+lp509391` from the same probe also remains (`DELETE /library/…`
is `405` — no delete API at all).

**Coverage impact:** the `seededLibrary` / `authoringLibrary` fixtures (Epic 10)
attempt the delete, type the `500` as `LibraryDeleteRestrictedError`, annotate
the test and carry on; libraries accumulate like courses, and run-unique slugs
keep runs apart. Upstream ask: cascade the delete (the MFE offers "Delete
library") or refuse with a `400` that names the blocker.

### `LIB-002` — the course "Review Content Updates" page lags the downstream sync state under load

**Where:** the course Libraries page's "Review Content Updates" tab
(`/course/<key>/libraries`, `frontend-app-course-authoring`) on local Tutor
`main`. The tab lists course blocks linked to a library that have a newer
published version.

**What happens:** after a library block/container is edited and published, the
downstream's own state flips to `ready_to_sync: true` promptly
(`GET /api/contentstore/v2/downstreams/<key>/` — what `waitForSyncAvailable`
polls). The Review tab, however, is populated from the course-content search
index, which is reindexed asynchronously (Celery) on publish. Under worker load
— several library publishes into the same course in one worker — the tab keeps
showing "All components are up to date" for well over two minutes even though
the API already reports the update, because the reindex is queued behind the
other publishes. In a fresh course with a single downstream it appears in ~30s.

**Coverage impact:** TC-00348 (`tests/studio/library/reuse-unit.spec.ts`) drives
the accept/reject from this page. It uses a fresh per-test `authoringCourse` (so
the course's review index stays small) and `courseLibrariesPage.waitForReviewCard`
reload-polls the tab under `TIMEOUTS.libraryMigration`. TC-00346, the same
accept/reject from the **unit page's** "Update available" affordance (which reads
the downstream directly, not the search index), has no such lag. Upstream ask:
back the Review tab with the downstreams API, or surface the index-staleness so a
just-published update is not silently reported as "up to date".

### `LIB-003` — a sub-24px touch target on the library components page after a publish (CI `main` only)

**Where:** the library-authoring MFE's components page (`/library/<key>/components`)
right after publishing a component from its sidebar (TC-00321,
`tests/studio/library/components.spec.ts`), on the CI `main` image. axe rule
`target-size` (WCAG 2.2 AA 2.5.8, serious), one node.

**What happens:** `checkA11y(page, { label: 'library-components' })` reports
`target-size (serious): All touch targets must be 24px large, or leave
sufficient space — 1 node` after the publish. It does not reproduce on the
verawood CI image nor on a local Tutor `main` from 2026-09-15, so it is a
recent main-only MFE change; the offending node is not named in the CI summary
(the run's `error-context.md` artifact has it).

**Coverage impact:** open, no `fixme` — `target-size` is baselined on this one
scan (`additionalBaseline` in TC-00321), not in `LIBRARY_A11Y_BASELINE`, so the
other library a11y scans still guard it. Upstream ask: identify the control
(likely a sidebar status/publish affordance) and give it a 24px target.

### `LIB-004` — the library-authoring MFE ships five serious a11y violations across its surfaces

**Where:** `frontend-app-authoring`'s library pages on `main` and `verawood`,
measured by `checkA11y` (axe, WCAG 2.2 AA critical/serious) while building
Epic 10: library home / info sidebar, component sidebar, collection page, and
the legacy-library migration stepper.

**What happens:** `nested-interactive` (the header's "Library Info" button
nests interactive content), `aria-hidden-focus` (the component sidebar keeps
focusable content inside an `aria-hidden` tab pane), `label` (the collection
page's description textarea has no label), `list` (the collection breadcrumb
`<ul>` holds a non-`<li>` child), and `scrollable-region-focusable` (the
migration stepper's library list scrolls without keyboard access).

**Coverage impact:** open, no `fixme` — baselined as `LIBRARY_A11Y_BASELINE`
(`tests/studio/library/helpers.ts`) on the library scans only, so every other
scan still guards these rules. Upstream ask: one issue per rule against the MFE.


### `LIB-005` — the library-authoring MFE ships almost no test ids

**Where:** `frontend-app-authoring`'s library tree (library page, sidebar,
container pages, the course "Library Content" picker, the preview-changes
modal, the course Libraries page, the migration stepper), `main` and `verawood`.

**What happens:** only the card / sidebar kebab toggles, the sidebar, the block
preview iframe and two error alerts carry `data-testid`; every button label,
tab title and menu item is localized copy.

**Coverage impact:** open, no `fixme` — `src/config/selectors/library.ts`
anchors on Paragon tab `eventKey`s, `name` / `id` attributes, the few test ids
and structural position, each with the label it stands in for; every action
that clicks by position waits for the exact request it must cause and returns
the response, so a mis-located control fails loudly. Upstream ask: test ids on
the Add Content buttons, the preview-changes footer, the picker's library cards
and the migration stepper's destination radios.


### `LIB-006` — revoking library reuse by toggle: not reproduced on this target

**Where:** the library Team/Manage Team reuse toggle
(`tests/studio/library/public-read.spec.ts`), `main` and `verawood`.

**What happens:** the BTR sheet marks TC-00422 (turning the "allow reuse by all
Studio users" toggle off revokes access for unaffiliated users) **Failed**,
pointing at wg-build-test-release#604. On both CI targets the case passes: after
the toggle is turned off, a user with no grant on the library is refused again,
which is the API-side oracle the spec asserts.

**Coverage impact:** open only upstream. TC-00422 is committed green, not
`fixme`d. Note the sheet's scenario is written against the **Manage Team**
console, which is admin-only here (see `LIB-005` and the Epic 12 plan), so the
sheet may be recording a UI failure this suite reaches by a different route.

### `PLAT-010` — the user clipboard save deadlocks under parallel authoring load

**Where:** `POST /api/content-staging/v1/clipboard/`
(`openedx/core/djangoapps/content_staging/views.py:136` →
`api.py:189 save_xblock_to_user_clipboard` → `models.py:176 UserClipboard.save`)
on the CI Tutor stacks, both `main` and `verawood` (runs 35164428487 and
35216220303, 2026-09-16/17).

**What happens:** the copy answers `500 {"error": "The Studio servers
encountered an error"}` and the CMS log carries
`django.db.utils.OperationalError: (1213, 'Deadlock found when trying to get
lock; try restarting transaction')` from the `update_or_create` on the row. Rare
and load-dependent: four deadlocks in a whole run on `main`, two of them this
save. Each worker copies as its own author, so the contention is not two workers
writing one clipboard row; it is the surrounding transaction taking locks in an
order that another concurrent CMS write can cross.

**Coverage impact:** TC-00334/00335
(`tests/studio/library/clipboard.spec.ts`) fail the first attempt and pass on
retry, so they report as flaky rather than failed. Not worked around — a retry
inside the API client would hide a genuine platform race that an author hits too.
Upstream ask: retry the deadlock (`transaction.atomic` plus a bounded retry) or
narrow the transaction, as the platform does elsewhere for 1213.

## Epic 11 — Authoring sidebar / tagging findings (2026-09-16)

### `AUTH-001` — the Verawood authoring sidebar carries two critical axe violations

**Where:** the course-outline and unit page with the Verawood sidebar open
(`src/generic/sidebar`), `main` and `verawood`.

**What happens:** an axe scan of the outline / unit page with the sidebar open
reports two critical WCAG violations the suite does not otherwise see:
`button-name` (icon-only rail/panel buttons with no accessible name) and
`aria-allowed-attr` (a control carrying an unsupported ARIA attribute).

**Coverage impact:** open, no `fixme` — baselined on the sidebar scans only
(`SIDEBAR_A11Y_BASELINE` in `tests/studio/sidebar/helpers.ts`, merged through
`checkA11y`'s `additionalBaseline`), never added to the global baseline, so a
new regression elsewhere still fails. Upstream ask: give the icon buttons a
discernible name and drop the unsupported ARIA attribute.

### `AUTH-002` — a unit cannot be selected from the course outline by a normal click

**Where:** the course-outline sidebar, `main` and `verawood`.

**What happens:** a section or subsection card selects (opens its Info sidebar)
on a click of its `*-card__content` row. A **unit** card has no such clickable
row — `unit-card__content` is the empty children container (height 0), and the
header is filled by the title link (which *navigates* to the unit page), the
edit button and the kebab. The card's own `onClick` only fires when
`e.target === e.currentTarget`, but the header covers the card entirely, so no
click point selects the unit. Measured 2026-09-16.

**Coverage impact:** TC-00483 asserts sidebar switching across the section and
subsection levels (both select cleanly); selecting a unit *from the outline*
is left to TC-00489 (Epic 11 step 3), which reads unit Info by navigating to
the unit page. Upstream ask: give the unit card a select affordance distinct
from its navigating title link.

**Against the sheet:** the sheet marks TC-00489 **Passed**, with the note that
it was "blocked on testing if the library reference icon shows up until 587 is
fixed" (wg-build-test-release#587). This suite skips TC-00489 instead, because
the outline-side selection the case describes has no click point here. The two
readings are not in conflict: the sheet exercised the unit page, which this
suite also reaches, and left the outline path untested.

### `AUTH-003` — the sheet-failed Add-sidebar cases do not reproduce

**Where:** the Add sidebar on the course outline and on the unit page
(`tests/studio/sidebar/add-sidebar.spec.ts`), `main` and `verawood`.

**What happens:** the sheet marks two Add-sidebar cases **Failed** —
TC-00491 (the Add button opens the Add sidebar on the course outline,
wg-build-test-release#587) and TC-00496 (the Add sidebar on the unit page allows
adding new components, no issue recorded) — and carries
wg-build-test-release#578 against TC-00494, which it nonetheless passed. All
three pass here on both targets: the sidebar opens from either surface with its
Add New and Add Existing tabs, both tabs are reachable, and every component type
creates.

**Coverage impact:** open only upstream. The three cases are committed green,
not `fixme`d, and none of them is worked around. Recorded so a later red does
not look like a new regression: the sheet has already seen these fail somewhere.

### `TAG-002` — outline tag counts refresh late, and the course-level count not at all

**Where:** the course-outline cards' tag-count badge and the course-level
"Course Tags — Manage Tags" field, authoring MFE, `main` and `verawood`.

**What happens:** two readings from the sheet, both recorded against cases it
passed. On the section and subsection cards the count "changes not at once but
after page refresh" while the drawer's own count updates immediately
(TC-00181/00182). At the **course** level the count never updates at all: the
sheet passes TC-00190 and TC-00193–00196 "partially", noting that the final step
— "I also see the tag count updated in the Course Tags—Manage Tags field on the
Course Outline Page" — does not work, and files wg-build-test-release#592.

**Coverage impact:** open, no `fixme`, and deliberately not asserted. The 21
drawer cases take `object_tags` (values and lineage) and
`object_tag_counts?count_implicit` as their oracle, both of which are correct
immediately, so none of them depends on the rendered badge. That is why all five
course-level cases pass here while the sheet records them as partial: this suite
does not read the surface the defect is on. Upstream ask: refresh the card badge
and the course-level field from the same response the drawer already uses. If
the badge is ever asserted, it must be polled after a reload, and the
course-level field will fail until #592 is fixed.


## Epic 11 — Files / taxonomy admin findings (steps 7–11, 2026-09-16)

### `FILES-002` — the Files copy-URL actions cannot be verified via the clipboard on `http`

**Where:** the Studio Files page 3-dot menu ("Copy Studio Url", "Copy Web Url"),
`main` and `verawood`.

**What happens:** the copy actions write to the clipboard, which the browser
denies to a page served over `http` (the local and CI targets), so a test
cannot read back what was copied.

**Coverage impact:** open, no `fixme`. TC-00140 asserts the two copy items are
*offered* and that the asset's own URL *resolves* (a `GET` of
`assetStudioUrl(...)` returns `200`), rather than reading the clipboard — the
copy source is correct even though the copy itself is unobservable here.

### `FILES-001` — sort/filter under a search: not reproduced on this target

**Where:** the Studio Files DataTable, `main` (Tutor, 2026-09-16).

**What happens:** the BTR sheet marks TC-00137 (sort/filter with no search term)
as a UI failure (frontend-app-authoring#3096). On this target the case **passes**
— sorting by name and filtering by type both compose correctly with no search —
so TC-00137 is committed green, not `fixme`d. Revisit if a PR target regresses.

### Taxonomy list route can cold-load to Studio home

**Where:** the authoring MFE `/authoring/taxonomies` route, `main`.

**What happens:** a hard navigation straight to the taxonomy list occasionally
settles on Studio home before the router registers the tagging routes (the
`/taxonomy/<id>` detail route does not show this). `TaxonomyListPage.goto`
reloads once when the Import button has not appeared, which the router has by
then registered. Not a coverage gap — noted so the reload is not mistaken for
dead code.

### `TAG-001` — resolved: an author can tag a course it created this run

Confirmed in 0b: the earlier `403` on `object_tags` was a pre-migration course,
not a permission model. A course the worker author creates in the run carries
`course_admin`, so the author's own `PUT object_tags` succeeds (the basis for the
`tagging-bootstrap` author case). No open issue.

### `FILES-003`, `TAG-003`, `STUDIO-010` — a11y debt the new page scans found

**Where:** the authoring MFE's Files page, tag drawer and Textbooks page, on
`main` and on `verawood`.

**What happens:** none of these pages had an accessibility gate until now (Epic
11 scanned only the sidebar). Adding one to each surfaced, on a clean course:

```
Files page      aria-allowed-attr (critical, 2 nodes)
Tag drawer      aria-allowed-attr (critical, 3 nodes)
                button-name       (critical, 2 nodes)
                label             (critical, ~40 nodes)
Textbooks page  list              (serious, 1 node)
                button-name       (critical, 3 nodes) — verawood only
```

The drawer's ~40 unlabelled form controls are its taxonomy tree: every checkbox
in the tree is a form element with no accessible label.

The Textbooks `button-name` violation is release-specific, and the only one of
these rules that differs between releases: on `verawood` the textbook card's
three icon-only actions render with no accessible name, and on `main` they are
labelled. It is the one thing the first CI run of these new gates caught that
local measurement on `main` could not — the scan passed on `main` and failed on
`verawood` in the same run
([#35794526218](https://github.com/openedx/end-to-end-tests/actions/runs/35794526218)).

**Coverage impact:** open, no `fixme`. Each rule is baselined **on its own scan
only**, the way `STUDIO-007`/`STUDIO-008` are, so the pages are gated against
everything else and the debt is reported on every run. The Textbooks
`button-name` entry is baselined unconditionally rather than gated on a
capability — a capability describes a *feature* a release has, not debt it
carries, and an unconditional per-scan entry keeps the rule gating every other
page on both releases. It comes out when the oldest supported release ships the
labelled card actions. This is the answer to the
review question on PR #79 about whether these gates should wait: adding them cost
three lines per page and found four rules across three pages.

### The upload-agreement bump raced its own acceptance (suite-side)

**Where:** `tests/studio/files/agreements.spec.ts` TC-00505, measured 2026-09-22.

**What happens:** the admin stores `UserAgreement.updated` **to the second**, and
`is_current` treats an acceptance at the same second as "at or after". Bumping
`updated` to *now* therefore left the acceptance current whenever the two landed
in the same second — the flake CI reported on this case in consecutive runs.

**Coverage impact:** fixed in the suite, nothing to file. The bump is now taken
from the acceptance the platform recorded plus one second, waited for rather than
slept through, and clamped to the present so `updated` never lands in the future
(which would leave the type outstanding for every worker sharing it).

## Epic 12 — Roles and Permissions (RBAC) findings (steps 1–8, 2026-09-19 … 2026-09-21)

Measured on Tutor `main` with openedx-authz 1.23.0 and the admin-console MFE it
ships; `verawood` runs 1.21.0. Where a finding decides how a case is written,
the case names the ID.

### `RBAC-001` — the admin console ships almost no test ids, and every label is localized

**Where:** `frontend-app-admin-console` (the Roles and Permissions console),
`main` and `verawood`.

**What happens:** the app's own DOM carries exactly **one** test id of its own,
`toggle-scope-<external key>` in the Assign Role wizard's scope step. Everything
else — tabs, filters, the table, the pager, the audit view's controls, the error
views — is Paragon markup whose only distinguishing features are localized
labels and accessible names ("Assign Role", "Permission granted in Course Admin
role", "Back to Studio").

**Coverage impact:** open, no `fixme`. ADR-0002 forbids matching localized text,
so `src/config/selectors/admin-console.ts` anchors on Paragon's own test ids,
ARIA roles with no name, and structural classes, each documented with the label
it stands in for and the release it was read on. Upstream ask: test ids on the
tabs, the filter toggles, the row actions and the error views.

### `RBAC-002` — openedx-authz exposes no assignment rows for superusers or global staff

**Where:** `GET /api/authz/v1/users/<username>/assignments/` and
`assignments/`, openedx-authz 1.23.0.

**What happens:** a superuser's own assignments read back as `count: 0`, and no
platform-level row appears in `assignments/` either. The console can only render
what the API returns, so its "platform-managed" treatment of Super Admin and
Global Staff rows has no subject on this target.

**Coverage impact:** open. TC-00568 is held as `fixme` + `knownGap`; re-check on
a release that returns those rows.

### `RBAC-003` — three migrated course roles render an empty Role cell

**Where:** the console's Team Members table and user audit view, `main`.

**What happens:** the console knows ten role names (the four library roles,
`course_admin`, `course_staff`, `course_editor`, `course_auditor`,
`django.superuser`, `django.globalstaff`). The three roles automatic migration
also creates — `course_limited_staff`, `course_data_researcher` and
`course_beta_tester` — have no display name, so their rows render with the Role
cell empty. This is the sheet's own note on TC-00619.

**Coverage impact:** open, no `fixme`. The Role cell is asserted by the presence
of its `data-role` attribute, never by its text, and TC-00619 asserts the empty
cell as the measured behaviour.

### `RBAC-004` — a failed list produces a toast with a retry, not a Server Error view

**Where:** the console's Team Members tab, `main`.

**What happens:** with `assignments/` answering `500`, the console renders its
empty table plus **two** alerts carrying Close and Retry, and its pager reads
"Page 1, Current Page, of -1". The sheet's TC-00440/00441/00443 describe a
full-page Server Error view offering *Reload Page* and *Back to Libraries*; this
build has neither. Its only full-page error view is the 404.

**Coverage impact:** open, no `fixme`. The three cases are asserted against what
the console actually renders — the alert with a retry, an empty table, exactly
one retry request, and no alert after navigating away — under ADR-0003.

### `RBAC-005` — both pager buttons carry the `previous` class

**Where:** the console's table footer, `main`.

**What happens:** the Previous and Next controls render with the same
`previous` class, so the class cannot tell them apart.

**Coverage impact:** open, no `fixme`. The pager is located by position
(previous first, next second), which the selector module records.

### `RBAC-006` — accessibility debt in the console

**Where:** `frontend-app-admin-console`, `main`.

**What happens:** three axe rules fail on a clean console: the Team Members
table nests `role="cell"` inside a cell (`aria-required-parent`), the header's
icon-only control has no accessible name (`button-name`), and the audit view's
breadcrumb puts a non-`<li>` child in its `<ol>` (`list`).

**Coverage impact:** open, no `fixme`. The three rules are baselined for console
scans only (`ADMIN_CONSOLE_A11Y_BASELINE`), so they are reported on every run
without failing it, exactly as the library MFE's debt is handled.

### `RBAC-007` — self-protection is a UI courtesy; the API allows self-revoke

**Where:** the console's user audit view, and `PUT /api/authz/v1/roles/users/`.

**What happens:** the console omits the delete control on your own admin row
(rather than disabling it with an explanatory tooltip, as the sheet describes),
and in a course-scope audit view the Actions cell is empty for your own row. The
platform does not enforce the rule at all: a library admin revoking its own
`library_admin` is answered `207 role_removed`.

**Coverage impact:** open. TC-00567 asserts the console's behaviour and carries
a `knownGap` recording that the API does not enforce it. Upstream ask: refuse
the self-revoke server-side.

### `RBAC-008` — the 404 view's only action does nothing

**Where:** the console's not-found view (`/authz/<unknown route>`), `main`.

**What happens:** the view's single action ("Back to Studio") is an anchor with
no `href` whose click handler leaves the route unchanged.

**Coverage impact:** open. TC-00442 is a `test.fail` — the body clicks the
action and waits for the route to change, which is the behaviour the fix should
produce.

### `RBAC-009` — the permission matrix loses its row labels sideways and offers no scroll to top

**Where:** the console's Roles and Permissions tab, `main`.

**What happens:** the column headers are correctly sticky (`position: sticky;
top: 0`), but the row-label column is `position: static`, so scrolling the
matrix horizontally takes the permission names off screen; and the tab renders
no scroll-to-top control (its only buttons are the two Courses / Libraries
switches). TC-00569 asks for both.

**Coverage impact:** open. The clauses this build does implement are asserted
green; the two missing ones are a `fixme` + `knownGap` sibling carrying the same
test id, written as the case asks.

### `RBAC-010` — a `library_user` sees draft content

**Where:** content libraries v2 (`GET blocks/?library_id=`) and the library MFE,
`main`.

**What happens:** a `library_user` — the read-only library role — is listed
every draft an author sees: a never-published block appears in their card list
and in the API listing, and a published block with unpublished changes shows its
**draft** display name. TC-00573 asks for draft items to be invisible to this
role.

**Coverage impact:** open. TC-00573 asserts the read-only half that does hold
(no create, edit, publish or commit, and no authoring control in the MFE) and a
`fixme` + `knownGap` sibling carries the draft clause.

### `RBAC-011` — a `library_contributor` is offered an item publish the platform refuses

**Where:** the library MFE's item sidebar, `main`.

**What happens:** a `library_contributor` opening a draft item is shown the
"Publish Changes (Draft)" control and its two-step confirmation; confirming
sends `POST blocks/<key>/publish/`, which answers **403**, and the item stays a
draft. The library-level "Publish All" is correctly hidden from this role, so
only the per-item control is wrong.

**Coverage impact:** open, no `fixme`. TC-00572 drives the click and asserts the
403 and the unchanged draft — the platform decides, and a control that cannot
work is the case's real risk.

### `RBAC-012` — a `library_author` may publish the library, contrary to the sheet

**Where:** openedx-authz library roles, `main` (1.23.0).

**What happens:** `library_author` holds `content_libraries.publish_library_content`,
the info panel offers it "Publish All", and `POST <lib>/commit/` answers 200.
TC-00571 states that a Library Author cannot publish the library.

**Coverage impact:** open, no `fixme`. TC-00571 asserts the platform's model
(the role may publish) and records the discrepancy, rather than encoding the
sheet's wording. Whether the role definition or the sheet is wrong is a product
decision, so this is recorded for the release team rather than filed as a bug.

### `RBAC-013` — the public-reuse switch saves silently

**Where:** the library info sidebar's "Allow public read" switch, `main`.

**What happens:** flipping the switch sends `PATCH <lib>/` and it answers 200,
but the MFE shows nothing in either direction — no toast, no alert, no saving
state (`#toast-root` stays empty). TC-00575 and openedx-authz#239's acceptance
criteria both ask for a success message (and an error message with a retry on
failure).

**Coverage impact:** open. TC-00575 reads the outcome from the API and the
outsider's picker; the message clause is a `fixme` + `knownGap` sibling.
