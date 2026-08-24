# `src/steps/` — reusable business flows

**Single responsibility:** compose page objects (and API/data layers) into
reusable, multi-page business flows — e.g. "register an account", "enrol in a
course", "complete a unit".

Steps sit above page objects and below fixtures/specs. A step orchestrates
several single-surface actions into one meaningful user flow that multiple specs
can reuse.

Rules:

- No raw locators — call page-object methods instead.
- Steps perform actions and navigation; specs still own the assertions that
  decide pass/fail.
- Depends on `pages/`, `api/`, and `config/`.
