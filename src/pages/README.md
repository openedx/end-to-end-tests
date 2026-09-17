# `src/pages/` — page objects

**Single responsibility:** hold locators and single-surface actions for one
screen. A page object knows how to find and operate elements on its page; it does
**not** compose multi-page flows (that is `steps/`) and it does **not** own
pass/fail assertions (that is the spec).

Page objects live in the same platform-domain folder as the specs that use them,
**one per surface** rather than one per spec:

- `pages/lms/catalog/catalog.page.ts` serves `tests/lms/catalog/discovery.spec.ts`
  and `enrollment.spec.ts`
- `pages/lms/course-home/course-outline.page.ts` serves
  `tests/lms/course-home/outline.spec.ts`
- `pages/studio/settings/schedule-details.page.ts` and `grading.page.ts` serve
  `tests/studio/settings/*.spec.ts`; each exposes `save(courseKey)`, which
  presses the settings save bar and returns the status of the write it causes
- `pages/studio/course-outline.page.ts` is the authoring MFE's course outline
  (build the section/subsection/unit tree, publish); `unit.page.ts` is the unit
  (container) page and `outline-configure.dialog.ts` the Configure dialog opened
  from an outline card (release dates, visibility, grading, prerequisites)
- `pages/studio/editors/text-editor.ts` and `video-editor.ts` drive the text
  (TinyMCE) and video component editors the add-component tiles open

- `pages/lms/instructor/dashboard.page.ts` is the instructor-dashboard MFE's shell
  (reach a tab by URL, prove it by its nav link, wait for the instructor-API
  request an action fires); the tab page objects (`course-info`, `enrollments`,
  `grading`, `date-extensions`, `data-downloads`, `certificates`) build on it and
  return the response of every write they trigger
- `pages/studio/library/` is the library-authoring MFE: `library.page.ts`
  (header, tabs, search / sort / filters, cards and their menus, the Add
  Content panel whose component buttons open the shared editors),
  `library-sidebar.ts` (info, publish status, the public-read switch),
  `library-container.page.ts`, `create-library.page.ts`,
  `library-picker.dialog.ts` (the course's "Library Content" picker — paginated,
  so it searches by title before selecting), `preview-changes.dialog.ts` (reads
  its footer structurally: a customized block swaps the sync for "Keep course
  content" as its primary), `course-libraries.page.ts` (reload-polls the Review
  tab, `LIB-002`) and `legacy-migration.page.ts` (searches the destination list
  by slug). Serves `tests/studio/library/`.

A component rendered _inside_ a surface — an XBlock in a unit — is a `*.block.ts`
object beside its page (`courseware/problem.block.ts`), constructed with the
page's content frame and the block ID.

Rules:

- Locator priority: test ID → stable attribute / role **without a localized
  name** → structural CSS. Never the platform's displayed text (see
  `ARCHITECTURE.md`); anchors come from `src/config/selectors/<surface>.ts`.
- Wait for the _cause_ of a state change (a response, a URL), never for a fixed
  time; web-first, auto-retrying interactions.
- Actions only — a page object never asserts.
- Depends only on `config/` (and, where needed, `api/`).
