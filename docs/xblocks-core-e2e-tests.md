# E2E tests for the core XBlocks (xblocks-core)

The Playwright tests in this repo that exercise the XBlocks now packaged in
[xblocks-core](https://github.com/openedx/xblocks-core), grouped by block. It
covers tests already on `main` and the ones added on the `kdmccormick/xblocks-core`
branch (all under [`tests/studio/xblocks-core/`](../tests/studio/xblocks-core/)),
written to check [xblocks-core#244](https://github.com/openedx/xblocks-core/pull/244)
for regressions.

**Validation (2026-11-02).** Every test listed in the per-block tables passed on
both targets:

- **master**: a sandbox tracking `openedx-platform` master, with the released
  xblocks-core.
- **refactor**: a local `tutor local` (Tutor `main`) running
  `openedx-platform@kdmccormick/xblocks-core` with an xblocks-core `2.0.0.dev1`
  wheel built from #244 the way the release workflow builds it.

**Origin** column: **main** = already on `main`; **branch** = added on
`kdmccormick/xblocks-core`. Tests where a core block is only incidental content
(e.g. the html + problem default unit used by outline, tagging, RBAC and
analytics tests) are left out.

Most branch tests share one of two harnesses:

- **Library round trip** ([`round-trip.ts`](../tests/studio/xblocks-core/round-trip.ts)):
  author the block in a V2 library via the API, check its stored OLX, add it to a
  course unit through the Studio library picker, check the course copy, publish,
  and open it as a fresh learner.
- **Problem runtimes** ([`problem/problem-runtimes.ts`](../tests/studio/xblocks-core/problem/problem-runtimes.ts)):
  open the same problem in the LMS (learner), the Studio unit preview, or the
  library preview, which each serve the block's assets their own way.

## All blocks

| Test | What it checks | Origin |
| --- | --- | --- |
| [every core block survives export and import into a new course](../tests/studio/xblocks-core/olx-export-import.spec.ts#L75) | A unit holding one of each core block, each with a distinctive field, is exported to OLX and imported into a fresh course; every block arrives with its category and field intact (the blocks' XML handling now lives in `xblocks_core.legacy_utils`). | branch |

## Problem (`problem`)

| Test | What it checks | Origin |
|---|---|---|
| [hint, save, submit, reset, show answer (lms / studio / library)](../tests/studio/xblocks-core/problem/actions.spec.ts#L49) | In each runtime, every learner control wired up by `ProblemBlockDisplay.js` (the block's webpack bundle) works: hint shows, Save notifies, wrong answer marked incorrect, Reset clears, right answer marked correct, Show Answer reveals the solution. | branch |
| [click the image and submit (lms / studio)](../tests/studio/xblocks-core/problem/image-input.spec.ts#L33) | Image mapped input: a click records coordinates (`imageinput.js`, in the bundle) and grades correct. | branch |
| [numerical preview (lms / studio)](../tests/studio/xblocks-core/problem/static-inputs.spec.ts#L73) | Typing a numerical answer fills the live preview (`formula_equation_preview.js`, a collected static file, plus the `input_ajax` handler); submitting grades correct. | branch |
| [chemical equation preview (lms / studio)](../tests/studio/xblocks-core/problem/static-inputs.spec.ts#L104) | Typing an equation fills the live preview (`chemical_equation_preview.js`). | branch |
| [drag and drop v1 (lms)](../tests/studio/xblocks-core/problem/static-inputs.spec.ts#L215) | `drag_and_drop.js` (collected static) loads and builds the drag UI with its draggables. | branch |
| [library → Studio → learner answers correctly](../tests/studio/xblocks-core/problem.spec.ts#L22) | Library round trip; the learner answers in the browser and sees the correct mark. | branch |
| [authors each common problem type and the learner is graded on it](../tests/studio/components/problems.spec.ts#L38) | Multiple choice, checkboxes, dropdown, numerical and text input authored via the API; right and wrong answers grade correct / incorrect. | main |
| [the unit's problem picker offers every common type](../tests/studio/components/problems.spec.ts#L88) | Studio's Add Component → Problem picker lists all five common types. | main |
| [gates a subsection by minimum score in a prerequisite subsection](../tests/studio/outline/gating.spec.ts#L38) | Scoring on a prerequisite problem unlocks a gated subsection. | main |
| [marks a subsection graded and it counts on the learner progress page](../tests/studio/outline/grading.spec.ts#L28) | A graded subsection with a problem counts on the learner's progress page. | main |
| [shows a learner and their state on a problem](../tests/lms/instructor/grading-single-learner.spec.ts#L32) | The instructor dashboard reads one learner's score and attempts on a problem. | main |
| [rescores, overrides, resets attempts and deletes history for one learner](../tests/lms/instructor/grading-single-learner.spec.ts#L71) | Per-learner rescore, score override, attempt reset and state deletion. | main |
| [rescores and resets attempts for every learner on a problem](../tests/lms/instructor/grading-all-learners.spec.ts#L24) | All-learner rescore and attempt-reset tasks. | main |
| [generates and downloads the problem responses report for a problem](../tests/lms/instructor/data-downloads.spec.ts#L168) | The problem responses report for one problem. | main |

## Video (`video`)

| Test | What it checks | Origin |
|---|---|---|
| [library → Studio → learner watches to completion](../tests/studio/xblocks-core/video.spec.ts#L27) | Library round trip of an HTML5-only video (source stubbed); the player (`video-xblock.js`, the webpack bundle) loads it and watching records completion. | branch |
| [Video: the player initializes in the Studio unit preview](../tests/studio/xblocks-core/studio-and-library.spec.ts#L106) | `video-xblock.js` initializes the player in the Studio preview (CMS runtime). | branch |
| [Video: the player initializes in the library preview](../tests/studio/xblocks-core/studio-and-library.spec.ts#L134) | Same, in the library preview (Learning Core runtime). | branch |
| [adds a YouTube video and sets an advanced download option](../tests/studio/components/video.spec.ts#L27) | Studio video editor saves a YouTube ID and the download option. | main |
| [creates a video block from a YouTube URL](../tests/studio/library/components.spec.ts#L74) | Library UI adds a video block. | main |
| [sets custom start and stop times on a library video](../tests/studio/library/components.spec.ts#L140) | Library video editor saves start and stop times. | main |

## Text (`html`)

| Test | What it checks | Origin |
|---|---|---|
| [library → Studio → learner reads the text](../tests/studio/xblocks-core/html.spec.ts#L18) | Library round trip; the learner sees the text, and a `/static/` image URL is rewritten. | branch |
| [Text: the Add component data lists the packaged templates](../tests/studio/xblocks-core/studio-and-library.spec.ts#L87) | Studio's Add component data lists the Text variants shipped in `src/xblock_html/templates/html/` (announcement, anonymous user ID, iframe, raw HTML, zooming image). | branch |
| [authors bold and italic text in the editor](../tests/studio/components/text.spec.ts#L27) | Studio text editor saves formatted HTML. | main |
| [copies a component and pastes it into the unit](../tests/studio/components/clipboard.spec.ts#L23) | Copy/paste of a text component within a unit. | main |
| [creates a text block with the rich-text editor](../tests/studio/library/components.spec.ts#L34) | Library UI adds a text block. | main |
| [publishes a component and its status updates](../tests/studio/library/components.spec.ts#L175), [asks for confirmation before publishing…](../tests/studio/library/components.spec.ts#L206), [deletes a component after confirmation…](../tests/studio/library/components.spec.ts#L236), [shows a component in its hierarchy](../tests/studio/library/components.spec.ts#L257) | Library publish, delete and hierarchy flows on a text block. | main |
| [a published library component added to a unit reaches the learner](../tests/studio/library/reuse-component.spec.ts#L39) | A library text block reused in a course reaches the learner. | main |
| [library updates are accepted or rejected from the unit page…](../tests/studio/library/reuse-component.spec.ts#L108) | Upstream library changes sync, or are declined, in the course. | main |
| [estimates the effort of a text subsection](../tests/lms/course-home/effort.spec.ts#L17) | Course-home effort estimate from text content. | main |

## PDF (`pdf`)

| Test | What it checks | Origin |
|---|---|---|
| [library → Studio → learner sees the PDF viewer](../tests/studio/xblocks-core/pdf.spec.ts#L18) | Library round trip; the viewer's `src` is the authored URL. | branch |
| [adds a PDF component a learner can see](../tests/studio/components/pdf.spec.ts#L51) | The Advanced picker offers PDF; the learner sees the block. | main |
| [adds a PDF from the Advanced tile and sets its file in the editor](../tests/studio/components/pdf.spec.ts#L78) | Studio PDF editor sets an uploaded file; the block renders it. | main |
| [edits a PDF: replaces its file, hides the download link, links the source](../tests/studio/components/pdf.spec.ts#L123) | Editing PDF settings shows up for the learner. | main |
| [adds a PDF block from the Advanced / Other list](../tests/studio/library/components.spec.ts#L285) | Library UI adds a PDF block. | main |
| [a learner views a PDF block reused from a library](../tests/studio/library/pdf-from-library.spec.ts#L24) | A library PDF reused in a course reaches the learner. | main |

## Word Cloud (`word_cloud`)

| Test | What it checks | Origin |
|---|---|---|
| [library → Studio → learner submits words](../tests/studio/xblocks-core/word-cloud.spec.ts#L23) | Library round trip with non-default fields (3 inputs, boolean `display_student_percents`); the learner sees exactly 3 inputs and submitted words are recorded. | branch |
| [lists word_cloud in Advanced Settings, adds it from the tile and renders it](../tests/studio/components/advanced-modules.spec.ts#L306) | Added from Studio's Advanced tile; the learner submits words and the handler records them. | main |
| [adds the core advanced components (poll, survey, word cloud)](../tests/studio/components/advanced-types.spec.ts#L21) | The Advanced picker offers word cloud and the learner's outline lists it. | main |

## Annotatable (`annotatable`)

| Test | What it checks | Origin |
|---|---|---|
| [library → Studio → learner sees annotations](../tests/studio/xblocks-core/annotatable.spec.ts#L17) | Library round trip; instructions render exactly once and both annotations render. | branch |
| [Annotatable: its own Studio editor opens and saves](../tests/studio/xblocks-core/studio-and-library.spec.ts#L164) | Edit opens the block's own `studio_view` (`annotatable_editor.js` + CodeMirror); an edit to the XML saves. | branch |
| [lists annotatable in Advanced Settings, adds it from the tile and renders it](../tests/studio/components/advanced-modules.spec.ts#L306) | Enabled in Advanced Settings and added from the tile; the learner sees the annotation spans. | main |

## LTI 1.1 (`lti`)

| Test | What it checks | Origin |
|---|---|---|
| [library → Studio → learner sees the launch](../tests/studio/xblocks-core/lti.spec.ts#L18) | Library round trip of LTI fields (no real tool); the learner sees the block and its launch link. | branch |

## Discussion (`discussion`)

| Test | What it checks | Origin |
|---|---|---|
| [in a course: learner sees the inline discussion and a post](../tests/studio/xblocks-core/discussion.spec.ts#L76) | With the course on the `legacy` provider, a discussion block in a unit renders, and `discussion_bundle.js` lists a post made to its topic and toggles it. Needs the in-process forum (Tutor's `forum` plugin, initialized). | branch |

| [Discussion: the Studio preview renders its placeholder](../tests/studio/xblocks-core/studio-and-library.spec.ts#L206) | The Studio preview renders the block's Studio template, found through the discussion app's registration. | branch |

## Poll question (`poll_question`)

Covered only by the export/import test under All blocks (a poll with a question and answers). Its library round trip is broken on master (see below).

## Also run on `tutor dev` (editable install)

#244 makes the dev and prod asset paths the same, and developers get xblocks-core
as an editable install rather than a wheel, so a slim subset also runs against
`tutor dev`:

- **Setup:** `tutor mounts add <xblocks-core checkout>` (Tutor installs mounted
  `*xblock*` directories with `pip install -e /mnt/<name>` and bind-mounts them at
  runtime); no wheel. The webpack bundles are served straight from the checkout's
  `src/*/public/`, so `npm run build` must have been run there; collected-static
  files are served by Django's static finders from the checkout, with no
  `collectstatic`. A git **worktree** checkout also needs a `PKG-INFO` with a
  version at its root, because its `.git` file points outside the mount and
  setuptools-scm can't read a version.
- **Tests:** [Problem controls](../tests/studio/xblocks-core/problem/actions.spec.ts#L49)
  (LMS, Studio, library), [numerical preview](../tests/studio/xblocks-core/problem/static-inputs.spec.ts#L73)
  (LMS, Studio), the [Video round trip](../tests/studio/xblocks-core/video.spec.ts#L27),
  [Text templates](../tests/studio/xblocks-core/studio-and-library.spec.ts#L87) and
  [Discussion in a course](../tests/studio/xblocks-core/discussion.spec.ts#L76).
- **Result (2026-11-02):** all 9 pass (Problem controls in all three runtimes,
  numerical preview in LMS and Studio, Video, Text templates, Discussion), with
  xblocks-core editable from `/mnt/xblocks-core` and its bundles and `js/capa/…`
  files served straight from the checkout. On dev, the Django Debug Toolbar
  overlays the Studio and library previews, so the Problem harness hides it.

## Could not test / broken on master

Not validated on either target, so none of these can show a regression:

- *Broken on master, set aside as `test.fixme`:* [Poll question round trip](../tests/studio/xblocks-core/poll-question.spec.ts#L23) and [Discussion round trip](../tests/studio/xblocks-core/discussion.spec.ts#L157) (block never appears in the course's library picker); [custom JavaScript input](../tests/studio/xblocks-core/problem/static-inputs.spec.ts#L145) (master aborts Submit with `t(...).data(...) is not a function`; passes in the LMS on the refactor); [drag and drop v1 in Studio](../tests/studio/xblocks-core/problem/static-inputs.spec.ts#L215) (`requirejs.config is not a function`).
- *Broken on both:* an empty `poll_question` (no answers, a new poll's default) is dropped when its course is imported: its OLX parser requires an `<answer>`.
- *Fails on master only:* [uploads a transcript to a library video](../tests/studio/library/components.spec.ts#L101) (transcript never listed; passes on the refactor).
- *Target lacks the setup:* the demo-course tests in [unit-completion](../tests/lms/course-home/unit-completion.spec.ts) and [progress](../tests/lms/course-home/progress.spec.ts) (no `COURSE_KEY`), [Notes on text](../tests/lms/courseware/notes.spec.ts#L66) (no notes service), [custom Python grader](../tests/studio/unit/python-grader.spec.ts#L27) (no codejail).
- *Not implemented:* [Studio video transcript upload](../tests/studio/components/video.spec.ts#L63).

