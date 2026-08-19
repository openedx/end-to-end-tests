# `src/pages/` — page objects

**Single responsibility:** hold locators and single-surface actions for one
screen. A page object knows how to find and operate elements on its page; it does
**not** compose multi-page flows (that is `steps/`) and it does **not** own
pass/fail assertions (that is the spec).

The tree mirrors `tests/` by platform domain:

- `pages/lms/…` mirrors `tests/lms/…`
- `pages/studio/…` mirrors `tests/studio/…`

For example, `tests/lms/course-home/badges.spec.ts` →
`pages/lms/course-home/badges.page.ts`.

Rules:

- Locator priority: test-id → role / label / text → CSS containers only.
- Web-first, auto-retrying interactions; no fixed sleeps.
- Depends only on `config/` (and, where needed, `api/`).
