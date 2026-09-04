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
