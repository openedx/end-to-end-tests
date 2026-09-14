# Debugging a GitHub Actions run from its artifacts

Use this when the user hands you a CI run URL, a PR, or a run id and asks why
it failed. Everything needed is in the run's uploaded artifacts — you do not
need to reproduce locally first.

## What a `ci-tests` run uploads

`ci.yml` fans out to `run_tests_tutor.yml` once per release (`main` plus the
newest named release, e.g. `verawood`). Each Tutor job uploads three artifacts,
suffixed with the release:

| Artifact                      | Contents                                                                                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playwright-report-<release>` | `playwright-report/` (HTML report; `index.html` embeds the machine-readable report as a base64 zip; `data/` holds screenshots, videos, traces, `error-context.md`) and `test-results/` (one dir per failed attempt). |
| `suite-reports-<release>`     | `btr-coverage.json` (test_id → outcome) and `a11y-violations.json` (failing / baselined rules).                                                                                                                      |
| `tutor-logs-<release>`        | `docker ps -a` plus `tutor local logs <service>` for `lms`, `cms`, `lms-worker`, `cms-worker`, `mfe`, `caddy`. Lines are prefixed `<service>-1                                                                       | `.  |

Two things bite when reading them by hand: a **re-run attempt re-uploads
artifacts under the same names** (so `gh run download` mixes attempts), and
the Playwright JSON is **not a separate file** — it lives inside `index.html`.
The helper script handles both.

## The helper: `scripts/ci_artifacts.py`

Needs only Python 3.9+ and an authenticated `gh`. Always fetch into a temp
directory, never into the repo.

```sh
S=skills/openedx-e2e/scripts/ci_artifacts.py
D=$(mktemp -d)/ci-run

# 1. Fetch — accepts a run URL, run id, PR URL or PR number (→ newest ci-tests run for the PR head)
python3 $S fetch https://github.com/openedx/end-to-end-tests/actions/runs/34418344361 --dest $D
python3 $S fetch 43 --dest $D                    # PR number
python3 $S fetch <ref> --dest $D --only playwright,suite   # skip the ~1.5 MB/job Tutor logs
python3 $S fetch <ref> --dest $D --all-attempts  # keep every attempt as <name>-<artifact-id>/

# 2. Orient — one screen: jobs, per-release pass/fail/flaky, each failing test with its
#    first error line, most common error shapes, a11y + BTR totals, traceback/5xx counts per log
python3 $S summary $D

# 3. Drill into a test — every attempt's full error, failed steps, attachment paths,
#    and the error-context.md Playwright wrote for the failure
python3 $S test $D "instructor-paced"
python3 $S test $D "create-course.spec" --no-context

# 4. Correlate with the platform — tracebacks grouped by exception (with the last
#    edx-platform frame) and every 5xx Caddy served; or grep with context
python3 $S logs $D --service cms,caddy
python3 $S logs $D --service cms --grep 'course-v1:OpenedX\+E2EMTVIZQ6LW2' -C 2
python3 $S logs $D --grep 'POST /api/contentstore/v1/course_grading' -C 0
```

`fetch` also writes `run.json` (jobs, sha, PR numbers, artifact ids) and the
full runner log of each failed job as `job-<id>.log` (ANSI stripped). The
extracted report lands in `<artifact>/report/report.json` plus one JSON per
spec file, if you need fields the script does not print.

## Reading order

1. **`summary` first, and compare releases.** A failure only on `verawood`
   with `main` green is almost always a platform-version difference (see
   `references/releases.md`), not a broken test. A failure on both is the
   test or the fixture.
2. **Look at the error shapes, not the test names.** Six specs failing with
   the same `ApiError` from `authoredCourse` is one bug in a fixture or API
   client, not six test failures. Retries (`3 attempt(s)`) all failing the
   same way means deterministic; `flaky` means the retry passed.
3. **Identify the layer from the stack.** The error's `at …/src/api/…`,
   `…/src/fixtures/…`, `…/src/pages/…` frame tells you where the fix goes;
   `Before Hooks` / `Fixture "…"` in the failed steps means the test body
   never ran. Then apply the classification table in
   `references/debugging.md`.
4. **Use the body preview.** `ApiError` messages carry the first bytes of a
   non-JSON body: a `<title>Authentication</title>` page means the request
   was redirected to login (session/CSRF/host mismatch), a Django debug or
   `Server Error (500)` body means look in the Tutor logs.
5. **Correlate in the Tutor logs.** Grep the course key or username the test
   generated (they are in the error message) in `cms.log`/`lms.log`; the
   uWSGI request lines (`GET /path => generated N bytes … (HTTP/1.1 404)`)
   show the platform's view of the same call. `caddy.log` is JSON access
   logs — `"status":5xx` lines name the exact URI that blew up; `docker-ps.txt`
   shows whether a container was restarting.
6. **Ignore background noise.** `ItemNotFoundError: about:syllabus/effort/video`,
   `LookupError: No installed app with label 'credentials'`, and Redis
   unpickle `ValueError`s recur in every healthy run. `lms-worker.log` is
   large and almost never relevant. Only a traceback whose timestamp and
   course key line up with the failing test counts.
7. **Attachments.** `test` prints absolute paths for the screenshot, video,
   `error-context.md` and (on retries) `trace.zip`. Read the screenshot with the
   Read tool; open a trace with `npx playwright show-trace <path>`; `npx
playwright show-report $D/playwright-report-<release>/playwright-report`
   serves the HTML report locally.

## Rules

- The artifacts are evidence about a **CI installation**, whose settings live
  in `.ci/` and `run_tests_tutor.yml`. Before changing a spec, ask whether the
  cause is that environment (rate limits, `PREVENT_CONCURRENT_LOGINS`, missing
  flag on an older release) — see `references/running-tests.md`.
- A retry-then-pass (`flaky`) is still a bug to explain: find the race and
  fix it per `references/debugging.md` §4, don't add retries.
- Job logs and Tutor logs can contain secrets-shaped strings (tokens, session
  ids). Quote the minimum needed; never paste them into commits, issues, or docs.
- Artifacts expire (14 days for Tutor logs). If `fetch` reports `expired`, ask
  the user to re-run the workflow rather than guessing.
